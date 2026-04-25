/**
 * GET /api/libby/sync
 * Fetches the current chip state (loans + holds) in a single call to OverDrive.
 * Using one call eliminates the race/rate-limit risk of the old two-request pattern.
 */

import { request, Agent } from "undici";

const BASE_HOST = "sentry-read.svc.overdrive.com";
const UA = "OverDrive Media Console";
const agent = new Agent({ connect: { rejectUnauthorized: false } });

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return Response.json({ error: "No authorization header" }, { status: 401 });

  try {
    const resp = await request(`https://${BASE_HOST}/chip/sync`, {
      method: "GET",
      headers: { Authorization: auth, "User-Agent": UA, Accept: "application/json" },
      dispatcher: agent,
    });
    let text = "";
    for await (const chunk of resp.body) text += chunk;
    const data = text.trim() ? JSON.parse(text) : {};

    if (resp.statusCode === 401 || resp.statusCode === 403) {
      return Response.json(
        { error: "auth_expired", message: "Your Libby session has expired. Please reconnect." },
        { status: resp.statusCode }
      );
    }
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      return Response.json(
        { error: "sync_failed", message: "Could not reach Libby servers. Try again." },
        { status: resp.statusCode }
      );
    }

    return Response.json({
      loans: data.loans ?? [],
      holds: data.holds ?? [],
    });
  } catch (err) {
    return Response.json({ error: "network_error", message: String(err) }, { status: 502 });
  }
}
