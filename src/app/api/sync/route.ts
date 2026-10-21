import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { fetchAllWpPosts, fetchPageMeta, fetchSitemapPostUrls, normalizeWpPost } from "@/lib/wordpress";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CHUNK = 20;
const PARALLEL = 6;

/**
 * POST /api/sync  { offset?: number }
 * Pulls live blog posts (sitemap ∩ WP REST API) into Supabase in chunks of 25.
 * Call repeatedly with the returned next_offset until done === true.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { offset?: number };
  const offset = Math.max(0, Number(body.offset ?? 0));

  const [sitemapUrls, wpPosts] = await Promise.all([fetchSitemapPostUrls(), fetchAllWpPosts()]);
  const live = new Set(sitemapUrls);
  const posts = wpPosts.filter((p) => p.status === "publish" && live.has(p.link)).sort((a, b) => a.id - b.id);

  const slice = posts.slice(offset, offset + CHUNK);
  const ids = slice.map((p) => p.id);

  type Prev = { id: number; modified_at: string | null; author_name: string | null; existing_jsonld: unknown };
  const { data: existing } = await db()
    .from("posts")
    .select("id, modified_at, author_name, existing_jsonld")
    .in("id", ids.length ? ids : [-1]);
  const existingMap = new Map((existing ?? []).map((e) => [e.id as number, e as Prev]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  // Decide what each post needs, then fetch live-page metadata in parallel.
  type Job = { raw: (typeof slice)[number]; prev: Prev | undefined; mode: "skip" | "jsonld-only" | "full" };
  const jobs: Job[] = slice.map((raw) => {
    const prev = existingMap.get(raw.id);
    const modified = `${raw.modified_gmt}Z`;
    const unchangedContent = Boolean(prev && prev.modified_at && new Date(prev.modified_at).getTime() === new Date(modified).getTime() && prev.author_name);
    const mode: Job["mode"] = unchangedContent ? (prev?.existing_jsonld ? "skip" : "jsonld-only") : "full";
    return { raw, prev, mode };
  });

  const metas = new Map<number, Awaited<ReturnType<typeof fetchPageMeta>>>();
  const queue = jobs.filter((j) => j.mode !== "skip");
  let qi = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (qi < queue.length) {
        const job = queue[qi++];
        metas.set(job.raw.id, await fetchPageMeta(job.raw.link));
      }
    })
  );

  for (const { raw, prev, mode } of jobs) {
    if (mode === "skip") {
      unchanged += 1;
      continue;
    }
    const meta = metas.get(raw.id) ?? { author: null, jsonld: [] };
    if (mode === "jsonld-only") {
      await db().from("posts").update({ existing_jsonld: meta.jsonld }).eq("id", raw.id);
      unchanged += 1;
      continue;
    }
    const row = { ...normalizeWpPost(raw, meta.author ?? prev?.author_name ?? null), existing_jsonld: meta.jsonld };
    const payload = prev
      ? { ...row, fetched_at: new Date().toISOString(), audit_status: "pending" }
      : { ...row, fetched_at: new Date().toISOString() };
    const { error } = await db().from("posts").upsert(payload, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message, at: raw.id }, { status: 500 });
    if (prev) updated += 1;
    else inserted += 1;
  }

  const nextOffset = offset + CHUNK;
  return NextResponse.json({
    total: posts.length,
    sitemap_posts: sitemapUrls.length,
    processed: offset + slice.length,
    inserted,
    updated,
    unchanged,
    next_offset: nextOffset,
    done: nextOffset >= posts.length,
  });
}
