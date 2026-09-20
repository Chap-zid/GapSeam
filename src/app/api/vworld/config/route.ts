import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function authenticated(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!token || !apiKey) return false;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  if (!(await authenticated(request))) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const key = process.env.VWORD_API_KEY || process.env.VWORLD_API_KEY;
  if (!key) return NextResponse.json({ error: "VWorld is not configured" }, { status: 503 });
  const domain = (process.env.VWORD_DOMAIN || process.env.VWORLD_DOMAIN || request.nextUrl.host).replace(/^https?:\/\//, "").split("/")[0];
  return NextResponse.json({ key, domain }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
