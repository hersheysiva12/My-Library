/**
 * GET /api/libby/poll
 * Polls chip/sync to check whether the user has entered our code in their Libby app.
 */

import { request, Agent } from "undici";

const BASE_HOST = "sentry-read.svc.overdrive.com";
const UA = "OverDrive Media Console";

const agent = new Agent({ connect: { rejectUnauthorized: false } });

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return Response.json({ error: "No authorization header" }, { status: 401 });

  let statusCode: number;
  let data: Record<string, unknown> = {};
  try {
    const resp = await request(`https://${BASE_HOST}/chip/sync`, {
      method: "GET",
      headers: { Authorization: auth, "User-Agent": UA, Accept: "application/json" },
      dispatcher: agent,
    });
    statusCode = resp.statusCode;
    let text = "";
    for await (const chunk of resp.body) text += chunk;
    try { data = text.trim() ? JSON.parse(text) : {}; } catch { data = { _raw: text.slice(0, 400) }; }
  } catch (err) {
    return Response.json({ error: "Network error", debug: String(err) }, { status: 502 });
  }

  if (statusCode < 200 || statusCode >= 300) {
    return Response.json({ error: "Sync check failed", status: statusCode, debug: data }, { status: statusCode });
  }

  const cards = (data.cards as { advantageKey?: string; cardName?: string; websiteId?: number }[] | undefined) ?? [];
  const synchronized = data.result === "synchronized" || cards.some((c) => c.advantageKey && c.cardName);

  return Response.json({
    synchronized,
    cards: synchronized ? cards.map((c) => ({ advantageKey: c.advantageKey, websiteId: c.websiteId, cardName: c.cardName })) : undefined,
    loans: synchronized ? (data.loans ?? []) : undefined,
    holds: synchronized ? (data.holds ?? []) : undefined,
    _debug: !synchronized ? { cardCount: cards.length, keys: Object.keys(data), sample: cards[0], result: data.result } : undefined,
  });
}
