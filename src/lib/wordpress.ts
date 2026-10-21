import * as cheerio from "cheerio";

export const SITE = "https://www.highcharts.com";
export const SITEMAP_URL = `${SITE}/sitemap.xml`;
export const WP_API = `${SITE}/blog/wp-json/wp/v2`;

/**
 * Only these /blog/<section>/<slug>/ paths are real blog posts in the sitemap.
 * Everything else under /blog/ (home, topic, posts, objective, data_type, chartchooser,
 * inspirations, paginated listings, embed samples) is a listing or a tool page.
 */
const POST_SECTIONS = ["tutorials", "news", "integration", "best-practices", "use-cases", "product-updates", "post", "webinars"];
const POST_RE = new RegExp(`^${SITE.replace(/\./g, "\\.")}/blog/(${POST_SECTIONS.join("|")})/[^/?#]+/$`);

const UA = { "User-Agent": "highcharts-blog-audit/1.0 (+internal content audit)" };

export function isBlogPostUrl(url: string): boolean {
  return POST_RE.test(url);
}

/** Live blog post URLs from the sitemap, sorted. */
export async function fetchSitemapPostUrls(): Promise<string[]> {
  const res = await fetch(SITEMAP_URL, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status}`);
  const xml = await res.text();
  const urls = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)).map((m) => m[1].trim());
  return Array.from(new Set(urls.filter(isBlogPostUrl))).sort();
}

export interface WpPostRaw {
  id: number;
  link: string;
  slug: string;
  status: string;
  date_gmt: string;
  modified_gmt: string;
  title: { rendered: string };
  content: { rendered: string };
  _embedded?: {
    "wp:term"?: { taxonomy: string; name: string; slug: string }[][];
  };
}

/** All published posts from the WP REST API (paginated, 100 per page). */
export async function fetchAllWpPosts(): Promise<WpPostRaw[]> {
  const out: WpPostRaw[] = [];
  let page = 1;
  for (;;) {
    const url = `${WP_API}/posts?status=publish&per_page=100&page=${page}&_embed=wp:term`;
    const res = await fetch(url, { headers: UA, cache: "no-store" });
    if (res.status === 400) break; // past last page
    if (!res.ok) throw new Error(`WP API page ${page} failed: ${res.status}`);
    const batch = (await res.json()) as WpPostRaw[];
    out.push(...batch);
    const totalPages = Number(res.headers.get("x-wp-totalpages") || "1");
    if (page >= totalPages || batch.length === 0) break;
    page += 1;
  }
  return out;
}

export async function fetchWpPost(id: number): Promise<WpPostRaw> {
  const res = await fetch(`${WP_API}/posts/${id}?_embed=wp:term`, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`WP API post ${id} failed: ${res.status}`);
  return (await res.json()) as WpPostRaw;
}

export interface PageMeta {
  author: string | null;
  /** All JSON-LD nodes on the live page (flattened @graph), as emitted by the site. */
  jsonld: Record<string, unknown>[];
}

/** Live page metadata: author display name and the existing JSON-LD, both from the page's ld+json blocks. */
export async function fetchPageMeta(pageUrl: string): Promise<PageMeta> {
  const meta: PageMeta = { author: null, jsonld: [] };
  try {
    const res = await fetch(pageUrl, { headers: UA, cache: "no-store" });
    if (!res.ok) return meta;
    const html = await res.text();
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        const data = JSON.parse(m[1]);
        const graph: unknown[] = Array.isArray(data?.["@graph"]) ? data["@graph"] : Array.isArray(data) ? data : [data];
        for (const node of graph as Record<string, unknown>[]) {
          if (!node || typeof node !== "object") continue;
          meta.jsonld.push(node);
          const t = node["@type"];
          const types = Array.isArray(t) ? t : [t];
          if (!meta.author && (types.includes("Article") || types.includes("BlogPosting"))) {
            const author = node.author as { name?: string } | undefined;
            if (author?.name) meta.author = author.name;
          }
        }
      } catch {
        /* ignore malformed block */
      }
    }
  } catch {
    /* network error: leave empty */
  }
  return meta;
}

/** @deprecated use fetchPageMeta */
export async function fetchDisplayAuthor(pageUrl: string): Promise<string | null> {
  return (await fetchPageMeta(pageUrl)).author;
}

export function decodeEntities(s: string): string {
  return cheerio.load(`<x>${s}</x>`)("x").text();
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, iframe").remove();
  return $.text().replace(/\s+/g, " ").trim();
}

export interface NormalizedPost {
  id: number;
  url: string;
  slug: string;
  title: string;
  author_name: string | null;
  author_slug: string | null;
  category: string | null;
  tags: string[];
  published_at: string;
  modified_at: string;
  word_count: number;
  original_html: string;
  original_text: string;
}

export function normalizeWpPost(raw: WpPostRaw, displayAuthor: string | null): NormalizedPost {
  const terms = (raw._embedded?.["wp:term"] ?? []).flat();
  const category = terms.find((t) => t.taxonomy === "category")?.name ?? null;
  const tags = terms.filter((t) => t.taxonomy === "post_tag").map((t) => t.name);
  const authorTerm = terms.find((t) => t.taxonomy === "author");
  const html = raw.content.rendered.trim();
  const text = htmlToText(html);
  return {
    id: raw.id,
    url: raw.link,
    slug: raw.slug,
    title: decodeEntities(raw.title.rendered),
    author_name: displayAuthor ?? authorTerm?.name ?? null,
    author_slug: authorTerm?.slug?.replace(/^cap-/, "") ?? null,
    category,
    tags,
    published_at: `${raw.date_gmt}Z`,
    modified_at: `${raw.modified_gmt}Z`,
    word_count: text ? text.split(/\s+/).length : 0,
    original_html: html,
    original_text: text,
  };
}
