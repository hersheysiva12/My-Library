/**
 * GET /api/series-date?series=...&author=...&pos=N
 *
 * Two-step approach:
 *  1. Google Custom Search — pulls live web snippets (Goodreads, Amazon, publisher sites)
 *  2. Claude Haiku — extracts the date from those snippets
 *
 * Falls back to Claude's training knowledge if CSE isn't configured.
 * Only returns FUTURE dates — past dates are rejected and return { date: null }.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CseItem {
  title?: string;
  snippet?: string;
  link?: string;
}

function parseDate(raw: string): string | null {
  const t = raw.trim();

  // Bail on explicit unknowns
  if (/unknown|not announced|no date|not sure|don't know|cannot|I don't/i.test(t)) {
    return null;
  }

  // YYYY-MM-DD
  const a = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (a) return `${a[1]}-${a[2]}-${a[3]}`;

  // YYYY-MM
  const b = t.match(/\b(20\d{2})-(\d{2})\b/);
  if (b) return `${b[1]}-${b[2]}-01`;

  // Named month + optional day + year
  const MONTH: Record<string, string> = {
    january:"01", february:"02", march:"03",    april:"04",  may:"05",      june:"06",
    july:"07",    august:"08",   september:"09", october:"10",november:"11", december:"12",
    jan:"01",     feb:"02",      mar:"03",        apr:"04",                   jun:"06",
    jul:"07",     aug:"08",      sep:"09",         oct:"10",  nov:"11",       dec:"12",
  };
  const lower = t.toLowerCase();
  for (const [name, num] of Object.entries(MONTH)) {
    const m1 = lower.match(new RegExp(name + "\\s+(\\d{1,2}),?\\s+(20\\d{2})"));
    if (m1) return `${m1[2]}-${num}-${m1[1].padStart(2, "0")}`;
    const m2 = lower.match(new RegExp(name + "\\s+(20\\d{2})"));
    if (m2) return `${m2[1]}-${num}-01`;
  }

  // Bare year
  const c = t.match(/\b(20\d{2})\b/);
  if (c) return `${c[1]}-07-01`;

  return null;
}

function isFuture(dateStr: string): boolean {
  try {
    return new Date(dateStr + "T12:00:00Z") > new Date();
  } catch {
    return false;
  }
}

async function webSearch(series: string, author: string, pos: string): Promise<string> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY ?? "";
  if (!braveKey) return "";

  const q = `"${series}" book ${pos} release date${author ? " " + author : ""}`;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": braveKey,
        "Accept": "application/json",
      } as Record<string, string>,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn("[series-date] Brave search error", res.status, errBody.slice(0, 200));
      return "";
    }
    const data = await res.json() as { web?: { results?: CseItem[] } };
    const results = data.web?.results ?? [];
    const snippets = results
      .slice(0, 5)
      .map(item => [item.title, item.snippet].filter(Boolean).join(" — "))
      .filter(s => s.length > 5)
      .join("\n");
    console.log("[series-date] Brave snippets:", snippets.slice(0, 300));
    return snippets;
  } catch (e) {
    console.warn("[series-date] Brave search failed:", e);
    return "";
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sp     = request.nextUrl.searchParams;
    const series = (sp.get("series") ?? "").trim();
    const author = (sp.get("author") ?? "").trim();
    const pos    = (sp.get("pos")    ?? "").trim();

    if (!series || !pos) return NextResponse.json({ date: null });

    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey)          return NextResponse.json({ date: null });

    // ── Step 1: web search for live context ──────────────────────────────────
    const searchContext = await webSearch(series, author, pos);

    // ── Step 1b: resolve which Claude model to use ───────────────────────────
    let model = "claude-3-5-sonnet-20241022"; // default, may be overridden
    try {
      const modelsRes = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } as Record<string, string>,
      });
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json() as { data?: Array<{ id: string }> };
        const ids = (modelsData.data ?? []).map(m => m.id);
        console.log("[series-date] Available models:", ids);
        // Prefer haiku (cheapest), then sonnet, then first available
        const picked = ids.find(id => id.toLowerCase().includes("haiku"))
          ?? ids.find(id => id.toLowerCase().includes("sonnet"))
          ?? ids[0];
        if (picked) model = picked;
      }
    } catch { /* keep default */ }
    console.log("[series-date] Using model:", model);

    // ── Step 2: Claude extracts (or recalls) the date ────────────────────────
    const prompt = searchContext
      ? [
          `Here are live Google search results about the release date for book ${pos} in the "${series}" series${author ? ` by ${author}` : ""}:`,
          "",
          searchContext,
          "",
          `Based on these search results, what is the exact release date for book ${pos} in the "${series}" series?`,
          'Reply with ONLY the date (e.g. "September 8, 2026") or "unknown" if the results don\'t clearly state a date. No other text.',
        ].join("\n")
      : // Fallback: ask from training knowledge
        [
          `What is the expected publication date for book ${pos} in the "${series}" series`,
          author ? ` by ${author}` : "",
          "?",
          '\nReply with ONLY the date (e.g. "September 2026" or "2026-09-15") or "unknown". No other text.',
        ].join("");

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      } as Record<string, string>,
      body: JSON.stringify({
        model,
        max_tokens: 40,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const body = await claudeRes.text().catch(() => "");
      console.error("[series-date] Claude API error", claudeRes.status, body.slice(0, 200));
      return NextResponse.json({ date: null });
    }

    const payload = (await claudeRes.json()) as {
      content?: Array<{ type: string; text: string }>;
    };
    const text = payload.content?.[0]?.text ?? "";
    console.log("[series-date] Claude:", JSON.stringify(text), searchContext ? "(with CSE context)" : "(training only)");

    const date = parseDate(text);
    if (!date) return NextResponse.json({ date: null, reason: "unknown" });

    if (!isFuture(date)) {
      console.log("[series-date] Past date:", date);
      return NextResponse.json({ date: null, reason: "past", pastDate: date });
    }

    return NextResponse.json({ date, reason: "found", source: searchContext ? "web" : "ai" });

  } catch (err) {
    console.error("[series-date] Unhandled error:", err);
    return NextResponse.json({ date: null });
  }
}
