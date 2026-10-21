import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** POST /api/reset { confirm: "RESET" }  Deletes all posts, issues and decisions. Run "Sync posts" afterwards. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "RESET") return NextResponse.json({ error: "Send { confirm: \"RESET\" }" }, { status: 400 });
  const a = await db().from("decision_log").delete().gte("id", 0);
  const b = await db().from("issues").delete().neq("post_id", -1);
  const c = await db().from("posts").delete().neq("id", -1);
  const err = a.error ?? b.error ?? c.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
