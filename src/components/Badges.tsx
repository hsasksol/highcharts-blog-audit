import type { Decision, OverallSeverity, PostState, Severity } from "@/lib/types";

const SEV: Record<string, string> = {
  ok: "bg-success-100 text-success-800",
  info: "bg-neutral-100 text-neutral-700",
  minor: "bg-attention-100 text-attention-800",
  major: "bg-attention-300 text-attention-800",
  blocker: "bg-danger-100 text-danger-800",
};

const STATE: Record<PostState, string> = {
  pending: "bg-neutral-100 text-neutral-600",
  "in-review": "bg-brand-100 text-brand-800",
  approved: "bg-success-100 text-success-800",
  "needs-changes": "bg-attention-100 text-attention-800",
  rejected: "bg-danger-100 text-danger-800",
};

const DEC: Record<Decision, string> = {
  pending: "bg-neutral-100 text-neutral-600",
  accepted: "bg-success-100 text-success-800",
  rejected: "bg-danger-100 text-danger-800",
  "needs-changes": "bg-attention-100 text-attention-800",
};

const base = "inline-block rounded-hc px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

export function SeverityBadge({ value }: { value: Severity | OverallSeverity | null | undefined }) {
  if (!value) return <span className={`${base} bg-neutral-50 text-neutral-400`}>n/a</span>;
  return <span className={`${base} ${SEV[value] ?? SEV.info}`}>{value}</span>;
}

export function StateBadge({ value }: { value: PostState }) {
  return <span className={`${base} ${STATE[value]}`}>{value}</span>;
}

export function DecisionBadge({ value }: { value: Decision }) {
  return <span className={`${base} ${DEC[value]}`}>{value}</span>;
}

export function AeoScore({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-neutral-400">–</span>;
  const color = value >= 75 ? "text-success-700" : value >= 50 ? "text-attention-700" : "text-danger-700";
  return <span className={`font-semibold tabular-nums ${color}`}>{value}</span>;
}
