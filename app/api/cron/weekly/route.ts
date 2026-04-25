/**
 * GET /api/cron/weekly
 *
 * Vercel cron — runs every Monday at 08:00 UTC.
 * Scans all unique authors in the library for Google Books releases in the
 * last 30 days, filters out books already owned, generates a warm digest
 * email via Claude claude-sonnet-4-6, and sends via Resend.
 *
 * Emails are skipped in development (NODE_ENV !== "production").
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET
 *   GOOGLE_BOOKS_API_KEY
 *   ANTHROPIC_API_KEY
 *   RESEND_API_KEY
 *   NOTIFICATION_EMAIL
 */

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────

interface GoogleBooksItem {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
  };
}

interface NewRelease {
  title: string;
  author: string;
  publishedDate: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Parse a Google Books publishedDate (YYYY, YYYY-MM, YYYY-MM-DD) to a Date. */
function parsePublishedDate(raw: string): Date | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + "T12:00:00Z");
  if (/^\d{4}-\d{2}$/.test(raw))       return new Date(raw + "-01T12:00:00Z");
  if (/^\d{4}$/.test(raw))             return new Date(raw + "-07-01T12:00:00Z");
  return null;
}

function isWithinLast30Days(raw: string): boolean {
  const d = parsePublishedDate(raw);
  if (!d) return false;
  const now = Date.now();
  return d.getTime() >= now - 30 * 24 * 60 * 60 * 1000 && d.getTime() <= now;
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function searchAuthorReleases(
  author: string,
  apiKey: string
): Promise<NewRelease[]> {
  const query = encodeURIComponent(`inauthor:"${author}"`);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&orderBy=newest&printType=books&maxResults=5&key=${apiKey}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    if (res.status === 429) throw new Error("rate_limited");
    console.warn("[weekly] Google Books non-OK for author:", author, res.status);
    return [];
  }
  const data = await res.json() as { items?: GoogleBooksItem[] };
  return (data.items ?? [])
    .filter((item) => isWithinLast30Days(item.volumeInfo?.publishedDate ?? ""))
    .map((item) => ({
      title: item.volumeInfo?.title ?? "Unknown Title",
      author,
      publishedDate: item.volumeInfo?.publishedDate ?? "",
    }));
}

async function generateDigestWithClaude(
  releases: NewRelease[],
  apiKey: string
): Promise<string> {
  const releaseList = releases
    .map((r) => `- "${r.title}" by ${r.author} (published ${r.publishedDate})`)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    } as Record<string, string>,
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system:
        "You are a warm, knowledgeable librarian who knows this reader's taste intimately. " +
        "Write in an excited, personal tone — like a trusted friend who loves books as much as the reader does.",
      messages: [
        {
          role: "user",
          content:
            `Here are new releases from authors in my personal library:\n\n${releaseList}\n\n` +
            "Write a 3–5 sentence excited email digest telling me about these new releases. " +
            "Be warm and specific. Do not include a subject line or greeting — just the body paragraphs. " +
            "Do not use markdown formatting. Plain prose only.",
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[weekly] Claude API error", res.status, errText.slice(0, 200));
    // Fallback: plain list
    return releases.map((r) => `"${r.title}" by ${r.author} was just published.`).join(" ");
  }

  const payload = await res.json() as {
    content?: Array<{ type: string; text: string }>;
  };
  return payload.content?.[0]?.text ?? "";
}

function buildDigestEmail(
  digestBody: string,
  releases: NewRelease[]
): { subject: string; html: string } {
  const count = releases.length;
  const subject =
    count === 1
      ? `New release from ${releases[0].author} — your weekly digest`
      : `${count} new releases from your favorite authors — weekly digest`;

  const listItems = releases
    .map(
      (r) => `
        <li style="margin-bottom: 8px;">
          <strong style="color: #4a3728;">${r.title}</strong>
          <span style="color: #5c4433;"> by ${r.author}</span>
          <span style="color: #9c7c6a; font-size: 13px;"> &mdash; ${r.publishedDate}</span>
        </li>`
    )
    .join("");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px;
                margin: 0 auto; background: #fdf8f2;
                border: 1px solid #e8d9c4; border-radius: 8px; padding: 32px;">
      <h1 style="font-size: 22px; color: #4a3728; margin-top: 0;">
        Your Weekly New Release Digest 📚
      </h1>
      <div style="color: #5c4433; font-size: 16px; line-height: 1.75; margin-bottom: 24px;">
        ${digestBody.replace(/\n\n/g, "</p><p style='color:#5c4433;font-size:16px;line-height:1.75;'>").replace(/\n/g, "<br/>")}
      </div>
      <hr style="border: none; border-top: 1px solid #e8d9c4; margin: 24px 0;" />
      <h2 style="font-size: 16px; color: #4a3728; margin-bottom: 12px;">New this week:</h2>
      <ul style="padding-left: 20px; margin: 0;">
        ${listItems}
      </ul>
      <p style="color: #9c7c6a; font-size: 13px; margin: 24px 0 0; font-style: italic;">
        Sent every Monday by your Virtual Library.
      </p>
    </div>
  `.trim();

  return { subject, html };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  try {
    return await weeklyHandler(req);
  } catch (err) {
    console.error("[weekly] Unhandled error:", err);
    return Response.json({ error: "internal_error", detail: String(err) }, { status: 500 });
  }
}

async function weeklyHandler(req: Request): Promise<Response> {
  // ── 1. Auth — enforced only when CRON_SECRET is set (skipped in local dev) ─
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: "Missing Supabase credentials" }, { status: 500 });
  }
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey);

  // ── 2. Fetch all unique authors ───────────────────────────────────────────
  const { data: authorRows, error: authorErr } = await supabase
    .from("books")
    .select("author")
    .not("author", "is", null);

  if (authorErr) {
    console.error("[weekly] Author query failed:", authorErr.message);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  const authors = [
    ...new Set(
      (authorRows ?? [])
        .map((r: { author: string | null }) => r.author?.trim())
        .filter((a): a is string => Boolean(a))
    ),
  ];

  if (authors.length === 0) {
    return Response.json({ sent: false, reason: "no_authors" });
  }

  // ── 3. Fetch existing titles for dedup ────────────────────────────────────
  const { data: existingRows } = await supabase.from("books").select("title");
  const existingTitles = new Set(
    (existingRows ?? []).map((r: { title: string }) => normalizeTitle(r.title))
  );

  // ── 4. Search Google Books — 5 authors per batch, 300ms between batches ───
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY ?? "";
  const allReleases: NewRelease[] = [];
  const BATCH = 5;

  for (let i = 0; i < authors.length; i += BATCH) {
    const batch = authors.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      batch.map((author) => searchAuthorReleases(author, apiKey))
    );

    let hitRateLimit = false;
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const release of result.value) {
          if (!existingTitles.has(normalizeTitle(release.title))) {
            allReleases.push(release);
          }
        }
      } else {
        console.warn("[weekly] Author search failed:", result.reason);
        if (String(result.reason).includes("rate_limited")) hitRateLimit = true;
      }
    }

    if (i + BATCH < authors.length) {
      await sleep(hitRateLimit ? 2000 : 300);
    }
  }

  // ── 5. No new releases ────────────────────────────────────────────────────
  if (allReleases.length === 0) {
    console.log("[weekly] No new releases found — skipping email");
    return Response.json({ sent: false, reason: "no_new_releases" });
  }

  // ── 6. Generate Claude digest ─────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  let digestBody: string;
  try {
    digestBody = await generateDigestWithClaude(allReleases, anthropicKey);
  } catch (e) {
    console.error("[weekly] Claude digest failed:", e);
    digestBody = allReleases
      .map((r) => `"${r.title}" by ${r.author} was just published on ${r.publishedDate}.`)
      .join(" ");
  }

  // ── 7. Dev guard ──────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    console.log("[weekly] DEV MODE — would send weekly digest:");
    console.log("  Releases found:", allReleases.length);
    allReleases.forEach((r) => console.log(`    - "${r.title}" by ${r.author}`));
    console.log("  Claude body:", digestBody);
    return Response.json({ sent: false, dev: true, count: allReleases.length });
  }

  // ── 8. Send via Resend ────────────────────────────────────────────────────
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATION_EMAIL) {
    console.warn("[weekly] Missing email env vars");
    return Response.json({ sent: false, reason: "no_email_config" });
  }

  const { subject, html } = buildDigestEmail(digestBody, allReleases);

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
      console.error("[weekly] Resend error", emailRes.status, errText.slice(0, 200));
      return Response.json({ sent: false, error: "resend_failed" });
    }
  } catch (e) {
    console.error("[weekly] Email threw:", e);
    return Response.json({ sent: false, error: "email_threw" });
  }

  console.log("[weekly] Sent digest:", allReleases.length, "releases");
  return Response.json({ sent: true, count: allReleases.length });
}
