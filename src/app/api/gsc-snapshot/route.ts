import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ORIGINS = ["https://search.google.com"];
const cors = (req: NextRequest) => {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

/**
 * POST /api/gsc-snapshot  (Bearer token, claim p="plan")
 * { days: 28, note?: string, rows: [[url, impressions], ...] }
 * Stores a Search Console "Generative AI features" impressions snapshot per URL, as a baseline for AEO changes.
 */
export async function POST(req: NextRequest) {
  const headers = cors(req);
  const secret = process.env.JWT_SECRET;
  try {
    if (!secret) throw new Error("no secret");
    const { payload } = await jwtVerify((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), new TextEncoder().encode(secret));
    if (payload.p !== "plan") throw new Error("scope");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const body = (await req.json().catch(() => ({}))) as { days?: number; note?: string; rows?: [string, number][] };
  const days = Number(body.days ?? 28);
  const today = new Date().toISOString().slice(0, 10);
  const rows = (body.rows ?? [])
    .filter((r) => Array.isArray(r) && typeof r[0] === "string" && r[0].startsWith("https://") && Number.isFinite(Number(r[1])))
    .slice(0, 5000)
    .map((r) => ({ captured_on: today, period_days: days, url: r[0].slice(0, 500), impressions: Math.round(Number(r[1])), note: body.note?.slice(0, 200) ?? null }));
  if (!rows.length) return NextResponse.json({ error: "No rows" }, { status: 400, headers });
  const { error } = await db().from("gsc_ai_snapshots").upsert(rows, { onConflict: "captured_on,period_days,url" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });
  return NextResponse.json({ ok: true, stored: rows.length, captured_on: today }, { headers });
}
