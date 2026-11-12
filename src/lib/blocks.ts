import * as cheerio from "cheerio";
import type { Element } from "domhandler";

/**
 * WordPress block delimiters.
 *
 * The WP REST API's content.rendered has all <!-- wp:* --> comments stripped, so HTML copied from the
 * tool would land in "classic" mode when pasted into the block editor. This serializer walks the
 * top-level elements and wraps each one in the block comment the editor expects. Unknown or complex
 * markup is wrapped as a Custom HTML block, which the editor accepts as-is.
 */

const HEADING = /^h([1-6])$/;

function attrs(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj);
  return keys.length ? ` ${JSON.stringify(obj)}` : "";
}

function wrap(name: string, html: string, a: Record<string, unknown> = {}): string {
  return `<!-- wp:${name}${attrs(a)} -->\n${html}\n<!-- /wp:${name} -->`;
}

function listItems($: cheerio.CheerioAPI, el: Element): string {
  const items = $(el)
    .children("li")
    .map((_, li) => wrap("list-item", `<li>${$(li).html() ?? ""}</li>`))
    .get();
  return items.join("\n");
}

function serializeNode($: cheerio.CheerioAPI, el: Element): string {
  const tag = el.tagName.toLowerCase();
  const $el = $(el);
  const outer = $.html(el);
  const cls = $el.attr("class") ?? "";

  // Highsoft code block (hs-code container with copy button)
  if (tag === "div" && /\bhs-code-outer-container\b/.test(cls)) {
    return wrap("highsoft/hs-code", outer);
  }
  if (tag === "p") {
    const text = $el.text().replace(/ |&nbsp;/g, "").trim();
    if (!text && !$el.find("img, iframe, video, script").length) return ""; // drop empty spacer paragraphs
    if ($el.find("iframe, script, video").length) return wrap("html", outer);
    return wrap("paragraph", outer);
  }
  const h = HEADING.exec(tag);
  if (h) {
    const level = Number(h[1]);
    return wrap("heading", outer, level === 2 ? {} : { level });
  }
  if (tag === "ul") return wrap("list", `<ul class="wp-block-list">\n${listItems($, el)}\n</ul>`);
  if (tag === "ol") return wrap("list", `<ol class="wp-block-list">\n${listItems($, el)}\n</ol>`, { ordered: true });
  if (tag === "pre") {
    const code = $el.children("code").first();
    const inner = (code.length ? code.html() : $el.html()) ?? "";
    return wrap("code", `<pre class="wp-block-code"><code>${inner}</code></pre>`);
  }
  if (tag === "blockquote") {
    return wrap("quote", `<blockquote class="wp-block-quote">${$el.html() ?? ""}</blockquote>`);
  }
  if (tag === "figure" && $el.find("img").length && !$el.find("table").length) return wrap("image", outer);
  if (tag === "img") return wrap("image", `<figure class="wp-block-image"><img src="${$el.attr("src") ?? ""}" alt="${$el.attr("alt") ?? ""}"/></figure>`);
  if (tag === "table") return wrap("table", `<figure class="wp-block-table">${outer}</figure>`);
  if (tag === "figure" && $el.find("table").length) return wrap("table", outer);
  if (tag === "hr") return wrap("separator", '<hr class="wp-block-separator has-alpha-channel-opacity"/>');
  // Everything else (iframes, script, article/div wrappers, age-warning box, JSON-LD): Custom HTML block
  return wrap("html", outer);
}

/** Add WordPress block comments to a post body. Idempotent: input that already has block comments is returned unchanged. */
export function toBlockHtml(html: string): string {
  if (/<!--\s*wp:/.test(html)) return html;
  const $ = cheerio.load(html, { xml: { xmlMode: false, decodeEntities: false } } as Parameters<typeof cheerio.load>[1], false);
  const parts: string[] = [];
  let textBuffer = "";
  const flushText = () => {
    const t = textBuffer.trim();
    if (t) parts.push(wrap("paragraph", `<p>${t}</p>`));
    textBuffer = "";
  };
  for (const node of $.root().contents().toArray()) {
    if (node.type === "text") {
      textBuffer += (node as unknown as { data: string }).data;
      continue;
    }
    if (node.type === "comment") continue;
    if (node.type !== "tag" && node.type !== "script" && node.type !== "style") continue;
    flushText();
    const out = serializeNode($, node as Element);
    if (out) parts.push(out);
  }
  flushText();
  return parts.join("\n\n");
}
