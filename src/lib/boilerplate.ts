/**
 * Standard intro boilerplate used on many posts. It is intentional: never flag it, never remove it.
 * Matched by distinctive phrases so wording/markup variations (links, <article> vs <p>) still match.
 */
export const BOILERPLATE_MARKERS = ["first-class charting with hooks", "To explore Highcharts further"];

export function hasBoilerplate(html: string): boolean {
  return BOILERPLATE_MARKERS.some((m) => html.includes(m));
}

/** True when a snippet (an issue's original_snippet) touches the boilerplate paragraphs. */
export function touchesBoilerplate(snippet: string | null | undefined): boolean {
  if (!snippet) return false;
  return BOILERPLATE_MARKERS.some((m) => snippet.includes(m));
}

/** Extract the boilerplate block(s) from the original HTML so they can be re-inserted into a rewrite that dropped them. */
export function extractBoilerplate(html: string): string[] {
  const out: string[] = [];
  for (const m of BOILERPLATE_MARKERS) {
    const i = html.indexOf(m);
    if (i < 0) continue;
    const start = html.lastIndexOf("<p", i);
    const end = html.indexOf("</p>", i);
    if (start >= 0 && end > i) out.push(html.slice(start, end + 4));
  }
  return out;
}

/** Make sure a rewrite keeps the boilerplate when the original had it. Inserted after the first paragraph. */
export function ensureBoilerplate(original: string, rewrite: string): string {
  if (!hasBoilerplate(original) || hasBoilerplate(rewrite)) return rewrite;
  const blocks = extractBoilerplate(original);
  if (!blocks.length) return rewrite;
  const firstP = rewrite.indexOf("</p>");
  const insert = `\n${blocks.join("\n")}\n`;
  return firstP >= 0 ? rewrite.slice(0, firstP + 4) + insert + rewrite.slice(firstP + 4) : insert + rewrite;
}
