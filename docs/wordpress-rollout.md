# WordPress rollout: conventions and how it was done (2026-11-12)

Applies to the 33 Highsoft-authored posts that got the AEO changes. Edits are made in the "Highsoft" Chrome profile (Claude in Chrome deviceId 3d8333af-168b-41ff-90e5-d7c6bfd09d93) through the WP REST API (`content.raw` with `context=edit`, nonce from `admin-ajax.php?action=rest-nonce`, save with `POST /wp-json/wp/v2/posts/{id}`). One post every 35 to 45 seconds. WordPress revisions are the undo. Pre-change source is also kept in that browser's localStorage (`aeo_backup_<id>` before the AEO rollout, `fx_backup_<id>` before the intro/format pass).

## Post format rules (agreed with Askill)
- Intro: one short paragraph (40 to 80 words) that merges the answer-first lead with what the post covers. Texts in `data/aeo-intros.json`.
- Directly under the intro, always these two paragraphs: "With Highcharts for React, ..." and "To explore Highcharts further, ..." (links: /integrations/react/, /demo "demo gallery", /docs/index, api.highcharts.com/highcharts/, /products/highcharts/). All other "about Highcharts" intro text is removed.
- Posts about Dashboards (climate, IoT weather, dashboard examples, SaaS/Morningstar) also get the two Highcharts Dashboards paragraphs above the React paragraph.
- Every h2: `margin-top: 40px`. Block posts: `<!-- wp:heading {"style":{"spacing":{"margin":{"top":"40px"}}}} -->` + `<h2 class="wp-block-heading" style="margin-top:40px">`. Classic: `<h2 style="margin-top: 40px;">`. Empty `&nbsp;` paragraphs in front of an h2 are removed.
- `<li>`: `style="margin-bottom: 20px;"` (no margin-left).
- The last three sections are always, in this order: "Frequently asked questions", "Resources", "Related posts". The resource link list that used to sit under "Conclusion and additional resources" is moved to its own h2 "Resources" after the FAQ; the conclusion heading is just "Conclusion".
- FAQ: question headings are h5 with `margin-top:28px`.
- No empty headings (`<h2>&nbsp;</h2>`) as spacers. 57 were removed.
- Step labels in code walkthroughs ("Step 1: ...", "1. Load the required files", short bold labels directly before a code block) are h4.
- Code blocks, exact block markup: `<!-- wp:highsoft/hs-code -->` wrapping `div.hs-code-outer-container > div.hs-code-container`, an inner `<!-- wp:code --><pre class="wp-block-code"><code>` and a `<!-- wp:highsoft/hs-button {"text":"Copy",...} -->` block. All 96 code blocks in the 33 posts already had this.
- Demos: no CodePen or JSFiddle embeds. Use `https://www.highcharts.com/samples/embed/<path>`. Reason: JSFiddle now redirects `/embedded/result/` to the editor, and CodePen embeds return a Cloudflare challenge.

## Embeds replaced
| Post | Old | New samples/embed path |
|---|---|---|
| Climate (25266) | jsfiddle mushigh/764woygm | dashboards/demo/climate |
| Lightning map (25535) | codepen VwJdqoG | maps/demo/lightning |
| Big data (25292) | GRbQOYP, oNrEoJd, poXadBy, qBzxVGo | highcharts/demo/scatter-boost, highcharts/demo/heatmap-canvas, stock/demo/lazy-loading, highcharts/boost/line |
| Brand (25625) | RwXPbZV, RwXPbLV, gOVpYGG, PoMqYJO, BaXNBwY, NWQqKaz | highcharts/demo/streamgraph, highcharts/demo/accessible-pie, highcharts/css/prefers-color-scheme, highcharts/css/colors, highcharts/demo/styled-mode-pie, highcharts/demo/pie-gradient |

## Tool endpoints added for the rollout
- `GET /api/plan/[id]`: axis-4 non-schema issues as replace/prepend/append ops (Bearer JWT, claim p="plan").
- `POST/GET /api/gsc-snapshot`: Search Console "Generative AI features" impressions per URL (table `gsc_ai_snapshots`). Baseline 2026-11-12: 445 blog URLs, 93,900 impressions; the 33 posts 54,287.
- `POST/GET /api/wp-raw`: transfer store for block source (table `wp_raw`), token-protected, not used in the end.
- `src/lib/blocks.ts` `toBlockHtml`: regenerates WP block comments so copied HTML opens as blocks.

## Embed heights
Iframe `height` is set to the embed's measured document height at 860 px width plus 15 px (for example streamgraph 811, accessible-pie 649, css/colors 490, dashboards climate 1698). The fallback text inside the old CodePen iframes ("See the Pen ...") was removed.
