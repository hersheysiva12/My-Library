/**
 * POST /api/libby/clone
 * Step 2: Clone the user's existing Libby identity into our anonymous chip.
 * Body: { token: string; code: string }
 *   token — identity from /api/libby/auth
 *   code  — the code the user copied from Libby "Copy To Another Device"
 * Returns { cards, loans, holds } on success.
 */

const BASE = "https://sentry-read.svc.overdrive.com";
const UA = "OverDrive Media Console";

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const text = await res.text();
    if (!text.trim()) return {};
    try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 500) }; }
  } catch { return {}; }
}

export async function POST(req: Request) {
  const { token, code } = await req.json() as { token: string; code: string };

  if (!token || !code) {
    return Response.json({ error: "token and code are required" }, { status: 400 });
  }

  // Clone the existing Libby identity into our chip
  let cloneRes: Response;
  let cloneData: Record<string, unknown>;
  try {
    cloneRes = await fetch(`${BASE}/chip/clone/code`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": UA,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      body: JSON.stringify({ code }),
    });
    cloneData = await safeJson(cloneRes);
  } catch (err) {
    return Response.json({ error: "Network error during clone.", debug: String(err) }, { status: 502 });
  }

  if (!cloneRes.ok) {
    return Response.json({
      error: "Invalid code — make sure you copied the code shown in Libby under 'Copy To Another Device'.",
      debug: { status: cloneRes.status, body: cloneData },
    }, { status: cloneRes.status });
  }

  // After clone, fetch the full sync state (cards, loans, holds)
  let syncData: Record<string, unknown> = {};
  try {
    const syncRes = await fetch(`${BASE}/chip/sync`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": UA,
        "Accept": "application/json",
      },
    });
    syncData = await safeJson(syncRes);
  } catch { /* use cloneData as fallback */ }

  type LibbyCard = { advantageKey?: string; cardName?: string; websiteId?: number };
  const cards: LibbyCard[] =
    (syncData.cards as LibbyCard[] | undefined) ??
    (cloneData.cards as LibbyCard[] | undefined) ??
    [];

  return Response.json({
    cards: cards.map((c) => ({
      advantageKey: c.advantageKey,
      websiteId: c.websiteId,
      cardName: c.cardName,
    })),
    loans: (syncData.loans ?? cloneData.loans ?? []) as unknown[],
    holds: (syncData.holds ?? cloneData.holds ?? []) as unknown[],
  });
}
