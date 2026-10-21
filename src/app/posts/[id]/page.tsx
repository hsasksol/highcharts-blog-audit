import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import type { Issue, Post, PostState } from "@/lib/types";
import { AuditView } from "@/components/AuditView";
import { isOlderThanFiveYears } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface Search {
  author?: string;
  state?: string;
  q?: string;
  sort?: string;
}

/** Neighbours in the same filtered, sorted list as the overview, so prev/next walks the queue. */
async function neighbours(post: Post, sp: Search): Promise<{ prev: number | null; next: number | null; position: number; total: number }> {
  let q = db().from("posts").select("id, published_at, aeo_score");
  if (sp.author) q = q.eq("author_slug", sp.author);
  if (sp.state) q = q.eq("state", sp.state as PostState);
  if (sp.q) q = q.ilike("title", `%${sp.q}%`);
  if (sp.sort === "aeo") q = q.order("aeo_score", { ascending: true, nullsFirst: false });
  else if (sp.sort === "oldest") q = q.order("published_at", { ascending: true });
  else q = q.order("published_at", { ascending: false });
  const { data } = await q;
  const ids = (data ?? []).map((p) => p.id as number);
  const idx = ids.indexOf(post.id);
  return {
    prev: idx > 0 ? ids[idx - 1] : null,
    next: idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null,
    position: idx + 1,
    total: ids.length,
  };
}

export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { data: post } = await db().from("posts").select("*").eq("id", Number(id)).single<Post>();
  if (!post) notFound();
  const { data: issues } = await db().from("issues").select("*").eq("post_id", post.id).order("sort_order").returns<Issue[]>();
  const nav = await neighbours(post, sp);
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return <AuditView post={post} issues={issues ?? []} nav={nav} query={query} suggestAgeWarning={isOlderThanFiveYears(post.published_at)} />;
}
