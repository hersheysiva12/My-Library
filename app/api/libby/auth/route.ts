/**
 * POST /api/libby/auth
 * Creates an anonymous device identity (chip).
 * Returns { token }
 *
 * The user then opens Libby → Copy To Another Device → copies the code Libby shows.
 * They enter that code in our UI, and /api/libby/clone completes the transfer.
 */

import { request, Agent } from "undici";

const agent = new Agent({ connect: { rejectUnauthorized: false } });

export async function POST() {
  let statusCode: number;
  let body: Record<string, unknown> = {};
  try {
    const resp = await request("https://sentry-read.svc.overdrive.com/chip?client=dewey", {
      method: "POST",
      headers: { "User-Agent": "OverDrive Media Console", Accept: "application/json" },
      dispatcher: agent,
    });
    statusCode = resp.statusCode;
    let text = "";
    for await (const chunk of resp.body) text += chunk;
    try { body = text.trim() ? JSON.parse(text) : {}; } catch { body = { _raw: text.slice(0, 400) }; }
  } catch (err) {
    return Response.json({ error: "Network error reaching Libby servers.", debug: String(err) }, { status: 502 });
  }

  const token =
    (body.identity as string | undefined) ??
    ((body.chip as Record<string, unknown> | undefined)?.identity as string | undefined);

  if (statusCode < 200 || statusCode >= 300 || !token) {
    return Response.json({ error: "Could not create device identity. Try again.", debug: { statusCode, body } }, { status: 502 });
  }

  return Response.json({ token });
}
