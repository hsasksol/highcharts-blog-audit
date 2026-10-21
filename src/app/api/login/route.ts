import { NextRequest, NextResponse } from "next/server";
import { cookieHeader, safeEqual, SESSION_HOURS, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Best-effort in-memory rate limit (per serverless instance)
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 30;
const WINDOW_MS = 15 * 60 * 1000;
function limited(ip: string): boolean {
  const now = Date.now();
  const e = attempts.get(ip);
  if (!e || now > e.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  e.count += 1;
  return e.count > MAX_ATTEMPTS;
}

/** POST /api/login  { username, password } */
export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) {
    const e = attempts.get(ip);
    const mins = e ? Math.max(1, Math.ceil((e.resetAt - Date.now()) / 60000)) : 15;
    return NextResponse.json({ error: `Too many failed attempts from this network. Try again in about ${mins} min.` }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const expectedUser = process.env.APP_USERNAME;
  const expectedPass = process.env.APP_PASSWORD;
  if (!expectedUser || !expectedPass || !process.env.JWT_SECRET) {
    return NextResponse.json({ error: "Server misconfiguration: set APP_USERNAME, APP_PASSWORD and JWT_SECRET" }, { status: 500 });
  }

  // Username is case-insensitive and whitespace-trimmed; password is trimmed only at the ends (copy/paste artefacts).
  const givenUser = String(body.username ?? "").trim().toLowerCase();
  const givenPass = String(body.password ?? "").trim();
  const [userOk, passOk] = await Promise.all([safeEqual(givenUser, expectedUser.trim().toLowerCase()), safeEqual(givenPass, expectedPass.trim())]);
  if (!userOk || !passOk) {
    const e = attempts.get(ip);
    const left = e ? Math.max(0, MAX_ATTEMPTS - e.count) : MAX_ATTEMPTS;
    return NextResponse.json({ error: `Invalid username or password (${left} attempts left before a 15 min lock).` }, { status: 401 });
  }

  const token = await signSession(expectedUser);
  const res = NextResponse.json({ ok: true, username: expectedUser });
  res.headers.set("Set-Cookie", cookieHeader(token, SESSION_HOURS * 3600));
  return res;
}
