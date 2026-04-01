/**
 * GET /api/libby/poll
 * Fetch current chip sync state (cards, loans, holds).
 */

const BASE = "https://sentry-read.svc.overdrive.com";
const UA = "OverDrive Media Console";

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const text = await res.text();
    if (!text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return Response.json({ error: "No authorization header" }, { status: 401 });

  const res = await fetch(`${BASE}/chip/sync`, {
    headers: { Authorization: auth, "User-Agent": UA, Accept: "application/json" },
  });
  const data = await safeJson(res);

  if (!res.ok) {
    return Response.json({ error: "Sync check failed" }, { status: res.status });
  }

  const cards = (data.cards as { advantageKey?: string; cardName?: string; websiteId?: number }[] | undefined) ?? [];
  const synchronized = cards.some((c) => c.advantageKey && c.cardName);

  return Response.json({
    synchronized,
    cards: synchronized ? cards.map((c) => ({
      advantageKey: c.advantageKey,
      websiteId: c.websiteId,
      cardName: c.cardName,
    })) : undefined,
    loans: synchronized ? (data.loans ?? []) : undefined,
    holds: synchronized ? (data.holds ?? []) : undefined,
  });
}
