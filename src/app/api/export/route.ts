import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/export?state=approved  JSON of final HTML per post, for pasting/importing into WordPress. */
export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state") ?? "approved";
  const { data, error } = await db()
    .from("posts")
    .select("id, url, slug, title, author_name, state, age_warning, final_html, final_updated_at")
    .eq("state", state)
    .not("final_html", "is", null)
    .order("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: data?.length ?? 0, posts: data ?? [] });
}
