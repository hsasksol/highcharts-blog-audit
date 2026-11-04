import { cookies } from "next/headers";
import { db } from "@/lib/supabase";
import { COOKIE, verifyReportToken, verifySession } from "@/lib/auth";
import { ReportTable, type ReportRow } from "@/components/ReportTable";

export const dynamic = "force-dynamic";

function PasswordGate({ error }: { error?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form method="post" action="/api/report-login" className="w-full max-w-sm space-y-4 rounded-hc border border-neutral-100 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-bold">Blog audit report</h1>
          <p className="text-sm text-neutral-500">Enter the report password.</p>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Password</span>
          <input name="password" type="password" required autoFocus className="mt-1 w-full rounded-hc border border-neutral-200 px-3 py-2" />
        </label>
        {error && <p className="text-sm text-danger-700">{error}</p>}
        <button className="w-full rounded-hc bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-500">Open report</button>
      </form>
    </div>
  );
}

/** Read-only report behind a separate password (or the normal login): one row per audited post with the key findings. */
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const jar = await cookies();
  const [user, reportOk] = await Promise.all([verifySession(jar.get(COOKIE)?.value).catch(() => null), verifyReportToken(jar.get("hc_report")?.value).catch(() => false)]);
  if (!user && !reportOk) return <PasswordGate error={(await searchParams).error} />;

  const { data: posts } = await db()
    .from("posts")
    .select("id, title, url, author_name, author_slug, category, published_at, overall_severity, aeo_score, summary, historical, state, audit_status, excluded")
    .eq("audit_status", "audited")
    .eq("excluded", false)
    .order("aeo_score", { ascending: true, nullsFirst: false });

  const ids = (posts ?? []).map((p) => p.id);
  const { data: issueRows } = ids.length ? await db().from("issues").select("post_id, severity, category, title").in("post_id", ids) : { data: [] as { post_id: number; severity: string; category: string; title: string }[] };
  const agg = new Map<number, { total: number; major: number; dead: number; code: number; top: string[] }>();
  const rank: Record<string, number> = { blocker: 0, major: 1, minor: 2, info: 3 };
  for (const r of issueRows ?? []) {
    const a = agg.get(r.post_id) ?? { total: 0, major: 0, dead: 0, code: 0, top: [] };
    a.total += 1;
    if (r.severity === "major" || r.severity === "blocker") a.major += 1;
    if (r.category === "broken-link" && r.title.startsWith("Dead link")) a.dead += 1;
    if (r.category === "code-format" || r.category === "broken-code" || r.category === "deprecated-api") a.code += 1;
    agg.set(r.post_id, a);
  }
  // Top findings: the 3 most severe non-generic issue titles per post.
  const byPost = new Map<number, { severity: string; title: string; category: string }[]>();
  for (const r of issueRows ?? []) {
    const l = byPost.get(r.post_id) ?? [];
    l.push(r);
    byPost.set(r.post_id, l);
  }
  for (const [pid, list] of byPost) {
    const generic = /^(Suggested question-shaped headings|Accept the full suggested rewrite|Empty paragraph)/;
    const top = list
      .filter((i) => !generic.test(i.title))
      .sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
      .slice(0, 3)
      .map((i) => i.title);
    const a = agg.get(pid);
    if (a) a.top = top;
  }

  const rows: ReportRow[] = (posts ?? []).map((p) => {
    const a = agg.get(p.id) ?? { total: 0, major: 0, dead: 0, code: 0, top: [] };
    return {
      id: p.id,
      title: p.title,
      url: p.url,
      adminUrl: `https://www.highcharts.com/blog/wp-admin/post.php?post=${p.id}&action=edit`,
      author: p.author_name ?? p.author_slug ?? "",
      category: p.category ?? "",
      published: p.published_at?.slice(0, 10) ?? "",
      severity: p.overall_severity ?? "ok",
      aeo: p.aeo_score,
      issues: a.total,
      major: a.major,
      deadLinks: a.dead,
      code: a.code,
      historical: Boolean(p.historical),
      summary: p.summary ?? "",
      top: a.top,
      state: p.state,
    };
  });

  const authors = Array.from(new Set(rows.map((r) => r.author))).sort();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Blog audit report</h1>
        <p className="text-sm text-neutral-500">
          {rows.length} audited posts. Read-only overview; decisions are made in the <a href="/" className="text-brand-700 underline">audit tool</a>.
        </p>
      </div>
      <ReportTable rows={rows} authors={authors} />
    </div>
  );
}
