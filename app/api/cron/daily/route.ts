/**
 * GET /api/cron/daily
 *
 * Vercel cron — runs every day at 09:00 UTC.
 * Finds Libby loans where return_date <= today and status = 'reading',
 * marks them as 'read' with today as date_finished, then sends a single
 * digest email listing all expired loans.
 *
 * Emails are skipped in development (NODE_ENV !== "production").
 * DB updates always run regardless of email success/failure.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET
 *
 * Optional env vars:
 *   RESEND_API_KEY             — if absent, DB updates still run
 *   NOTIFICATION_EMAIL         — if absent, DB updates still run
 *   NEXT_PUBLIC_APP_URL        — used in "View your library" CTA button
 */

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}

interface ExpiredBook {
  id: string;
  title: string;
  author: string | null;
  return_date: string;
}

function buildExpiryEmail(
  expired: ExpiredBook[],
  today: string
): { subject: string; html: string } {
  const count = expired.length;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://your-library.vercel.app";

  const subject =
    count === 1
      ? `Your Libby loan for "${expired[0].title}" expired today`
      : `${count} Libby loans expired today — marked as read`;

  const listItems = expired
    .map(
      (b) => `
        <li style="margin-bottom: 8px;">
          <strong style="color: #4a3728;">${b.title}</strong>
          ${b.author ? `<span style="color: #5c4433;"> by ${b.author}</span>` : ""}
        </li>`
    )
    .join("");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px;
                margin: 0 auto; background: #fdf8f2;
                border: 1px solid #e8d9c4; border-radius: 8px; padding: 32px;">
      <h1 style="font-size: 22px; color: #4a3728; margin-top: 0; line-height: 1.3;">
        Libby Loan${count !== 1 ? "s" : ""} Expired Today
      </h1>
      <p style="color: #5c4433; font-size: 16px; line-height: 1.7;">
        ${
          count === 1
            ? `Your Libby loan for <strong><em>${expired[0].title}</em></strong> expired on ${today} and has been automatically marked as <strong>read</strong> in your library.`
            : `${count} Libby loans expired on ${today}. They've been automatically marked as <strong>read</strong> in your library.`
        }
      </p>
      ${count > 1 ? `
      <ul style="padding-left: 20px; margin: 0 0 20px;">
        ${listItems}
      </ul>` : ""}
      <p style="color: #5c4433; font-size: 15px; line-height: 1.7;">
        If you didn't finish ${count === 1 ? "it" : "any of them"}, you can update the status in your library.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${appUrl}"
           style="background: #6b4c3b; color: #fff; text-decoration: none;
                  padding: 14px 28px; border-radius: 6px; font-size: 16px;
                  font-family: Georgia, serif; letter-spacing: 0.03em; display: inline-block;">
          View your library →
        </a>
      </div>
      <p style="color: #9c7c6a; font-size: 13px; margin-bottom: 0; font-style: italic;">
        Sent by your Virtual Library.
      </p>
    </div>
  `.trim();

  return { subject, html };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
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

  const today = todayISO();

  // ── 2. Query expired Libby loans ──────────────────────────────────────────
  const { data: expiredBooks, error: queryErr } = await supabase
    .from("books")
    .select("id, title, author, return_date")
    .eq("format_source", "libby-loan")
    .eq("status", "reading")
    .not("return_date", "is", null)
    .lte("return_date", today);

  if (queryErr) {
    console.error("[daily] Expired loan query failed:", queryErr.message);
    return Response.json({ error: "db_query_failed" }, { status: 500 });
  }

  const expired: ExpiredBook[] = expiredBooks ?? [];

  if (expired.length === 0) {
    console.log("[daily] No expired Libby loans today");
    return Response.json({ expired: 0 });
  }

  console.log("[daily] Found", expired.length, "expired loan(s):", expired.map((b) => b.title));

  // ── 3. Mark all as 'read' in one batch update ─────────────────────────────
  const expiredIds = expired.map((b) => b.id);

  const { error: updateErr } = await supabase
    .from("books")
    .update({ status: "read", date_finished: today })
    .in("id", expiredIds);

  if (updateErr) {
    console.error("[daily] Status update failed:", updateErr.message);
    // Do not send email if DB update failed — avoid false reporting
    return Response.json({ error: "db_update_failed" }, { status: 500 });
  }

  console.log("[daily] Marked", expired.length, "book(s) as read");

  // ── 4. Dev guard ──────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    console.log("[daily] DEV MODE — DB updated; would send email:");
    expired.forEach((b) =>
      console.log(`  - "${b.title}"${b.author ? ` by ${b.author}` : ""} (expired ${b.return_date})`)
    );
    return Response.json({ expired: expired.length, dev: true });
  }

  // ── 5. Send single digest email ───────────────────────────────────────────
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATION_EMAIL) {
    console.warn("[daily] Missing email env vars — DB updates committed, email skipped");
    return Response.json({ expired: expired.length, emailed: false });
  }

  const { subject, html } = buildExpiryEmail(expired, today);

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
      console.error("[daily] Resend error", emailRes.status, errText.slice(0, 200));
      // DB is already updated and consistent — email failure is non-critical
      return Response.json({ expired: expired.length, emailed: false, error: "resend_failed" });
    }
  } catch (e) {
    console.error("[daily] Email threw:", e);
    return Response.json({ expired: expired.length, emailed: false, error: "email_threw" });
  }

  console.log("[daily] Sent expiry email for", expired.length, "loan(s)");
  return Response.json({ expired: expired.length, emailed: true });
}
