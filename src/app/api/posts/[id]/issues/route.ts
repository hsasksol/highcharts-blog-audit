import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/posts/:id/issues  Current post row + its issues. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const postId = Number(id);
  const [{ data: post }, { data: issues }] = await Promise.all([
    db().from("posts").select("*").eq("id", postId).single(),
    db().from("issues").select("*").eq("post_id", postId).order("sort_order"),
  ]);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ post, issues: issues ?? [] });
}
