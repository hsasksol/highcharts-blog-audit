import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { NewIssue } from "./types";

/**
 * Layer 1: deterministic rules. Pure functions over the post's own content HTML
 * (WordPress content.rendered). Nothing from the page template is examined.
 */

type Rule = (html: string, $: cheerio.CheerioAPI) => NewIssue[] | Promise<NewIssue[]>;

const issue = (partial: Omit<NewIssue, "source" | "apply_mode"> & { apply_mode?: NewIssue["apply_mode"] }): NewIssue => ({
  source: "rule",
  apply_mode: partial.apply_mode ?? (partial.original_snippet != null && partial.suggested_snippet != null ? "replace" : "none"),
  ...partial,
});

/** Exact source slice of an element (htmlparser2 start/end indices), falling back to re-serialized HTML if it matches verbatim. */
function outer($: cheerio.CheerioAPI, el: Element, html: string): string | null {
  const start = (el as Element & { startIndex?: number }).startIndex;
  const end = (el as Element & { endIndex?: number }).endIndex;
  if (typeof start === "number" && typeof end === "number" && end >= start) {
    const slice = html.slice(start, end + 1);
    if (slice.startsWith("<")) return slice;
  }
  const s = $.html(el);
  return html.includes(s) ? s : null;
}

/** Parse with source positions and without entity decoding so slices match the original byte-for-byte. */
export function loadHtml(html: string): cheerio.CheerioAPI {
  return cheerio.load(html, { xml: { xmlMode: false, withStartIndices: true, withEndIndices: true, decodeEntities: false } } as Parameters<typeof cheerio.load>[1], false);
}

// ---------- 1. Technical correctness ----------

const DEPRECATED_PATTERNS: { re: RegExp; title: string; fix: (m: string) => string; why: string }[] = [
  {
    re: /new\s+Highcharts\.Chart\s*\(/g,
    title: "Replace `new Highcharts.Chart(` with `Highcharts.chart(`",
    fix: (m) => m.replace(/new\s+Highcharts\.Chart\s*\(/, "Highcharts.chart("),
    why: "The constructor form is the pre-v4 pattern; the factory function is the documented API.",
  },
  {
    re: /new\s+Highcharts\.StockChart\s*\(/g,
    title: "Replace `new Highcharts.StockChart(` with `Highcharts.stockChart(`",
    fix: (m) => m.replace(/new\s+Highcharts\.StockChart\s*\(/, "Highcharts.stockChart("),
    why: "The constructor form is the pre-v4 pattern; the factory function is the documented API.",
  },
  {
    re: /new\s+Highcharts\.Map\s*\(/g,
    title: "Replace `new Highcharts.Map(` with `Highcharts.mapChart(`",
    fix: (m) => m.replace(/new\s+Highcharts\.Map\s*\(/, "Highcharts.mapChart("),
    why: "The constructor form is the pre-v4 pattern; the factory function is the documented API.",
  },
  {
    re: /\$\(\s*['"][^'"]+['"]\s*\)\.highcharts\s*\(/g,
    title: "Replace the jQuery `.highcharts()` plugin call with `Highcharts.chart()`",
    fix: (m) => m.replace(/\$\(\s*(['"])([^'"]+)\1\s*\)\.highcharts\s*\(/, (_, q, sel) => `Highcharts.chart(${q}${String(sel).replace(/^#/, "")}${q}, `),
    why: "The jQuery adapter was removed in Highcharts 5. Modern code calls Highcharts.chart(containerId, options).",
  },
  {
    re: /global\s*:\s*\{\s*useUTC\s*:/g,
    title: "Move `global.useUTC` to `time.useUTC`",
    fix: (m) => m.replace("global", "time"),
    why: "The `global` option group was deprecated in Highcharts 6 in favour of `time`.",
  },
];

const deprecatedApi: Rule = (html) => {
  const out: NewIssue[] = [];
  for (const p of DEPRECATED_PATTERNS) {
    const seen = new Set<string>();
    for (const m of html.matchAll(p.re)) {
      const snippet = m[0];
      if (seen.has(snippet)) continue;
      seen.add(snippet);
      out.push(
        issue({
          axis: 1,
          category: "deprecated-api",
          severity: "major",
          title: p.title,
          description: p.why,
          original_snippet: snippet,
          suggested_snippet: p.fix(snippet),
        })
      );
    }
  }
  return out;
};

const pinnedCdn: Rule = (html) => {
  const out: NewIssue[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/https?:\/\/code\.highcharts\.com\/(\d+\.\d+(?:\.\d+)?)\/([a-z0-9\-\/_.]+\.js)/gi)) {
    const [full, version, file] = m;
    if (seen.has(full)) continue;
    seen.add(full);
    out.push(
      issue({
        axis: 1,
        category: "outdated-version",
        severity: "minor",
        title: `Pinned CDN version ${version} in script URL`,
        description: "The example loads a fixed, old Highcharts build. Readers copying it get an outdated library; the unversioned URL serves the current release.",
        original_snippet: full,
        suggested_snippet: `https://code.highcharts.com/${file}`,
      })
    );
  }
  return out;
};

const insecureLinks: Rule = (html, $) => {
  const out: NewIssue[] = [];
  const seen = new Set<string>();
  $("a[href^='http://'], img[src^='http://'], script[src^='http://'], iframe[src^='http://']").each((_, el) => {
    const attr = el.tagName === "a" ? "href" : "src";
    const url = $(el).attr(attr)!;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(
      issue({
        axis: 1,
        category: "broken-link",
        severity: "minor",
        title: `Insecure http:// URL: ${shorten(url)}`,
        description: "Use https:// so the reference works on the secure site and is not blocked as mixed content.",
        original_snippet: url,
        suggested_snippet: url.replace(/^http:\/\//, "https://"),
      })
    );
  });
  return out;
};

const LINK_TIMEOUT_MS = 6000;
const LINK_LIMIT = 60;

async function probe(url: string): Promise<{ ok: boolean; status: number | "error"; finalUrl: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), LINK_TIMEOUT_MS);
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; highcharts-blog-audit/1.0)" };
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal, headers });
    if (res.status === 405 || res.status === 403 || res.status === 404) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal, headers });
    }
    return { ok: res.ok, status: res.status, finalUrl: res.url };
  } catch {
    return { ok: false, status: "error", finalUrl: url };
  } finally {
    clearTimeout(t);
  }
}

const brokenLinks: Rule = async (html, $) => {
  const urls = new Map<string, string>(); // href -> link text
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!/^https?:\/\//i.test(href)) return;
    if (!urls.has(href)) urls.set(href, $(el).text().trim());
  });
  const list = Array.from(urls.entries()).slice(0, LINK_LIMIT);
  const out: NewIssue[] = [];
  const workers = 8;
  let i = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (i < list.length) {
        const [href, text] = list[i++];
        const r = await probe(href);
        if (r.ok) continue;
        if (r.status === 403 || r.status === 429) continue; // bot-blocked, not provably dead
        out.push(
          issue({
            axis: 1,
            category: "broken-link",
            severity: r.status === "error" ? "minor" : "major",
            title: `Dead link (${r.status}): ${shorten(href)}`,
            description: `The link "${text || href}" returns ${r.status}. Replace it with a working destination or remove the link.`,
            original_snippet: href,
            suggested_snippet: null,
          })
        );
      }
    })
  );
  return out;
};

/** Highsoft house format for code: wrapper + pre.wp-block-code > code + copy button (data-copy-code). */
export const COPY_BUTTON_HTML =
  '<div class="wp-block-highsoft-hs-button"><button type="button" class="hc-button hc-button--white hc-button--size-200" data-copy-code="true" aria-label="Copy"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="16" height="16"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 8V5.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C9.52 2 10.08 2 11.2 2h7.6c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C22 3.52 22 4.08 22 5.2v7.6c0 1.12 0 1.68-.218 2.108a2 2 0 0 1-.874.874C20.48 16 19.92 16 18.8 16H16M5.2 22h7.6c1.12 0 1.68 0 2.108-.218a2 2 0 0 0 .874-.874C16 20.48 16 19.92 16 18.8v-7.6c0-1.12 0-1.68-.218-2.108a2 2 0 0 0-.874-.874C14.48 8 13.92 8 12.8 8H5.2c-1.12 0-1.68 0-2.108.218a2 2 0 0 0-.874.874C2 9.52 2 10.08 2 11.2v7.6c0 1.12 0 1.68.218 2.108a2 2 0 0 0 .874.874C3.52 22 4.08 22 5.2 22"></path></svg>Copy</button></div>';

export function wrapCodeBlock(innerCodeHtml: string): string {
  return (
    '<div class="hs-code-outer-container"><div class="hs-code-container neutral-50-light neutral-800-dark" tabindex="0" role="region" aria-label="Code block">\n' +
    `<pre class="wp-block-code"><code>${innerCodeHtml}</code></pre>\n` +
    COPY_BUTTON_HTML +
    "\n</div></div>"
  );
}

/** Wrap any <pre> that is not already inside the house code container (used for LLM rewrites). */
export function normalizeCodeBlocks(html: string): string {
  if (!/<pre[\s>]/i.test(html)) return html;
  const $ = cheerio.load(html, { xml: { xmlMode: false, decodeEntities: false } } as Parameters<typeof cheerio.load>[1], false);
  $("pre").each((_, el) => {
    const $pre = $(el);
    if ($pre.closest(".hs-code-outer-container").length) return;
    const code = $pre.children("code").first();
    const inner = (code.length ? code.html() : $pre.html()) ?? "";
    $pre.replaceWith(wrapCodeBlock(inner));
  });
  return $.html();
}

/** Every <pre> must use the house code-block format with a copy button. */
const codeBlocks: Rule = (html, $) => {
  const out: NewIssue[] = [];
  $("pre").each((_, el) => {
    const $pre = $(el);
    const inStandard = $pre.closest(".hs-code-outer-container").length > 0;
    const code = $pre.children("code").first();
    const hasCopy = $pre.closest(".hs-code-outer-container").find("[data-copy-code]").length > 0;
    if (inStandard && code.length && hasCopy && $pre.hasClass("wp-block-code")) return;

    const inner = (code.length ? code.html() : $pre.html()) ?? "";
    if (inner.trim().length === 0) return;
    // If the block already sits in a wrapper (but is incomplete), replace the whole wrapper; otherwise replace the <pre>.
    const target = inStandard ? ($pre.closest(".hs-code-outer-container").get(0) as Element) : el;
    const original = outer($, target, html);
    const suggested = wrapCodeBlock(inner);
    const why = !inStandard
      ? "Code blocks on the blog use the standard container with a Copy button (hs-code-outer-container + pre.wp-block-code > code). This block is plain <pre>, so readers cannot copy it with one click and it renders differently from the rest of the blog."
      : "The code container is incomplete (missing <code>, the wp-block-code class or the Copy button). Replace it with the complete standard block.";
    out.push(
      issue({
        axis: 1,
        category: "code-format",
        severity: "major",
        title: inStandard ? "Complete the standard code block (copy button)" : "Convert code block to the standard copyable format",
        description: why,
        original_snippet: original,
        suggested_snippet: original ? suggested : null,
      })
    );
  });

  // Code pasted as paragraphs (lines of code inside <p> with <br>) is not a code block at all.
  $("p").each((_, el) => {
    const t = $(el).text();
    const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) return;
    const codey = lines.filter((l) => /[{};]\s*$|^(var|let|const|function|import|Highcharts\.|\$\(|<\/?[a-z]+)/.test(l)).length;
    if (codey / lines.length < 0.6) return;
    out.push(
      issue({
        axis: 1,
        category: "code-format",
        severity: "major",
        title: "Code is pasted as a paragraph instead of a code block",
        description: "These lines look like code but live in a <p>. Move them into the standard copyable code block so formatting, whitespace and the Copy button work.",
        original_snippet: outer($, el, html),
        suggested_snippet: null,
      })
    );
  });
  return out;
};

// ---------- 2. Structure & semantics ----------

const headingHierarchy: Rule = (html, $) => {
  const out: NewIssue[] = [];
  const levels: { level: number; el: Element }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    levels.push({ level: Number(el.tagName[1]), el });
  });

  for (const h of levels.filter((l) => l.level === 1)) {
    const original = outer($, h.el, html);
    out.push(
      issue({
        axis: 2,
        category: "structure",
        severity: "major",
        title: "H1 inside the post body",
        description: "The page title is already the H1. Body headings should start at H2 so the outline is valid and extractable.",
        original_snippet: original,
        suggested_snippet: original ? original.replace(/^<h1/, "<h2").replace(/<\/h1>$/, "</h2>") : null,
      })
    );
  }

  let prev = 1;
  for (const h of levels) {
    if (h.level > prev + 1) {
      const original = outer($, h.el, html);
      const want = prev + 1;
      out.push(
        issue({
          axis: 2,
          category: "structure",
          severity: "minor",
          title: `Skipped heading level (H${prev} → H${h.level})`,
          description: "Heading levels should not skip; a consistent outline helps readers, screen readers and answer engines segment the page.",
          original_snippet: original,
          suggested_snippet: original ? original.replace(new RegExp(`^<h${h.level}`), `<h${want}`).replace(new RegExp(`</h${h.level}>$`), `</h${want}>`) : null,
        })
      );
    }
    prev = h.level;
  }

  const wordCount = $.root().text().split(/\s+/).filter(Boolean).length;
  if (wordCount > 600 && levels.length === 0) {
    out.push(
      issue({
        axis: 2,
        category: "structure",
        severity: "major",
        title: "Long post with no subheadings",
        description: `About ${wordCount} words with no H2/H3. Split into sections with descriptive (ideally question-shaped) headings.`,
        original_snippet: null,
        suggested_snippet: null,
      })
    );
  }
  return out;
};

const imagesAlt: Rule = (html, $) => {
  const out: NewIssue[] = [];
  $("img").each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt && alt.trim()) return;
    const original = outer($, el, html);
    const src = $(el).attr("src") || "";
    const guess = src
      .split("/")
      .pop()
      ?.replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\d{6,}/g, "")
      .trim();
    const suggested = original ? (alt === undefined ? original.replace(/^<img/, `<img alt="${guess || "Chart"}"`) : original.replace(/alt=""/, `alt="${guess || "Chart"}"`)) : null;
    out.push(
      issue({
        axis: 2,
        category: "a11y",
        severity: "minor",
        title: `Image without alt text${guess ? ` (${guess})` : ""}`,
        description: "Alt text is required for accessibility and is the only way answer engines can interpret an image. Describe what the chart shows.",
        original_snippet: original,
        suggested_snippet: suggested,
      })
    );
  });
  $("iframe").each((_, el) => {
    if ($(el).attr("title")) return;
    const original = outer($, el, html);
    out.push(
      issue({
        axis: 2,
        category: "a11y",
        severity: "minor",
        title: "Embedded demo (iframe) has no title",
        description: "Give the iframe a title describing the demo so assistive tech and crawlers know what it contains.",
        original_snippet: original,
        suggested_snippet: original ? original.replace(/^<iframe/, '<iframe title="Highcharts demo"') : null,
      })
    );
  });
  return out;
};

const tablesHeaders: Rule = (html, $) => {
  const out: NewIssue[] = [];
  $("table").each((_, el) => {
    if ($(el).find("th").length) return;
    out.push(
      issue({
        axis: 2,
        category: "structure",
        severity: "minor",
        title: "Table without header cells",
        description: "Use <th> for the header row so the table is machine-readable and extractable as a comparison.",
        original_snippet: outer($, el, html),
        suggested_snippet: null,
      })
    );
  });
  return out;
};

// ---------- 3. Content & text quality ----------

const linkText: Rule = (html, $) => {
  const out: NewIssue[] = [];
  const bad = /^(click here|here|this|link|read more|more|this link|this page)$/i;
  $("a[href]").each((_, el) => {
    const text = $(el).text().trim();
    if (!bad.test(text)) return;
    out.push(
      issue({
        axis: 3,
        category: "style",
        severity: "minor",
        title: `Non-descriptive link text: "${text}"`,
        description: "Link text should say where the link goes. Answer engines and screen readers use it as the label for the destination.",
        original_snippet: outer($, el, html),
        suggested_snippet: null,
      })
    );
  });
  return out;
};

const emptyParagraphs: Rule = (html, $) => {
  const out: NewIssue[] = [];
  const seen = new Set<string>();
  $("p").each((_, el) => {
    const t = $(el).text().replace(/&nbsp;|&#160;|\u00a0/g, "").trim();
    if (t) return;
    if ($(el).find("img, iframe, br").length && !$(el).find("br").length) return;
    if ($(el).find("img, iframe").length) return;
    const original = outer($, el, html);
    if (!original || seen.has(original)) return;
    seen.add(original);
    out.push(
      issue({
        axis: 3,
        category: "style",
        severity: "info",
        title: "Empty paragraph (spacer)",
        description: "Leftover empty <p>&nbsp;</p> from the editor. Remove it; spacing should come from CSS.",
        original_snippet: original,
        suggested_snippet: "",
      })
    );
  });
  return out;
};

const RULES: Rule[] = [deprecatedApi, pinnedCdn, insecureLinks, brokenLinks, codeBlocks, headingHierarchy, imagesAlt, tablesHeaders, linkText, emptyParagraphs];

export async function runRules(html: string): Promise<NewIssue[]> {
  const $ = loadHtml(html);
  const results = await Promise.all(RULES.map((r) => r(html, $)));
  return results.flat();
}

function shorten(url: string, n = 70): string {
  return url.length > n ? `${url.slice(0, n - 1)}…` : url;
}
