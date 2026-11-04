import { db } from "./supabase";

/** Fetch issue rows for many posts without hitting PostgREST's 1000-row cap or URL length limits. */
export async function fetchIssuesForPosts<T extends string>(ids: number[], columns: T): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const CHUNK = 25;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await db().from("issues").select(columns).in("post_id", slice).range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      out.push(...rows);
      if (rows.length < 1000) break;
      from += 1000;
    }
  }
  return out;
}
