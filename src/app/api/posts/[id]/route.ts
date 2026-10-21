import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { recomputePost } from "@/lib/audit";
import type { PostState } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATES: PostState[] = ["pending", "in-review", "approved", "needs-changes", "rejected"];

/**
 * PATCH /api/posts/:id
 * { age_warning?: boolean, age_warning_text?: string, state_override?: PostState | null,
 *   bulk?: "accept-all" | "reject-all" | "reopen-all", actor?: string }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const postId = Number(id);
  const body = (await req.json().catch(() => ({}))) as {
    age_warning?: boolean;
    age_warning_text?: string;
    state_override?: PostState | null;
    bulk?: "accept-all" | "reject-all" | "reopen-all";
    actor?: string;
  };

  const patch: Record<string, unknown> = {};
  if (typeof body.age_warning === "boolean") patch.age_warning = body.age_warning;
  if (typeof body.age_warning_text === "string") patch.age_warning_text = body.age_warning_text;
  if (body.state_override === null) patch.state_override = null;
  else if (body.state_override && STATES.includes(body.state_override)) patch.state_override = body.state_override;

  if (Object.keys(patch).length) {
    const { error } = await db().from("posts").update(patch).eq("id", postId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ("state_override" in patch) {
      await db().from("decision_log").insert({ post_id: postId, action: "state-override", actor: body.actor ?? null, note: String(patch.state_override) });
    }
    if ("age_warning" in patch) {
      await db().from("decision_log").insert({ post_id: postId, action: patch.age_warning ? "age-warning-on" : "age-warning-off", actor: body.actor ?? null });
    }
  }

  if (body.bulk) {
    const decision = body.bulk === "accept-all" ? "accepted" : body.bulk === "reject-all" ? "rejected" : "pending";
    const q = db().from("issues").update({ decision, decided_by: body.actor ?? null, decided_at: decision === "pending" ? null : new Date().toISOString() }).eq("post_id", postId);
    // Bulk accept/reject only touches pending issues and never the full-rewrite card.
    const { error } = decision === "pending" ? await q : await q.eq("decision", "pending").neq("category", "rewrite");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db().from("decision_log").insert({ post_id: postId, action: body.bulk, actor: body.actor ?? null });
  }

  const post = await recomputePost(postId);
  return NextResponse.json({ post });
}
