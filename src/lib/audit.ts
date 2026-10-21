import { db } from "./supabase";
import { runRules } from "./rules";
import { reviewPost, reviewToIssues } from "./llm";
import { DEFAULT_AGE_WARNING, SEVERITY_RANK, type Issue, type NewIssue, type Post, type PostState, type Severity } from "./types";

const FIVE_YEARS_MS = 5 * 365.25 * 24 * 3600 * 1000;

export function isOlderThanFiveYears(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  return Date.now() - new Date(publishedAt).getTime() > FIVE_YEARS_MS;
}

/** Run Layer 1 + Layer 2 for one post and replace its issues. Preserves nothing: re-auditing resets decisions. */
export async function auditPost(postId: number, opts: { llm?: boolean } = {}): Promise<{ issues: number }> {
  const useLlm = opts.llm ?? true;
  const { data: post, error } = await db().from("posts").select("*").eq("id", postId).single<Post>();
  if (error || !post) throw new Error(error?.message ?? "Post not found");

  await db().from("posts").update({ audit_status: "running", audit_error: null }).eq("id", postId);

  try {
    const ruleIssues = await runRules(post.original_html);
    let llmIssues: NewIssue[] = [];
    let patch: Partial<Post> = {};

    if (useLlm) {
      const review = await reviewPost(post);
      llmIssues = reviewToIssues(review, post.original_html);
      patch = {
        summary: review.summary ?? null,
        overall_severity: review.overall_severity ?? null,
        historical: Boolean(review.historical),
        aeo_score: Number.isFinite(review.aeo_score) ? Math.max(0, Math.min(100, Math.round(review.aeo_score))) : null,
        suggested_html: review.suggested_content_html ?? null,
        aeo: review.aeo ?? null,
      };
    }

    const all = [...ruleIssues, ...llmIssues];
    const maxSev = all.reduce<Severity | null>((acc, i) => (!acc || SEVERITY_RANK[i.severity] > SEVERITY_RANK[acc] ? i.severity : acc), null);
    if (!useLlm) patch.overall_severity = maxSev ?? "ok";

    await db().from("issues").delete().eq("post_id", postId);
    if (all.length) {
      const rows = all.map((i, idx) => ({ ...i, post_id: postId, sort_order: idx }));
      const { error: insErr } = await db().from("issues").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    const ageWarningDefault = post.age_warning_text ?? DEFAULT_AGE_WARNING;
    await db()
      .from("posts")
      .update({
        ...patch,
        audit_status: "audited",
        audit_error: null,
        audited_at: new Date().toISOString(),
        age_warning_text: ageWarningDefault,
        state: post.state_override ?? "in-review",
        final_html: null,
        final_updated_at: null,
      })
      .eq("id", postId);

    await recomputePost(postId);
    return { issues: all.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db().from("posts").update({ audit_status: "error", audit_error: msg }).eq("id", postId);
    throw e;
  }
}

export function ageWarningHtml(text: string): string {
  return `<div class="hc-age-warning" style="display:flex;gap:12px;align-items:flex-start;border:1px solid #fcd34d;border-left:6px solid #f59e0b;background:#fffbeb;color:#78350f;padding:14px 18px;margin:0 0 28px;border-radius:8px;font-size:15px;line-height:1.5"><span aria-hidden="true" style="font-weight:700;font-size:18px;line-height:1.2">!</span><span><strong>Heads up:</strong> ${text}</span></div>`;
}

/** Build final HTML: original with accepted changes applied (or the accepted full rewrite), plus the age warning box if enabled. */
export function assembleFinalHtml(post: Pick<Post, "original_html" | "age_warning" | "age_warning_text">, issues: Issue[]): string {
  const accepted = issues.filter((i) => i.decision === "accepted");
  const rewrite = accepted.find((i) => i.category === "rewrite" && i.suggested_snippet);

  let html: string;
  if (rewrite) {
    html = rewrite.suggested_snippet!;
  } else {
    html = post.original_html;
    const prepends: string[] = [];
    const appends: string[] = [];
    for (const i of accepted) {
      if (i.apply_mode === "replace" && i.original_snippet != null && i.suggested_snippet != null) {
        if (html.includes(i.original_snippet)) html = html.replace(i.original_snippet, i.suggested_snippet);
      } else if (i.apply_mode === "prepend" && i.suggested_snippet) {
        prepends.push(i.suggested_snippet);
      } else if (i.apply_mode === "append" && i.suggested_snippet) {
        appends.push(i.suggested_snippet);
      }
    }
    html = [...prepends, html, ...appends].join("\n\n");
  }

  if (post.age_warning) {
    html = `${ageWarningHtml(post.age_warning_text ?? DEFAULT_AGE_WARNING)}\n\n${html}`;
  }
  return html;
}

export function computeState(issues: Issue[], audited: boolean): PostState {
  if (!audited) return "pending";
  if (!issues.length) return "approved";
  const d = issues.map((i) => i.decision);
  if (d.some((x) => x === "needs-changes")) return "needs-changes";
  if (d.every((x) => x === "pending")) return "in-review";
  if (d.every((x) => x !== "pending")) return d.every((x) => x === "rejected") ? "rejected" : "approved";
  return "in-review";
}

/** Recompute state + final_html for a post after any decision or toggle. */
export async function recomputePost(postId: number): Promise<Post> {
  const [{ data: post }, { data: issues }] = await Promise.all([
    db().from("posts").select("*").eq("id", postId).single<Post>(),
    db().from("issues").select("*").eq("post_id", postId).order("sort_order").returns<Issue[]>(),
  ]);
  if (!post) throw new Error("Post not found");
  const list = issues ?? [];
  const state = post.state_override ?? computeState(list, post.audit_status === "audited");
  const final_html = assembleFinalHtml(post, list);
  const { data: updated } = await db()
    .from("posts")
    .update({ state, final_html, final_updated_at: new Date().toISOString() })
    .eq("id", postId)
    .select("*")
    .single<Post>();
  return updated ?? { ...post, state, final_html };
}
