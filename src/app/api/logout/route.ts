import { NextResponse } from "next/server";
import { cookieHeader } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", cookieHeader("", 0));
  return res;
}
