# Highcharts blog audit

Content + AEO audit of every live post on highcharts.com/blog. Pulls the posts, runs a deterministic rule pass and an LLM editorial review, and gives reviewers a per-post page where each suggested change is accepted or rejected. The accepted result is stored in Supabase as clean WordPress HTML you can paste back into the post.

Stack: Next.js (App Router) on Vercel, Supabase (Postgres), Anthropic API.

Login: one shared username + password. `/api/login` compares in constant time and sets an HttpOnly, Secure, SameSite=Strict cookie with a signed JWT (8 h). `src/proxy.ts` redirects unauthenticated pages to `/login` and answers 401 on API routes. The Supabase service role key is only used server-side; the browser never receives any Supabase key.

## What it audits

Only the post body (WordPress `content.rendered`). Nothing from the page template, header, sidebar or metadata is touched.

| Axis | Layer | Examples |
|---|---|---|
| 1. Technical correctness | rules + LLM | deprecated Highcharts API patterns, pinned CDN versions, dead links, http:// links, code blocks without language hint |
| 2. Structure & semantics | rules + LLM | H1 in body, skipped heading levels, missing alt text, iframes without title, tables without headers |
| 3. Content & text quality | LLM + rules | accuracy, clarity, terminology, historical context note, non-descriptive link text, empty paragraphs |
| 4. AEO optimization | LLM | answer-first lead paragraph, question-shaped headings, self-contained passages, FAQ block, schema.org JSON-LD |

Every finding is an independent card with the exact original snippet and the proposed replacement. Nothing is auto-applied.

## Setup

1. **Supabase**: create a project, open the SQL editor, run `supabase/schema.sql`.
2. **Env**: copy `.env.example` to `.env.local` and fill in
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Project settings → API)
   - `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), and `ANTHROPIC_WORKSPACE_ID` if the key is not scoped to a workspace
   - `APP_USERNAME`, `APP_PASSWORD` (one shared login) and `JWT_SECRET` (random 32+ bytes, `openssl rand -base64 48`)
3. **Run**: `npm install && npm run dev`
4. **Vercel**: import the GitHub repo, add the same env vars, deploy. `/api/audit/[id]` declares `maxDuration = 300`; if your plan caps function duration lower, Vercel will clamp it (one post usually takes 30-90 s).

## Workflow

1. **Sync posts** (overview page). Reads `highcharts.com/sitemap.xml`, keeps only real post URLs (`/blog/{tutorials|news|integration|best-practices|use-cases|product-updates|post|webinars}/<slug>/`), fetches content, author, category and dates from the WordPress REST API, and upserts into `posts`. Re-running only refetches posts whose `modified` date changed. 424 posts at the time of writing.
2. **Audit next N**. Runs rules + LLM review on the next N un-audited posts (one request per post, so you can stop any time). Or open a post and click **Run audit**.
3. **Review a post** (`/posts/[id]`). Left: the post body, toggle **See original | See audited page**. Right column:
   - Audit summary, severity, AEO score, bulk accept/reject, manual state override.
   - **Age warning** checkbox: inserts a warning box at the top of the audited HTML ("This post is more than 5 years old…"). The text is editable; posts older than 5 years are flagged automatically.
   - The four axes with their issues. Each card: **Accept audit** / Reject / Needs changes / Reopen, plus a note.
   - The "Accept the full suggested rewrite" card replaces the whole body with the LLM rewrite; when accepted, snippet-level decisions are ignored.
4. **Copy audited HTML** copies `posts.final_html` (original + accepted changes + age warning) for pasting into the WordPress code editor. `GET /api/export?state=approved` returns the same for all approved posts as JSON.

Prev/Next on the post page walks the same filtered list as the overview (author, state, search, sort).

## Data model

- `posts`: one row per live post. `original_html` is the untouched body; `suggested_html` the full LLM rewrite; `final_html` the assembled result; `aeo` the LLM's lead answer / headings / FAQ / schema.
- `issues`: one row per finding. `apply_mode` says how `suggested_snippet` is applied (`replace` the `original_snippet`, `prepend`, `append`, or `none` for manual/advisory).
- `decision_log`: append-only log of every decision and toggle.

Post state is recomputed after every decision: `pending → in-review → approved | needs-changes | rejected`, overridable per post.

## Re-auditing

Re-running the audit on a post deletes its issues and decisions and starts fresh. Sync marks a post as `pending` again if its content changed in WordPress, but keeps existing issues until you re-run.
