import type { Decision, OverallSeverity, PostState, Severity } from "@/lib/types";

const SEV: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  info: "bg-slate-100 text-slate-700",
  minor: "bg-amber-100 text-amber-800",
  major: "bg-orange-100 text-orange-800",
  blocker: "bg-red-100 text-red-800",
};

const STATE: Record<PostState, string> = {
  pending: "bg-slate-100 text-slate-600",
  "in-review": "bg-sky-100 text-sky-800",
  approved: "bg-emerald-100 text-emerald-800",
  "needs-changes": "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
};

const DEC: Record<Decision, string> = {
  pending: "bg-slate-100 text-slate-600",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  "needs-changes": "bg-amber-100 text-amber-800",
};

const base = "inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

export function SeverityBadge({ value }: { value: Severity | OverallSeverity | null | undefined }) {
  if (!value) return <span className={`${base} bg-slate-50 text-slate-400`}>n/a</span>;
  return <span className={`${base} ${SEV[value] ?? SEV.info}`}>{value}</span>;
}

export function StateBadge({ value }: { value: PostState }) {
  return <span className={`${base} ${STATE[value]}`}>{value}</span>;
}

export function DecisionBadge({ value }: { value: Decision }) {
  return <span className={`${base} ${DEC[value]}`}>{value}</span>;
}

export function AeoScore({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-slate-400">–</span>;
  const color = value >= 75 ? "text-emerald-700" : value >= 50 ? "text-amber-700" : "text-red-700";
  return <span className={`font-semibold tabular-nums ${color}`}>{value}</span>;
}
