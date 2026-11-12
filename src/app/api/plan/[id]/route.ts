import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGIN = "https://www.highcharts.com";
const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  Vary: "Origin",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

/**
 * GET /api/plan/:id  (Authorization: Bearer <short-lived token signed with JWT_SECRET, claim p="plan">)
 * Read-only: the AEO (axis 4) suggestions for one post, without the schema.org card and without advisory-only items.
 * Used to apply AEO changes inside WordPress.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const secret = process.env.JWT_SECRET;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    if (!secret) throw new Error("no secret");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.p !== "plan") throw new Error("wrong scope");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
  }
  const { id } = await ctx.params;
  const postId = Number(id);
  const [{ data: post }, { data: issues }] = await Promise.all([
    db().from("posts").select("id, title, url").eq("id", postId).single(),
    db().from("issues").select("id, title, category, apply_mode, original_snippet, suggested_snippet, sort_order").eq("post_id", postId).eq("axis", 4).neq("category", "schema").neq("apply_mode", "none").order("sort_order"),
  ]);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404, headers: cors });
  const ops = (issues ?? [])
    .filter((i) => i.suggested_snippet != null && !/schema\.org|application\/ld\+json/i.test(`${i.title} ${i.suggested_snippet}`))
    .map((i) => ({ id: i.id, title: i.title, mode: i.apply_mode, original: i.original_snippet, suggested: i.suggested_snippet }));
  return NextResponse.json({ ...post, ops }, { headers: cors });
}
