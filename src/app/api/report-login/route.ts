import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { SignJWT } from "jose";

export const dynamic = "force-dynamic";

export const REPORT_COOKIE = "hc_report";
const DAYS = 30;

const attempts = new Map<string, { count: number; resetAt: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const e = attempts.get(ip);
  if (!e || now > e.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  e.count += 1;
  return e.count > 30;
}

/** POST /api/report-login (form or JSON: password). Sets a 30-day cookie that unlocks /report only. */
export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const back = (msg: string) => NextResponse.redirect(new URL(`/report?error=${encodeURIComponent(msg)}`, req.url), 303);
  if (limited(ip)) return back("Too many attempts. Try again in 15 minutes.");

  const ct = req.headers.get("content-type") || "";
  let password = "";
  if (ct.includes("application/json")) password = String(((await req.json().catch(() => ({}))) as { password?: string }).password ?? "");
  else password = String((await req.formData().catch(() => null))?.get("password") ?? "");

  const expected = process.env.REPORT_PASSWORD;
  const secret = process.env.JWT_SECRET;
  if (!expected || !secret) return back("Report password is not configured (REPORT_PASSWORD).");
  if (!(await safeEqual(password.trim(), expected.trim()))) return back("Wrong password.");

  const token = await new SignJWT({ r: "report" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${DAYS}d`).sign(new TextEncoder().encode(secret));
  const res = NextResponse.redirect(new URL("/report", req.url), 303);
  const prod = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  res.headers.set("Set-Cookie", `${REPORT_COOKIE}=${token}; Path=/report; HttpOnly; SameSite=Strict; Max-Age=${DAYS * 86400}${prod ? "; Secure" : ""}`);
  return res;
}
