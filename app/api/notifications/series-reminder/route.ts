/**
 * POST /api/notifications/series-reminder
 * Body: { bookId: string }
 *
 * Fires when a book is marked "read". If the next book in the series isn't
 * in the library, sends a warm Libby hold-reminder email via Resend.
 * Deduplicates via notification_log — one email per book, ever.
 *
 * Emails are skipped in development (NODE_ENV !== "production") but the
 * notification_log row is still written so dedup behavior is testable locally.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_BOOKS_API_KEY        — for next-book title lookup
 *   RESEND_API_KEY
 *   NOTIFICATION_EMAIL
 *
 * Optional env vars:
 *   LIBBY_LIBRARY_SLUG          — e.g. "vaneck"; falls back to overdrive.com
 */

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ── Helpers ────────────────────────────────────────────────────────────────

function buildLibbyLink(title: string): string {
  const slug = process.env.LIBBY_LIBRARY_SLUG?.trim();
  if (slug) {
    return `https://libbyapp.com/search/${slug}/search/query-${encodeURIComponent(title)}`;
  }
  return `https://www.overdrive.com/search?q=${encodeURIComponent(title)}`;
}

async function lookupNextBookTitle(
  seriesName: string,
  nextPos: number
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) return null;

  const query = encodeURIComponent(`"${seriesName}" book ${nextPos}`);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3&printType=books&key=${apiKey}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      items?: Array<{
        volumeInfo?: {
          title?: string;
          seriesInfo?: { bookDisplayNumber?: string };
        };
      }>;
    };
    const items = data.items ?? [];
    if (items.length === 0) return null;

    // Prefer a result whose seriesInfo.bookDisplayNumber matches nextPos
    const exact = items.find(
      (it) => parseFloat(it.volumeInfo?.seriesInfo?.bookDisplayNumber ?? "") === nextPos
    );
    return (exact ?? items[0])?.volumeInfo?.title ?? null;
  } catch {
    return null;
  }
}

function buildEmail(
  finishedTitle: string,
  nextTitle: string | null,
  nextPos: number,
  seriesName: string,
  libbyLink: string
): { subject: string; html: string } {
  const nextDisplay = nextTitle ?? `Book ${nextPos} of ${seriesName}`;
  const subject = `You finished ${finishedTitle} — time to place your hold`;

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px;
                margin: 0 auto; background: #fdf8f2;
                border: 1px solid #e8d9c4; border-radius: 8px; padding: 32px;">
      <h1 style="font-size: 22px; color: #4a3728; margin-top: 0; line-height: 1.3;">
        Great reading! You just finished <em>${finishedTitle}</em>. 📚
      </h1>
      <p style="color: #5c4433; font-size: 16px; line-height: 1.7;">
        The next book in the <strong>${seriesName}</strong> series is
        <strong><em>${nextDisplay}</em></strong> — and it's not in your library yet.
        Libby hold queues can be long, so now is the perfect time to get in line.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${libbyLink}"
           style="background: #6b4c3b; color: #fff; text-decoration: none;
                  padding: 14px 28px; border-radius: 6px; font-size: 16px;
                  font-family: Georgia, serif; letter-spacing: 0.03em; display: inline-block;">
          Search for &ldquo;${nextDisplay}&rdquo; on Libby →
        </a>
      </div>
      <p style="color: #9c7c6a; font-size: 13px; margin-bottom: 0; font-style: italic;">
        Sent by your Virtual Library &mdash; happy reading!
      </p>
    </div>
  `.trim();

  return { subject, html };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // ── Parse body ────────────────────────────────────────────────────────────
  let bookId: string;
  try {
    const body = await req.json() as { bookId?: unknown };
    bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
    if (!bookId) return Response.json({ error: "bookId required" }, { status: 400 });
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Supabase client ───────────────────────────────────────────────────────
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("[series-reminder] Missing NEXT_PUBLIC_SUPABASE_URL");
    return Response.json({ skipped: "no_credentials" });
  }
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey);

  // ── 1. Fetch the finished book ────────────────────────────────────────────
  const { data: book, error: bookErr } = await supabase
    .from("books")
    .select("id, title, series_name, series_position")
    .eq("id", bookId)
    .single();

  if (bookErr || !book) {
    console.warn("[series-reminder] Book not found:", bookId, bookErr?.message);
    return Response.json({ skipped: "book_not_found" });
  }

  // ── 2. Must be in a series with a known position ──────────────────────────
  if (!book.series_name || book.series_position == null) {
    console.log("[series-reminder] Skipped — book has no series_name or series_position:", book.title);
    return Response.json({ skipped: "not_in_series" });
  }

  const seriesName: string = book.series_name;
  const currentPos: number = book.series_position;
  const nextPos = currentPos + 1;

  // ── 3. Check if next book already owned ───────────────────────────────────
  const { data: nextBook } = await supabase
    .from("books")
    .select("id")
    .eq("series_name", seriesName)
    .eq("series_position", nextPos)
    .maybeSingle();

  if (nextBook) {
    console.log(`[series-reminder] Skipped — Book ${nextPos} of "${seriesName}" already in library`);
    return Response.json({ skipped: "next_already_owned" });
  }

  // ── 4. Dedup via notification_log ─────────────────────────────────────────
  const { data: existingLog, error: logCheckErr } = await supabase
    .from("notification_log")
    .select("id")
    .eq("type", "series_hold_reminder")
    .eq("book_id", bookId)
    .maybeSingle();

  if (logCheckErr) {
    console.warn("[series-reminder] notification_log check failed (table may not exist yet):", logCheckErr.message);
    // Don't block — proceed as if not notified yet
  } else if (existingLog) {
    console.log("[series-reminder] Skipped — already sent notification for:", book.title);
    return Response.json({ skipped: "already_notified" });
  }

  // ── 5. Look up next book title via Google Books ───────────────────────────
  const nextTitle = await lookupNextBookTitle(seriesName, nextPos);
  const linkTitle = nextTitle ?? seriesName;
  const libbyLink = buildLibbyLink(linkTitle);
  const { subject, html } = buildEmail(book.title, nextTitle, nextPos, seriesName, libbyLink);

  // ── 6. Dev guard — log but don't send ────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    console.log("[series-reminder] DEV MODE — would send email:");
    console.log("  To:", process.env.NOTIFICATION_EMAIL);
    console.log("  Subject:", subject);
    console.log("  Next book:", nextTitle ?? `Book ${nextPos} of ${seriesName}`);
    console.log("  Libby link:", libbyLink);
    // Write DEV log so dedup is testable locally
    await supabase.from("notification_log").insert({
      type: "series_hold_reminder",
      book_id: bookId,
      message: `[DEV] Would email: ${book.title} → ${nextTitle ?? `Book ${nextPos} of ${seriesName}`}`,
    }).then(({ error }) => {
      if (error) console.warn("[series-reminder] notification_log insert failed:", error.message);
    });
    return Response.json({ sent: false, dev: true, nextTitle, libbyLink });
  }

  // ── 7. Send via Resend ────────────────────────────────────────────────────
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATION_EMAIL) {
    console.warn("[series-reminder] Missing RESEND_API_KEY or NOTIFICATION_EMAIL");
    return Response.json({ skipped: "no_email_config" });
  }

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: process.env.NOTIFICATION_EMAIL,
        subject,
        html,
      }),
    });
    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => "");
      console.error("[series-reminder] Resend error", emailRes.status, errText.slice(0, 200));
      // Do NOT log to notification_log — allow retry next time status changes to "read"
      return Response.json({ sent: false, error: "resend_failed" });
    }
  } catch (e) {
    console.error("[series-reminder] Email threw:", e);
    return Response.json({ sent: false, error: "email_threw" });
  }

  // ── 8. Log to notification_log ────────────────────────────────────────────
  const { error: logErr } = await supabase.from("notification_log").insert({
    type: "series_hold_reminder",
    book_id: bookId,
    message: `Emailed hold reminder: "${book.title}" → "${nextTitle ?? `Book ${nextPos} of ${seriesName}`}"`,
  });
  if (logErr) {
    // Non-critical — email was sent; dedup may re-send once more on next trigger
    console.warn("[series-reminder] notification_log insert failed:", logErr.message);
  }

  console.log("[series-reminder] Sent:", subject);
  return Response.json({ sent: true, nextTitle, libbyLink });
}
