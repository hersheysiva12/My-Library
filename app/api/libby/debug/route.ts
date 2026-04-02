/**
 * GET /api/libby/debug — returns raw chip/sync response for troubleshooting.
 * Delete this file after debugging is done.
 */
import { request, Agent } from "undici";

const agent = new Agent({ connect: { rejectUnauthorized: false } });

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return Response.json({ error: "No authorization header" }, { status: 401 });

  const resp = await request("https://sentry-read.svc.overdrive.com/chip/sync", {
    method: "GET",
    headers: { Authorization: auth, "User-Agent": "OverDrive Media Console", Accept: "application/json" },
    dispatcher: agent,
  });
  let text = "";
  for await (const chunk of resp.body) text += chunk;
  return new Response(text, { status: resp.statusCode, headers: { "Content-Type": "application/json" } });
}
