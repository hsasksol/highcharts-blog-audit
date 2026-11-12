import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ORIGIN = "https://www.highcharts.com";
const headers = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function authed(req: NextRequest): Promise<boolean> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  try {
    const { payload } = await jwtVerify((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), new TextEncoder().encode(secret));
    return payload.p === "plan";
  } catch {
    return false;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers });
}

/**
 * Transfer store for WordPress block source (content.raw) during bulk edits (Bearer token, claim p="plan").
 * POST { id, kind, content }  kind: "raw" (as read from WP), "backup", "new" (to be written to WP)
 * GET ?id=&kind=
 */
export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const b = (await req.json().catch(() => ({}))) as { id?: number; kind?: string; content?: string };
  if (!Number.isFinite(Number(b.id)) || typeof b.content !== "string" || !b.content.length) return NextResponse.json({ error: "Bad request" }, { status: 400, headers });
  const kind = String(b.kind ?? "raw").slice(0, 40);
  const { error } = await db().from("wp_raw").upsert({ id: Number(b.id), kind, content: b.content, updated_at: new Date().toISOString() }, { onConflict: "id,kind" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });
  return NextResponse.json({ ok: true, id: Number(b.id), kind, length: b.content.length }, { headers });
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const id = Number(req.nextUrl.searchParams.get("id"));
  const kind = req.nextUrl.searchParams.get("kind") ?? "raw";
  const { data, error } = await db().from("wp_raw").select("id, kind, content, updated_at").eq("id", id).eq("kind", kind).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  return NextResponse.json(data, { headers });
}
