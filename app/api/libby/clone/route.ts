/**
 * POST /api/libby/clone
 * Body: { token: string; code: string }
 *   token — identity from /api/libby/auth
 *   code  — the 8-digit code displayed by Libby under "Copy To Another Device"
 *
 * Clones the user's Libby identity into our anonymous chip, then fetches full sync state.
 * Returns { cards, loans, holds }
 */

import { request, Agent } from "undici";

const BASE = "sentry-read.svc.overdrive.com";
const UA = "OverDrive Media Console";
const agent = new Agent({ connect: { rejectUnauthorized: false } });

async function odRequest(
  path: string,
  method: "GET" | "POST",
  token: string,
  bodyData?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const resp = await request(`https://${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": UA,
      Accept: "application/json",
      ...(bodyData ? { "Content-Type": "application/json" } : {}),
    },
    body: bodyData ? JSON.stringify(bodyData) : undefined,
    dispatcher: agent,
  });
  let text = "";
  for await (const chunk of resp.body) text += chunk;
  let parsed: Record<string, unknown> = {};
  try { parsed = text.trim() ? JSON.parse(text) : {}; } catch { parsed = { _raw: text.slice(0, 500) }; }
  return { ok: resp.statusCode >= 200 && resp.statusCode < 300, status: resp.statusCode, body: parsed };
}

export async function POST(req: Request) {
  const { token, code } = await req.json() as { token: string; code: string };
  if (!token || !code) return Response.json({ error: "token and code are required" }, { status: 400 });

  // Clone the Libby identity into our chip
  let clone: Awaited<ReturnType<typeof odRequest>>;
  try {
    clone = await odRequest("/chip/clone/code", "POST", token, { code });
  } catch (err) {
    return Response.json({ error: "Network error during clone.", debug: String(err) }, { status: 502 });
  }

  if (!clone.ok) {
    return Response.json({
      error: "Invalid code — make sure you copied the code shown by Libby under 'Copy To Another Device'.",
      debug: { status: clone.status, body: clone.body },
    }, { status: 400 });
  }

  // Fetch full sync state (cards, loans, holds)
  let sync: Awaited<ReturnType<typeof odRequest>>;
  try {
    sync = await odRequest("/chip/sync", "GET", token);
  } catch (err) {
    return Response.json({ error: "Clone succeeded but failed to fetch library data.", debug: String(err) }, { status: 502 });
  }

  type LibbyCard = { advantageKey?: string; cardName?: string; websiteId?: number };
  const cards: LibbyCard[] = (sync.body.cards as LibbyCard[] | undefined) ?? [];

  return Response.json({
    cards: cards.map((c) => ({ advantageKey: c.advantageKey, websiteId: c.websiteId, cardName: c.cardName })),
    loans: (sync.body.loans ?? []) as unknown[],
    holds: (sync.body.holds ?? []) as unknown[],
    debug: { cloneBody: clone.body, syncKeys: Object.keys(sync.body) },
  });
}
