import Link from "next/link";
import { db } from "@/lib/supabase";
import type { Post, PostState } from "@/lib/types";
import { AeoScore, SeverityBadge, StateBadge } from "@/components/Badges";
import { Toolbar } from "@/components/Toolbar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STATES: PostState[] = ["pending", "in-review", "approved", "needs-changes", "rejected"];

type Row = Pick<Post, "id" | "title" | "author_name" | "author_slug" | "category" | "published_at" | "audit_status" | "overall_severity" | "aeo_score" | "state" | "age_warning"> & {
  issues_total: number;
  issues_decided: number;
};

interface Search {
  author?: string;
  state?: string;
  q?: string;
  page?: string;
  sort?: string;
}

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const from = (page - 1) * PAGE_SIZE;

  let configured = true;
  let rows: Row[] = [];
  let total = 0;
  let authors: { slug: string; name: string; count: number }[] = [];
  let stats = { total: 0, audited: 0, approved: 0, pending: 0 };
  let errorMsg: string | null = null;

  try {
    let q = db()
      .from("posts")
      .select("id, title, author_name, author_slug, category, published_at, audit_status, overall_severity, aeo_score, state, age_warning", { count: "exact" });
    if (sp.author) q = q.eq("author_slug", sp.author);
    if (sp.state && STATES.includes(sp.state as PostState)) q = q.eq("state", sp.state);
    if (sp.q) q = q.ilike("title", `%${sp.q}%`);
    if (sp.sort === "aeo") q = q.order("aeo_score", { ascending: true, nullsFirst: false });
    else if (sp.sort === "oldest") q = q.order("published_at", { ascending: true });
    else q = q.order("published_at", { ascending: false });
    const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    total = count ?? 0;

    const ids = (data ?? []).map((p) => p.id);
    const { data: issueRows } = ids.length
      ? await db().from("issues").select("post_id, decision").in("post_id", ids)
      : { data: [] as { post_id: number; decision: string }[] };
    const agg = new Map<number, { t: number; d: number }>();
    for (const r of issueRows ?? []) {
      const a = agg.get(r.post_id) ?? { t: 0, d: 0 };
      a.t += 1;
      if (r.decision !== "pending") a.d += 1;
      agg.set(r.post_id, a);
    }
    rows = (data ?? []).map((p) => ({ ...(p as Omit<Row, "issues_total" | "issues_decided">), issues_total: agg.get(p.id)?.t ?? 0, issues_decided: agg.get(p.id)?.d ?? 0 }));

    const { data: all } = await db().from("posts").select("author_slug, author_name, audit_status, state");
    const byAuthor = new Map<string, { name: string; count: number }>();
    for (const p of all ?? []) {
      if (!p.author_slug) continue;
      const a = byAuthor.get(p.author_slug) ?? { name: p.author_name ?? p.author_slug, count: 0 };
      a.count += 1;
      byAuthor.set(p.author_slug, a);
    }
    authors = Array.from(byAuthor.entries())
      .map(([slug, v]) => ({ slug, ...v }))
      .sort((a, b) => b.count - a.count);
    stats = {
      total: all?.length ?? 0,
      audited: all?.filter((p) => p.audit_status === "audited").length ?? 0,
      approved: all?.filter((p) => p.state === "approved").length ?? 0,
      pending: all?.filter((p) => p.audit_status === "pending").length ?? 0,
    };
  } catch (e) {
    configured = false;
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Posts</h1>
          <p className="text-sm text-neutral-500">
            {stats.total} posts · {stats.audited} audited · {stats.approved} approved · {stats.pending} not yet audited
          </p>
        </div>
        <Toolbar pendingCount={stats.pending} />
      </div>

      {!configured && (
        <div className="rounded-hc border border-attention-300 bg-attention-50 p-4 text-sm text-attention-800">
          <p className="font-semibold">Database not reachable.</p>
          <p className="mt-1">
            Create the tables with <code>supabase/schema.sql</code> and set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>. Then click “Sync posts”.
          </p>
          {errorMsg && <p className="mt-2 font-mono text-xs text-attention-800">{errorMsg}</p>}
        </div>
      )}

      <form className="flex flex-wrap items-center gap-2 text-sm" action="/" method="get">
        <select name="author" defaultValue={sp.author ?? ""} className="rounded-hc border border-neutral-300 bg-white px-2 py-1">
          <option value="">All authors</option>
          {authors.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name} ({a.count})
            </option>
          ))}
        </select>
        <select name="state" defaultValue={sp.state ?? ""} className="rounded-hc border border-neutral-300 bg-white px-2 py-1">
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sp.sort ?? ""} className="rounded-hc border border-neutral-300 bg-white px-2 py-1">
          <option value="">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="aeo">Lowest AEO score first</option>
        </select>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search title" className="w-56 rounded-hc border border-neutral-300 px-2 py-1" />
        <button className="rounded-hc bg-neutral-900 px-3 py-1 text-white">Filter</button>
        {(sp.author || sp.state || sp.q || sp.sort) && (
          <Link href="/" className="text-neutral-500 underline">
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-hc border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Author</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Published</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">AEO</th>
              <th className="px-3 py-2">Issues</th>
              <th className="px-3 py-2">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-neutral-500">
                  {configured ? "No posts match. Run “Sync posts” to pull the blog." : "—"}
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="max-w-[520px] px-3 py-2">
                  <Link href={`/posts/${p.id}?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString()}`} className="font-medium text-neutral-900 hover:underline">
                    {p.title}
                  </Link>
                  {p.age_warning && <span className="ml-2 rounded-hc bg-attention-100 px-1 text-[10px] font-semibold text-attention-800">AGE WARNING</span>}
                </td>
                <td className="px-3 py-2 text-neutral-700">{p.author_name ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-500">{p.category ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-neutral-500">{p.published_at?.slice(0, 10) ?? "—"}</td>
                <td className="px-3 py-2">
                  {p.audit_status === "audited" ? <SeverityBadge value={p.overall_severity} /> : <span className="text-xs text-neutral-400">{p.audit_status}</span>}
                </td>
                <td className="px-3 py-2">
                  <AeoScore value={p.aeo_score} />
                </td>
                <td className="px-3 py-2 tabular-nums text-neutral-600">
                  {p.issues_total ? `${p.issues_decided}/${p.issues_total}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <StateBadge value={p.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-600">
        <span>
          Page {page} of {pages} · {total} posts
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={qs({ page: String(page - 1) })} className="rounded-hc border border-neutral-300 bg-white px-3 py-1">
              Previous
            </Link>
          )}
          {page < pages && (
            <Link href={qs({ page: String(page + 1) })} className="rounded-hc border border-neutral-300 bg-white px-3 py-1">
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
