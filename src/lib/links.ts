import { db } from "./supabase";

/**
 * Dead-link checking with a shared cache (Supabase link_checks) and a polite per-host limiter,
 * so parallel audits never hammer highcharts.com or any other host.
 */

export interface LinkResult {
  ok: boolean;
  status: number | "error";
  finalUrl: string;
}

const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const LINK_TIMEOUT_MS = 5000;
const PER_HOST_CONCURRENCY = 2;
const PER_HOST_GAP_MS = 300;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; highcharts-blog-audit/1.0; +https://highcharts-blog-audit.vercel.app)" };

// Per-host limiter, shared within a serverless instance.
const hostState = new Map<string, { active: number; queue: (() => void)[]; last: number }>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

async function withHostSlot<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const st = hostState.get(host) ?? { active: 0, queue: [], last: 0 };
  hostState.set(host, st);
  if (st.active >= PER_HOST_CONCURRENCY) await new Promise<void>((r) => st.queue.push(r));
  st.active += 1;
  try {
    const wait = st.last + PER_HOST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    st.last = Date.now();
    return await fn();
  } finally {
    st.active -= 1;
    st.queue.shift()?.();
  }
}

async function probe(url: string): Promise<LinkResult> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), LINK_TIMEOUT_MS);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal, headers: UA });
    if (res.status === 405 || res.status === 403 || res.status === 404) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal, headers: UA });
    }
    return { ok: res.ok, status: res.status, finalUrl: res.url };
  } catch {
    return { ok: false, status: "error", finalUrl: url };
  } finally {
    clearTimeout(t);
  }
}

/** Check many URLs: cached results first, then live probes under the per-host limiter. */
export async function checkLinks(urls: string[]): Promise<Map<string, LinkResult>> {
  const out = new Map<string, LinkResult>();
  const unique = Array.from(new Set(urls));
  if (!unique.length) return out;

  const since = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const { data: cached } = await db().from("link_checks").select("url, ok, status, final_url").in("url", unique).gte("checked_at", since);
  for (const c of cached ?? []) {
    out.set(c.url, { ok: c.ok, status: c.status === "error" ? "error" : Number(c.status), finalUrl: c.final_url ?? c.url });
  }

  const todo = unique.filter((u) => !out.has(u));
  const fresh: { url: string; ok: boolean; status: string; final_url: string; checked_at: string }[] = [];
  await Promise.all(
    todo.map(async (url) => {
      const r = await withHostSlot(hostOf(url), () => probe(url));
      out.set(url, r);
      // Do not cache bot-blocked answers; they are not evidence either way.
      if (r.status !== 403 && r.status !== 429) {
        fresh.push({ url, ok: r.ok, status: String(r.status), final_url: r.finalUrl, checked_at: new Date().toISOString() });
      }
    })
  );
  if (fresh.length) await db().from("link_checks").upsert(fresh, { onConflict: "url" });
  return out;
}
