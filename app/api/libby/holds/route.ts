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
  if (!res.ok) return Response.json({ error: "Failed to fetch holds" }, { status: res.status });
  return Response.json({ holds: data.holds ?? [] });
}
