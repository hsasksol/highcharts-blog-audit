import Anthropic from "@anthropic-ai/sdk";
import { normalizeCodeBlocks } from "./rules";
import { CATEGORY_AXIS, type AeoArtifacts, type IssueCategory, type NewIssue, type Post, type Severity } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const SYSTEM = `You are a senior technical editor auditing a single blog post from the Highcharts blog (highcharts.com/blog). Highcharts is a JavaScript charting library by Highsoft (products: Highcharts Core, Stock, Maps, Gantt, Dashboards, Grid, Orbit).

You receive the post's own body HTML (WordPress content only, nothing from the page template). Audit it across four axes and return ONE JSON object matching the output contract below, no prose before or after it.

AXES
1. Technical correctness: broken/deprecated Highcharts API usage, old call patterns, wrong code, references to removed features, malformed markup inside the body.
2. Structure & semantics: heading hierarchy and descriptiveness, section order, walls of text, lists/tables/steps where content is enumerable, alt text, tables with headers.
3. Content & text quality: factual accuracy and currency (versions, dates, claims), clarity, buried lead, undefined jargon, terminology and product-name consistency (Highcharts, Highcharts Stock, Highcharts Maps, Highcharts Gantt, Highcharts Dashboards, Highsoft), voice.
4. AEO optimization (answer-engine optimization) - the priority axis. Make the post citable by ChatGPT, Perplexity, Google AI Overviews, Gemini and Copilot:
   - Answer-first: the core question should be answered in the first 40-60 words. If buried, propose a lead-answer paragraph.
   - Question-shaped headings: turn vague headings into the natural question a reader asks ("How do I ...", "What is ...", "Why does ..."). One heading = one self-contained answer.
   - Self-contained passages: no "as mentioned above" dependencies; each section quotable on its own.
   - Direct, factual, hedge-free sentences with specific numbers, versions and dates instead of vague or marketing language.
   - FAQ block: propose 3-6 likely follow-up questions with concise answers.
   - Lists, tables, numbered steps where the content is enumerable.
   - Structured data: the live page ALREADY emits JSON-LD (Organization, WebSite, BreadcrumbList and an Article/BlogPosting node); you receive it in the user message. Never re-propose or duplicate those. Instead, propose only ADDITIONAL schema.org nodes that the body content actually supports, such as FAQPage (when the post has or you propose a Q&A block), HowTo (numbered, actionable steps), VideoObject (embedded video), SoftwareSourceCode (substantial code examples), Dataset or ItemList. Every node must be built from facts in the post (real questions, real steps, real headings), reuse the same @context, follow the existing @id conventions (e.g. "<post url>#faq", "<post url>#howto") and reference the existing article via "mainEntityOfPage"/"isPartOf" where it fits. If nothing in the content justifies a new node, set "schema_jsonld" to null. When you propose an FAQ block, the FAQPage node and the FAQ HTML must contain the same questions and answers.
   - Entity and definition clarity early in the post.
   - Trust signals and freshness: flag time-sensitive claims and stale version references.
   - Scannability: paragraphs of 2-4 sentences, descriptive link text, a short TL;DR for long posts.

GUARDRAILS
- Only change what improves correctness, currency, clarity or AEO performance. Preserve the author's voice and intent.
- Historical content (announcements, release notes, event recaps, "new in version X") is NOT modernized. Set "historical": true and add a single issue with category "needs-context-note" proposing a short context note. Do not rewrite announcements.
- Every issue must be independently accept/reject-able and concrete: include the exact original substring from the HTML in "original_snippet" (copy it verbatim, including tags) and the exact replacement in "suggested_snippet". If an issue is an insertion (new lead paragraph, FAQ block, TL;DR), set "original_snippet" to null and put the full HTML to insert in "suggested_snippet", with "apply_mode" set to "prepend" or "append".
- Never invent facts, numbers, versions or claims. AEO rewrites keep the meaning of the source.
- Keep iframes, images, demo embeds and code examples intact unless the issue is specifically about them.
- Code blocks on this blog use one fixed format: <div class="hs-code-outer-container"><div class="hs-code-container neutral-50-light neutral-800-dark" tabindex="0" role="region" aria-label="Code block"><pre class="wp-block-code"><code>…escaped code…</code></pre>[copy button]</div></div>. The deterministic layer already converts non-standard <pre> blocks to it, so do not report that; never add language-* classes, never strip the wrapper or the copy button in your rewrite, and when you write new code examples in "suggested_content_html" use plain <pre class="wp-block-code"><code>…</code></pre> (the tool wraps it). Do flag code that is pasted as paragraphs, inline code that should be a block, and broken or outdated code.
- Keep "suggested_content_html" as valid HTML in the same style as the input (plain WordPress HTML: p, h2, h3, ul, ol, pre, code, a, img, iframe, table). Apply all your issues to it. If nothing should change, return the original unchanged.
- Put structured data ONLY in "aeo.schema_jsonld" (never as an issue), the FAQ block ONLY in "aeo.faq" (never as an issue), and the lead paragraph ONLY in "aeo.lead_answer" (never as an issue); the tool turns each of those into its own card.
- Limit to the 12 most valuable issues. Prefer major AEO and correctness findings over nitpicks; the deterministic layer already catches missing alt text, dead links, pinned CDN versions and heading-level skips, so do not repeat those.

OUTPUT (strict JSON)
{
  "summary": "One sentence on the post's state.",
  "overall_severity": "ok" | "minor" | "major" | "blocker",
  "historical": boolean,
  "aeo_score": 0-100,
  "issues": [
    {
      "category": "deprecated-api" | "broken-code" | "code-format" | "outdated-version" | "broken-link" | "structure" | "schema" | "aeo" | "style" | "a11y" | "clarity" | "needs-context-note",
      "severity": "info" | "minor" | "major" | "blocker",
      "title": "Short imperative summary",
      "description": "Why this matters, 1-3 sentences.",
      "original_snippet": "exact substring of the input HTML, or null",
      "suggested_snippet": "replacement or insertion HTML, or null",
      "apply_mode": "replace" | "prepend" | "append" | "none"
    }
  ],
  "aeo": {
    "lead_answer": "Proposed answer-first opening paragraph (plain HTML <p>), or null",
    "suggested_headings": ["Question-shaped heading", "..."],
    "faq": [ { "q": "...", "a": "..." } ],
    "schema_jsonld": "JSON-LD string with ONLY additional nodes (FAQPage, HowTo, ...) that complement the existing page schema, or null"
  },
  "suggested_content_html": "Full improved body HTML"
}`;


const REVIEW_SCHEMA: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    required: ["summary", "overall_severity", "historical", "aeo_score", "issues", "aeo", "suggested_content_html"],
    properties: {
      summary: { type: "string" },
      overall_severity: { type: "string", enum: ["ok", "minor", "major", "blocker"] },
      historical: { type: "boolean" },
      aeo_score: { type: "integer", description: "0-100" },
      issues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "severity", "title", "description", "original_snippet", "suggested_snippet", "apply_mode"],
          properties: {
            category: { type: "string", enum: ["deprecated-api", "broken-code", "code-format", "outdated-version", "broken-link", "structure", "schema", "aeo", "style", "a11y", "clarity", "needs-context-note"] },
            severity: { type: "string", enum: ["info", "minor", "major", "blocker"] },
            title: { type: "string" },
            description: { type: "string" },
            original_snippet: { anyOf: [{ type: "string" }, { type: "null" }], description: "Exact substring of the input HTML, or null for insertions" },
            suggested_snippet: { anyOf: [{ type: "string" }, { type: "null" }] },
            apply_mode: { type: "string", enum: ["replace", "prepend", "append", "none"] },
          },
        },
      },
      aeo: {
        type: "object",
        additionalProperties: false,
        required: ["lead_answer", "suggested_headings", "faq", "schema_jsonld"],
        properties: {
          lead_answer: { anyOf: [{ type: "string" }, { type: "null" }] },
          suggested_headings: { type: "array", items: { type: "string" } },
          faq: { type: "array", items: { type: "object", additionalProperties: false, required: ["q", "a"], properties: { q: { type: "string" }, a: { type: "string" } } } },
          schema_jsonld: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
      suggested_content_html: { type: "string", description: "Full improved body HTML, or the original unchanged" },
    },
};

/** Compact view of the page's JSON-LD for the prompt: keep types, ids and key fields, drop long bodies. */
function summarizeJsonLd(nodes: Record<string, unknown>[]): Record<string, unknown>[] {
  return nodes.map((n) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) {
      if (k === "articleBody" || k === "description") continue;
      out[k] = typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}…` : v;
    }
    return out;
  });
}

export interface LlmReview {
  summary: string;
  overall_severity: "ok" | Severity;
  historical: boolean;
  aeo_score: number;
  issues: {
    category: IssueCategory;
    severity: Severity;
    title: string;
    description: string;
    original_snippet: string | null;
    suggested_snippet: string | null;
    apply_mode?: "replace" | "prepend" | "append" | "none";
  }[];
  aeo: AeoArtifacts;
  suggested_content_html: string;
}

/** Tolerant parse: raw JSON → fenced ```json block → first {...} match. */
export function parseReview(text: string): LlmReview {
  const attempts: string[] = [text.trim()];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) attempts.push(fenced[1].trim());
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) attempts.push(text.slice(first, last + 1));
  let lastErr: unknown;
  for (const a of attempts) {
    try {
      return JSON.parse(a) as LlmReview;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`LLM returned non-JSON output: ${(lastErr as Error)?.message ?? "parse failed"}`);
}

export async function reviewPost(post: Pick<Post, "title" | "url" | "author_name" | "category" | "published_at" | "modified_at" | "original_html" | "existing_jsonld">): Promise<LlmReview> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  // Keys that are not scoped to a workspace must send the workspace ID on every request.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic({ apiKey, defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });

  const user = [
    `Title: ${post.title}`,
    `URL: ${post.url}`,
    `Author: ${post.author_name ?? "unknown"}`,
    `Category: ${post.category ?? "unknown"}`,
    `Published: ${post.published_at?.slice(0, 10) ?? "unknown"}  Last modified: ${post.modified_at?.slice(0, 10) ?? "unknown"}`,
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "EXISTING JSON-LD ON THE LIVE PAGE (already present, do not duplicate; propose only complementary nodes):",
    JSON.stringify(summarizeJsonLd(post.existing_jsonld ?? []), null, 1),
    "",
    "BODY HTML:",
    post.original_html,
  ].join("\n");

  // Streaming is required by the SDK for large max_tokens; we only need the final message.
  const res = await client.messages
    .stream({
      model: MODEL,
      max_tokens: 32000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema: REVIEW_SCHEMA } },
    })
    .finalMessage();

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const review = parseReview(text);
  if (res.stop_reason === "max_tokens") throw new Error("Editorial review was cut off (max_tokens). Try again or shorten the post.");
  review.issues = Array.isArray(review.issues) ? review.issues : [];
  review.aeo = review.aeo ?? { lead_answer: null, suggested_headings: [], faq: [], schema_jsonld: null };
  review.aeo.suggested_headings = review.aeo.suggested_headings ?? [];
  review.aeo.faq = review.aeo.faq ?? [];
  if (!review.suggested_content_html) review.suggested_content_html = post.original_html;
  return review;
}

/** Find `snippet` in `html`, tolerating whitespace differences. Returns the exact matching substring or null. */
export function locateSnippet(html: string, snippet: string | null): string | null {
  if (!snippet) return null;
  if (html.includes(snippet)) return snippet;
  const tokens = snippet.trim().split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!tokens.length || tokens.join("").length < 8) return null;
  const re = new RegExp(tokens.join("\\s+"));
  const m = html.match(re);
  return m ? m[0] : null;
}

/** Convert the LLM review into storable issues, verifying snippets against the source HTML. */
export function reviewToIssues(review: LlmReview, html: string): NewIssue[] {
  const out: NewIssue[] = [];
  const VALID: Severity[] = ["info", "minor", "major", "blocker"];

  for (const i of review.issues) {
    const category = (i.category in CATEGORY_AXIS ? i.category : "clarity") as IssueCategory;
    const severity = VALID.includes(i.severity) ? i.severity : "minor";
    const located = locateSnippet(html, i.original_snippet);
    let apply_mode: NewIssue["apply_mode"] = i.apply_mode ?? "replace";
    let description = i.description ?? "";
    if (apply_mode === "replace") {
      if (located && i.suggested_snippet != null) apply_mode = "replace";
      else if (!located && i.suggested_snippet && !i.original_snippet) apply_mode = "append";
      else {
        apply_mode = "none";
        if (i.original_snippet && !located) description += " (Original text could not be matched verbatim; apply this change manually.)";
      }
    }
    out.push({
      source: "llm",
      axis: CATEGORY_AXIS[category],
      category,
      severity,
      title: i.title || "Untitled issue",
      description,
      original_snippet: located ?? i.original_snippet ?? null,
      suggested_snippet: i.suggested_snippet ?? null,
      apply_mode,
    });
  }

  // Drop model issues that carry no actionable snippet when a derived card covers them (e.g. "add schema" with null snippet).
  for (let i = out.length - 1; i >= 0; i--) {
    const o = out[i];
    if (o.category === "schema" && !o.suggested_snippet) out.splice(i, 1);
  }

  const aeo = review.aeo;
  const titleOrSnippet = (o: NewIssue) => `${o.title} ${o.suggested_snippet ?? ""}`;
  const hasLeadIssue = out.some((o) => o.category === "aeo" && (o.apply_mode === "prepend" || /lead|answer-first|short answer|tl;dr/i.test(titleOrSnippet(o))));
  const hasFaqIssue = out.some((o) => o.category === "aeo" && /frequently asked|faq/i.test(titleOrSnippet(o)));
  if (aeo.lead_answer && !hasLeadIssue) {
    out.push({
      source: "llm",
      axis: 4,
      category: "aeo",
      severity: "major",
      title: "Add an answer-first lead paragraph",
      description: "Answer engines favour pages that state the core answer in the first 40-60 words. This paragraph goes at the very top of the post.",
      original_snippet: null,
      suggested_snippet: aeo.lead_answer.startsWith("<") ? aeo.lead_answer : `<p>${aeo.lead_answer}</p>`,
      apply_mode: "prepend",
    });
  }
  if (aeo.faq?.length && !hasFaqIssue) {
    const faqHtml = ["<h2>Frequently asked questions</h2>", ...aeo.faq.map((f) => `<h3>${f.q}</h3>\n<p>${f.a}</p>`)].join("\n");
    out.push({
      source: "llm",
      axis: 4,
      category: "aeo",
      severity: "minor",
      title: `Add an FAQ section (${aeo.faq.length} questions)`,
      description: "A Q&A block captures the likely follow-up questions and is preferentially extracted by answer engines. Appended at the end of the post.",
      original_snippet: null,
      suggested_snippet: faqHtml,
      apply_mode: "append",
    });
  }
  if (aeo.schema_jsonld) {
    const json = aeo.schema_jsonld.trim();
    out.push({
      source: "llm",
      axis: 4,
      category: "schema",
      severity: "minor",
      title: "Add complementary schema.org JSON-LD (FAQPage / HowTo / ...)",
      description: "Additional structured-data nodes that match the post content, alongside the Article, Organization and Breadcrumb schema the page already emits. Appended as a script block at the end of the post content.",
      original_snippet: null,
      suggested_snippet: json.startsWith("<script") ? json : `<script type="application/ld+json">\n${json}\n</script>`,
      apply_mode: "append",
    });
  }
  if (aeo.suggested_headings?.length) {
    out.push({
      source: "llm",
      axis: 4,
      category: "aeo",
      severity: "info",
      title: "Suggested question-shaped headings",
      description: "Reference list of headings the rewrite uses. Individual heading changes are listed as their own issues where the original could be matched.",
      original_snippet: null,
      suggested_snippet: `<ul>\n${aeo.suggested_headings.map((h) => `<li>${h}</li>`).join("\n")}\n</ul>`,
      apply_mode: "none",
    });
  }

  if (review.suggested_content_html && review.suggested_content_html.trim() !== html.trim()) {
    out.push({
      source: "llm",
      axis: 3,
      category: "rewrite",
      severity: "info",
      title: "Accept the full suggested rewrite",
      description: "Replaces the whole post body with the editor's rewrite (all issues applied). When accepted, snippet-level decisions are ignored for the final HTML.",
      original_snippet: null,
      suggested_snippet: normalizeCodeBlocks(review.suggested_content_html),
      apply_mode: "replace",
    });
  }

  return out;
}
