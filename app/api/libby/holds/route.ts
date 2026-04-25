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
    if (resp.statusCode < 200 || resp.statusCode >= 300)
      return Response.json({ error: "Failed to fetch holds" }, { status: resp.statusCode });
    return Response.json({ holds: data.holds ?? [] });
  } catch (err) {
    return Response.json({ error: "Network error", debug: String(err) }, { status: 502 });
  }
}
