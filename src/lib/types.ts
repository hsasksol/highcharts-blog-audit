export type Severity = "info" | "minor" | "major" | "blocker";
export type OverallSeverity = "ok" | Severity;
export type Decision = "pending" | "accepted" | "rejected" | "needs-changes";
export type PostState = "pending" | "in-review" | "approved" | "needs-changes" | "rejected";
export type AuditStatus = "pending" | "running" | "audited" | "error";
export type ApplyMode = "replace" | "prepend" | "append" | "none";

export type Axis = 1 | 2 | 3 | 4;

export const AXES: Record<Axis, string> = {
  1: "Technical correctness",
  2: "Structure & semantics",
  3: "Content & text quality",
  4: "AEO optimization",
};

export type IssueCategory =
  | "deprecated-api"
  | "broken-code"
  | "code-format"
  | "outdated-version"
  | "broken-link"
  | "structure"
  | "metadata"
  | "schema"
  | "aeo"
  | "style"
  | "a11y"
  | "clarity"
  | "needs-context-note"
  | "rewrite";

export const CATEGORY_AXIS: Record<IssueCategory, Axis> = {
  "deprecated-api": 1,
  "broken-code": 1,
  "code-format": 1,
  "outdated-version": 1,
  "broken-link": 1,
  structure: 2,
  metadata: 2,
  schema: 2,
  a11y: 2,
  style: 3,
  clarity: 3,
  "needs-context-note": 3,
  rewrite: 3,
  aeo: 4,
};

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, minor: 1, major: 2, blocker: 3 };

export interface Post {
  id: number;
  url: string;
  slug: string;
  title: string;
  author_name: string | null;
  author_slug: string | null;
  category: string | null;
  tags: string[];
  published_at: string | null;
  modified_at: string | null;
  word_count: number;
  original_html: string;
  original_text: string | null;
  fetched_at: string;
  audit_status: AuditStatus;
  audit_error: string | null;
  audited_at: string | null;
  summary: string | null;
  overall_severity: OverallSeverity | null;
  historical: boolean;
  aeo_score: number | null;
  suggested_html: string | null;
  aeo: AeoArtifacts | null;
  age_warning: boolean;
  age_warning_text: string | null;
  state: PostState;
  state_override: PostState | null;
  final_html: string | null;
  final_updated_at: string | null;
}

export interface AeoArtifacts {
  lead_answer: string | null;
  suggested_headings: string[];
  faq: { q: string; a: string }[];
  schema_jsonld: string | null;
}

export interface Issue {
  id: string;
  post_id: number;
  source: "rule" | "llm";
  axis: Axis;
  category: IssueCategory;
  severity: Severity;
  title: string;
  description: string | null;
  original_snippet: string | null;
  suggested_snippet: string | null;
  apply_mode: ApplyMode;
  sort_order: number;
  decision: Decision;
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

/** Shape of an issue before it is stored (no id / post_id / decision fields). */
export type NewIssue = Pick<
  Issue,
  "source" | "axis" | "category" | "severity" | "title" | "description" | "original_snippet" | "suggested_snippet" | "apply_mode"
>;

export const DEFAULT_AGE_WARNING =
  "This post is more than 5 years old and may contain outdated information. Highcharts versions, APIs and best practices may have changed since it was published.";
