/**
 * GET /api/cron/libby-sync
 *
 * Vercel cron job — runs daily at 7 AM UTC (configure in vercel.json).
 * Reads the stored Libby token from Supabase, syncs loans + holds,
 * and sends an email notification via Resend if new books are found.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL     — already present
 *   SUPABASE_SERVICE_ROLE_KEY    — server-side key; add in Vercel dashboard
 *   CRON_SECRET                  — auto-injected by Vercel
 *   RESEND_API_KEY               — optional; enables email notification
 *   NOTIFICATION_EMAIL           — optional; recipient for sync summary
 */

import { createClient } from "@supabase/supabase-js";
import { request, Agent } from "undici";
import {
  partitionLibbyBooks,
  type ODLoan,
  type ODHold,
} from "@/lib/libby-helpers";

// Constants are fine at module level — no side-effects
const BASE_HOST = "sentry-read.svc.overdrive.com";
const UA = "OverDrive Media Console";
const udAgent = new Agent({ connect: { rejectUnauthorized: false } });

export async function GET(req: Request) {
  // Verify Vercel cron request
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guard: both env vars must be present (won't be set in local dev)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Missing Supabase service-role credentials" }, { status: 500 });
  }

  // Create Supabase client inside handler so module-level init never runs without env vars
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Read stored Libby token
  const { data: tokenRow } = await supabase
    .from("libby_tokens")
    .select("token")
    .eq("id", 1)
    .single();

  if (!tokenRow?.token) {
    return Response.json({ skipped: "no token stored" }, { status: 200 });
  }

  // Fetch current loans + holds from OverDrive
  let loans: ODLoan[] = [];
  let holds: ODHold[] = [];

  try {
    const resp = await request(`https://${BASE_HOST}/chip/sync`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenRow.token}`,
        "User-Agent": UA,
        Accept: "application/json",
      },
      dispatcher: udAgent,
    });

    let text = "";
    for await (const chunk of resp.body) text += chunk;
    const data = text.trim() ? JSON.parse(text) : {};

    if (resp.statusCode === 401 || resp.statusCode === 403) {
      await supabase
        .from("libby_sync_log")
        .insert({ error: "auth_expired", new_loans: 0, new_holds: 0, updated: 0, skipped: 0 });
      return Response.json({ error: "auth_expired" }, { status: 200 });
    }

    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      const msg = `OverDrive returned ${resp.statusCode}`;
      await supabase
        .from("libby_sync_log")
        .insert({ error: msg, new_loans: 0, new_holds: 0, updated: 0, skipped: 0 });
      return Response.json({ error: msg }, { status: 200 });
    }

    loans = (data.loans ?? []) as ODLoan[];
    holds = (data.holds ?? []) as ODHold[];
  } catch (e) {
    const msg = String(e);
    await supabase
      .from("libby_sync_log")
      .insert({ error: msg, new_loans: 0, new_holds: 0, updated: 0, skipped: 0 });
    return Response.json({ error: msg }, { status: 502 });
  }

  // Fetch existing books for dedup
  const { data: existing } = await supabase
    .from("books")
    .select("id, google_books_id, title, author, status");

  const { loanRows, holdRows, loanUpdates, skipped } = partitionLibbyBooks(
    loans,
    holds,
    (existing ?? []) as Array<{
      id: string;
      google_books_id: string | null;
      title: string | null;
      author: string | null;
      status: string;
    }>
  );

  // Insert new rows
  if (loanRows.length > 0) {
    const { error: le } = await supabase.from("books").insert(loanRows);
    if (le) console.error("[cron libby insert loans]", le.message);
  }
  if (holdRows.length > 0) {
    const { error: he } = await supabase.from("books").insert(holdRows);
    if (he) console.error("[cron libby insert holds]", he.message);
  }

  // Update existing TBR books that are now active loans
  for (const { id, u } of loanUpdates) {
    await supabase.from("books").update(u).eq("id", id);
  }

  const new_loans = loanRows.length;
  const new_holds = holdRows.length;
  const updated = loanUpdates.length;

  // Log the sync
  await supabase.from("libby_sync_log").insert({
    new_loans,
    new_holds,
    updated,
    skipped,
  });

  // Email notification via Resend (only if new books were added)
  if (
    (new_loans + new_holds) > 0 &&
    process.env.RESEND_API_KEY &&
    process.env.NOTIFICATION_EMAIL
  ) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "onboarding@resend.dev", // replace with your verified Resend sender
          to: process.env.NOTIFICATION_EMAIL,
          subject: `📚 Libby sync: ${new_loans + new_holds} new book${new_loans + new_holds !== 1 ? "s" : ""} added`,
          html: `
            <p>Your morning Libby sync found new books:</p>
            <ul>
              ${new_loans > 0 ? `<li>${new_loans} new active loan${new_loans !== 1 ? "s" : ""}</li>` : ""}
              ${new_holds > 0 ? `<li>${new_holds} new hold${new_holds !== 1 ? "s" : ""}</li>` : ""}
              ${updated > 0 ? `<li>${updated} existing book${updated !== 1 ? "s" : ""} updated to active loan status</li>` : ""}
            </ul>
          `,
        }),
      });
    } catch (emailErr) {
      console.error("[cron libby email]", emailErr);
      // Email is non-critical — don't fail the cron
    }
  }

  return Response.json({ new_loans, new_holds, updated, skipped });
}
