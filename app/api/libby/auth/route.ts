/**
 * POST /api/libby/auth
 * Step 1: POST /v2/chip?client=dewey — creates an anonymous device identity.
 * Step 2: GET  /v2/chip/clone/code  — generates a time-limited code for the user to enter in Libby.
 * Returns { token, code, expiresIn }
 */

const BASE = "https://sentry.api.overdrive.com/v2";
const UA = "OverDrive Media Console";

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const text = await res.text();
    if (!text.trim()) return {};
    try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 500) }; }
  } catch { return {}; }
}

const HEADERS = {
  "User-Agent": UA,
  "Accept": "application/json",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

export async function POST() {
  // Step 1: create chip (anonymous device identity)
  let chipRes: Response;
  let chipData: Record<string, unknown>;
  try {
    chipRes = await fetch(`${BASE}/chip?client=dewey`, {
      method: "POST",
      headers: HEADERS,
    });
    chipData = await safeJson(chipRes);
  } catch (err) {
    return Response.json({ error: "Network error reaching Libby servers.", debug: String(err) }, { status: 502 });
  }

  // identity may be at top level or nested
  const token =
    (chipData.identity as string | undefined) ??
    ((chipData.chip as Record<string, unknown> | undefined)?.identity as string | undefined);

  if (!chipRes.ok || !token) {
    return Response.json({
      error: "Could not create device identity. Try again.",
      debug: { status: chipRes.status, body: chipData },
    }, { status: 502 });
  }

  // Step 2: generate the clone code the user types into their Libby app
  let codeRes: Response;
  let codeData: Record<string, unknown>;
  try {
    codeRes = await fetch(`${BASE}/chip/clone/code`, {
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });
    codeData = await safeJson(codeRes);
  } catch (err) {
    return Response.json({ error: "Failed to generate setup code. Network error.", debug: String(err) }, { status: 502 });
  }

  const code = codeData.code as string | undefined;
  const expiresIn = (codeData.expiresIn as number | undefined) ?? 60;

  if (!codeRes.ok || !code) {
    return Response.json({
      error: "Failed to generate a setup code. Try again.",
      debug: { status: codeRes.status, body: codeData },
    }, { status: 502 });
  }

  return Response.json({ token, code, expiresIn });
}
