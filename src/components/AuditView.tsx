"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AXES, DEFAULT_AGE_WARNING, type Axis, type Decision, type Issue, type Post, type PostState } from "@/lib/types";
import { AeoScore, DecisionBadge, SeverityBadge, StateBadge } from "./Badges";
import { Steps } from "./Steps";

interface Props {
  post: Post;
  issues: Issue[];
  nav: { prev: number | null; next: number | null; position: number; total: number };
  query: string;
  suggestAgeWarning: boolean;
}

const STATES: PostState[] = ["pending", "in-review", "approved", "needs-changes", "rejected"];

export function AuditView({ post: initialPost, issues: initialIssues, nav, query, suggestAgeWarning }: Props) {
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [issues, setIssues] = useState(initialIssues);
  const [view, setView] = useState<"original" | "audited" | "html">(initialPost.final_html ? "audited" : "original");
  const [htmlSource, setHtmlSource] = useState<"audited" | "original">("audited");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [warningText, setWarningText] = useState(initialPost.age_warning_text ?? DEFAULT_AGE_WARNING);

  const q = query ? `?${query}` : "";
  const audited = post.audit_status === "audited";
  const byAxis = useMemo(() => {
    const m: Record<Axis, Issue[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const i of issues) m[i.axis].push(i);
    return m;
  }, [issues]);
  const decided = issues.filter((i) => i.decision !== "pending").length;
  const allDecided = audited && issues.length > 0 && decided === issues.length;
  const stepDone = [audited, allDecided, post.age_warning || allDecided, false];
  const currentStep: 1 | 2 | 3 | 4 = !audited ? 1 : !allDecided ? 2 : !post.age_warning && suggestAgeWarning ? 3 : 4;

  async function patchPost(body: Record<string, unknown>) {
    const res = await fetch(`/api/posts/${post.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    setPost(data.post as Post);
    return data.post as Post;
  }

  async function decide(issue: Issue, decision: Decision, note?: string) {
    setBusy(issue.id);
    try {
      const res = await fetch(`/api/issues/${issue.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note: note ?? issue.note ?? null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setIssues((prev) => prev.map((i) => (i.id === issue.id ? (data.issue as Issue) : i)));
      setPost((p) => ({ ...p, state: data.post.state, final_html: data.post.final_html }));
      if (decision === "accepted") setView("audited");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function bulk(kind: "accept-all" | "reject-all" | "reopen-all" | "revert-original") {
    setBusy(kind);
    try {
      await patchPost({ bulk: kind });
      router.refresh();
      const res = await fetch(`/api/posts/${post.id}/issues`);
      if (res.ok) setIssues((await res.json()).issues as Issue[]);
      if (kind === "accept-all") setView("audited");
      if (kind === "revert-original") setView("original");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleAgeWarning(on: boolean) {
    setBusy("age");
    try {
      await patchPost({ age_warning: on, age_warning_text: warningText });
      if (on) setView("audited");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveWarningText() {
    setBusy("age");
    try {
      await patchPost({ age_warning_text: warningText });
    } finally {
      setBusy(null);
    }
  }

  async function runAudit() {
    setBusy("audit");
    setMsg("Running rules + editorial review…");
    try {
      const res = await fetch(`/api/audit/${post.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setMsg(`Audit done: ${data.issues} issues.`);
      router.refresh();
      const fresh = await fetch(`/api/posts/${post.id}/issues`).then((r) => r.json());
      setPost(fresh.post as Post);
      setIssues(fresh.issues as Issue[]);
      setWarningText(fresh.post.age_warning_text ?? DEFAULT_AGE_WARNING);
      setView("original");
    } catch (e) {
      setMsg(`Audit failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function copyHtml(which: "audited" | "original") {
    const html = which === "audited" ? (post.final_html ?? post.original_html) : post.original_html;
    try {
      await navigator.clipboard.writeText(html);
      setMsg(`${which === "audited" ? "Audited" : "Original"} HTML copied to clipboard.`);
    } catch {
      setHtmlSource(which);
      setView("html");
      setMsg("Clipboard blocked. Select the HTML below and copy it manually.");
    }
    setTimeout(() => setMsg(null), 3000);
  }

  const bodyHtml = view === "audited" ? (post.final_html ?? post.original_html) : post.original_html;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href={`/${q}`} className="hover:underline">
              ← Posts
            </Link>
            <span>·</span>
            <span>
              {nav.position}/{nav.total}
            </span>
            {nav.prev && (
              <Link href={`/posts/${nav.prev}${q}`} className="rounded-hc border border-neutral-300 bg-white px-2 py-0.5 hover:bg-neutral-50">
                Prev
              </Link>
            )}
            {nav.next && (
              <Link href={`/posts/${nav.next}${q}`} className="rounded-hc border border-neutral-300 bg-white px-2 py-0.5 hover:bg-neutral-50">
                Next
              </Link>
            )}
          </div>
          <h1 className="mt-1 text-xl font-bold leading-tight">{post.title}</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {post.author_name ?? "Unknown author"} · {post.category ?? "—"} · published {post.published_at?.slice(0, 10)} · modified {post.modified_at?.slice(0, 10)} · {post.word_count} words ·{" "}
            <a href={post.url} target="_blank" rel="noreferrer" className="text-brand-700 underline">
              live post
            </a>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex overflow-hidden rounded-hc border border-neutral-300 bg-white">
            <button onClick={() => setView("original")} className={`px-3 py-1.5 ${view === "original" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}>
              See original
            </button>
            <button onClick={() => setView("audited")} className={`px-3 py-1.5 ${view === "audited" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}>
              See audited page
            </button>
            <button onClick={() => setView("html")} className={`px-3 py-1.5 ${view === "html" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}>
              HTML
            </button>
          </div>
          <button onClick={() => copyHtml("audited")} title="Step 4: paste this into the WordPress code editor" className="rounded-hc border border-success-600 bg-success-600 px-3 py-1.5 font-medium text-white hover:bg-success-700 disabled:opacity-50">
            Copy audited HTML
          </button>
          <button onClick={runAudit} disabled={!!busy} title="Step 1" className="rounded-hc bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {busy === "audit" ? "Auditing…" : audited ? "Re-run audit" : "Run audit"}
          </button>
        </div>
      </div>
      <Steps current={currentStep} done={stepDone} />
      {msg && <div className="rounded-hc border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">{msg}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        {/* Content */}
        <article className="rounded-hc border border-neutral-200 bg-white p-6">
          {view === "html" ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-neutral-500">
                <div className="flex overflow-hidden rounded-hc border border-neutral-300 normal-case tracking-normal">
                  <button onClick={() => setHtmlSource("audited")} className={`px-2 py-1 ${htmlSource === "audited" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"} disabled:opacity-50`}>
                    Audited HTML
                  </button>
                  <button onClick={() => setHtmlSource("original")} className={`px-2 py-1 ${htmlSource === "original" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}>
                    Original HTML
                  </button>
                </div>
                <button onClick={() => copyHtml(htmlSource)} className="rounded-hc border border-neutral-300 bg-white px-2 py-1 normal-case tracking-normal hover:bg-neutral-50">
                  Copy to clipboard
                </button>
              </div>
              <textarea
                readOnly
                value={htmlSource === "audited" ? (post.final_html ?? post.original_html) : post.original_html}
                onFocus={(e) => e.currentTarget.select()}
                className="h-[70vh] w-full resize-y rounded-hc border border-neutral-300 bg-neutral-50 p-3 font-mono text-[12px] leading-5"
              />
              <p className="mt-2 text-xs text-neutral-500">Paste this into the WordPress code editor for the post. Audited HTML = original + accepted changes{post.age_warning ? " + age warning box" : ""}.</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-neutral-500">
                <span>{view === "audited" ? (audited ? "Audited page (accepted changes applied)" : "Audited page (no audit yet, only the age warning if enabled)") : "Original post content"}</span>
                {audited && view === "audited" && <span className="text-success-700">{decided}/{issues.length} decided</span>}
              </div>
              <div className="post-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </>
          )}
        </article>

        {/* Right column */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <section className="rounded-hc border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[color:var(--hc-ink)]">Audit</h2>
              <StateBadge value={post.state} />
            </div>
            {audited ? (
              <div className="mt-2 space-y-1 text-sm text-neutral-700">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1">
                    Severity <SeverityBadge value={post.overall_severity} />
                  </span>
                  <span>
                    AEO score <AeoScore value={post.aeo_score} /> / 100
                  </span>
                  {post.historical && <span className="rounded-hc bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-neutral-600">historical</span>}
                </div>
                {post.summary && <p className="text-neutral-600">{post.summary}</p>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">{post.audit_status === "error" ? `Last audit failed: ${post.audit_error}` : "Not audited yet. Click “Run audit”."}</p>
            )}
            {audited && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button onClick={() => bulk("accept-all")} disabled={!!busy} className="rounded-hc border border-success-300 bg-success-50 px-2 py-1 font-medium text-success-800 hover:bg-success-100 disabled:opacity-50">
                  Accept all pending
                </button>
                <button onClick={() => bulk("reject-all")} disabled={!!busy} className="rounded-hc border border-danger-300 bg-danger-50 px-2 py-1 font-medium text-danger-800 hover:bg-danger-100 disabled:opacity-50">
                  Reject all pending
                </button>
                <button onClick={() => bulk("reopen-all")} disabled={!!busy} className="rounded-hc border border-neutral-300 bg-white px-2 py-1 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                  Reopen all
                </button>
                <button onClick={() => bulk("revert-original")} disabled={!!busy} className="rounded-hc border border-neutral-400 bg-neutral-100 px-2 py-1 font-medium text-neutral-800 hover:bg-neutral-200 disabled:opacity-50" title="Undo every accepted change and the age warning. The original is never modified.">
                  Revert to original
                </button>
                <select
                  value={post.state_override ?? ""}
                  onChange={(e) => patchPost({ state_override: e.target.value ? (e.target.value as PostState) : null }).catch((err) => setMsg(String(err)))}
                  className="ml-auto rounded-hc border border-neutral-300 bg-white px-2 py-1"
                  title="Manual state override"
                >
                  <option value="">Auto state</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      Override: {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          {/* Age warning */}
          <section className={`rounded-hc border p-4 ${post.age_warning ? "border-attention-300 bg-attention-50" : suggestAgeWarning ? "border-attention-100 bg-white" : "border-neutral-200 bg-white"}`}>
            <label className="flex cursor-pointer items-start gap-2">
              <input type="checkbox" className="mt-1" checked={post.age_warning} disabled={busy === "age"} onChange={(e) => toggleAgeWarning(e.target.checked)} />
              <span>
                <span className="font-semibold"><span className="mr-1 text-neutral-400">Step 3</span>Add age warning box at the top of the post</span>
                {suggestAgeWarning && !post.age_warning && <span className="ml-2 rounded-hc bg-attention-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-attention-800">post is 5+ years old</span>}
                <span className="block text-xs text-neutral-500">Inserted into the audited HTML you copy into WordPress.</span>
              </span>
            </label>
            <textarea
              value={warningText}
              onChange={(e) => setWarningText(e.target.value)}
              onBlur={() => warningText !== (post.age_warning_text ?? "") && saveWarningText()}
              rows={3}
              className="mt-2 w-full rounded-hc border border-neutral-300 bg-white px-2 py-1 text-sm"
            />
          </section>

          {/* Issues by axis */}
          {audited && (
            <p className="px-1 text-xs text-neutral-500">
              <span className="font-semibold text-neutral-700">Step 2</span> Open each issue below and choose Accept audit, Reject or Needs changes. Accepted changes appear in “See audited page”.
            </p>
          )}
          {audited &&
            ([1, 2, 3, 4] as Axis[]).map((axis) => (
              <section key={axis} className="rounded-hc border border-neutral-200 bg-white p-4">
                <h3 className="text-base font-bold text-[color:var(--hc-ink)]">
                  {axis}. {AXES[axis]}
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    {byAxis[axis].length} {byAxis[axis].length === 1 ? "issue" : "issues"}
                  </span>
                </h3>
                {byAxis[axis].length === 0 && <p className="mt-1 text-sm text-neutral-400">Nothing found.</p>}
                <div className="mt-2 space-y-2">
                  {byAxis[axis].map((issue) => (
                    <IssueCard key={issue.id} issue={issue} busy={busy === issue.id} onDecide={decide} />
                  ))}
                </div>
              </section>
            ))}
        </aside>
      </div>
    </div>
  );
}

function IssueCard({ issue, busy, onDecide }: { issue: Issue; busy: boolean; onDecide: (i: Issue, d: Decision, note?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(issue.note ?? "");
  const decided = issue.decision !== "pending";
  const manual = issue.apply_mode === "none" && issue.suggested_snippet;

  return (
    <div className={`rounded-hc border p-2.5 text-sm ${issue.decision === "accepted" ? "border-success-100 bg-success-50/40" : issue.decision === "rejected" ? "border-neutral-200 bg-neutral-50 opacity-70" : issue.decision === "needs-changes" ? "border-attention-100 bg-attention-50/40" : "border-neutral-200"}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-2 text-left">
        <span className="font-medium leading-snug">{issue.title}</span>
        <span className="flex shrink-0 items-center gap-1">
          <SeverityBadge value={issue.severity} />
          {decided && <DecisionBadge value={issue.decision} />}
        </span>
      </button>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
        <span>{issue.category}</span>
        <span>·</span>
        <span>{issue.source === "rule" ? "rule" : "editor"}</span>
        {issue.apply_mode !== "none" && issue.apply_mode !== "replace" && <span>· {issue.apply_mode}</span>}
        {manual && <span className="text-attention-700">· manual</span>}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {issue.description && <p className="text-neutral-700">{issue.description}</p>}
          {issue.original_snippet && (
            <div>
              <div className="text-[11px] font-semibold uppercase text-danger-700">Original</div>
              <pre className="snippet border-danger-100 bg-danger-50 text-danger-800">{issue.original_snippet}</pre>
            </div>
          )}
          {issue.suggested_snippet != null && (
            <div>
              <div className="text-[11px] font-semibold uppercase text-success-700">{issue.suggested_snippet === "" ? "Suggested: remove" : "Suggested"}</div>
              {issue.suggested_snippet !== "" && <pre className="snippet border-success-100 bg-success-50 text-success-800">{issue.suggested_snippet}</pre>}
            </div>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-hc border border-neutral-300 px-2 py-1 text-xs" />
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {issue.decision !== "accepted" && (
          <button onClick={() => onDecide(issue, "accepted", note)} disabled={busy} className="rounded-hc bg-success-600 px-2 py-1 text-xs font-medium text-white hover:bg-success-700 disabled:opacity-50">
            Accept audit
          </button>
        )}
        {issue.decision !== "rejected" && (
          <button onClick={() => onDecide(issue, "rejected", note)} disabled={busy} className="rounded-hc border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
            Reject
          </button>
        )}
        {issue.decision !== "needs-changes" && (
          <button onClick={() => onDecide(issue, "needs-changes", note)} disabled={busy} className="rounded-hc border border-attention-300 bg-white px-2 py-1 text-xs font-medium text-attention-800 hover:bg-attention-50 disabled:opacity-50">
            Needs changes
          </button>
        )}
        {decided && (
          <button onClick={() => onDecide(issue, "pending", note)} disabled={busy} className="rounded-hc px-2 py-1 text-xs text-neutral-600 underline disabled:opacity-50" title="Back to pending; an accepted change is removed from the audited HTML">
            {issue.decision === "accepted" ? "Undo change" : "Reopen"}
          </button>
        )}
      </div>
    </div>
  );
}
