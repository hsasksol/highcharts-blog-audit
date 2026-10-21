import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { recomputePost } from "@/lib/audit";
import type { Decision } from "@/lib/types";

export const dynamic = "force-dynamic";

const DECISIONS: Decision[] = ["pending", "accepted", "rejected", "needs-changes"];

/** PATCH /api/issues/:id  { decision, note?, actor? } */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: Decision; note?: string; actor?: string };
  if (!body.decision || !DECISIONS.includes(body.decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }
  const { data: issue, error } = await db()
    .from("issues")
    .update({
      decision: body.decision,
      note: body.note ?? null,
      decided_by: body.actor ?? null,
      decided_at: body.decision === "pending" ? null : new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !issue) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  await db().from("decision_log").insert({
    post_id: issue.post_id,
    issue_id: issue.id,
    action: body.decision === "pending" ? "reopened" : body.decision,
    actor: body.actor ?? null,
    note: body.note ?? null,
  });

  const post = await recomputePost(issue.post_id);
  return NextResponse.json({ issue, post: { state: post.state, final_html: post.final_html } });
}
