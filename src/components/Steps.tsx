/**
 * Compact workflow strip for the post page: 1 Audit -> 2 Review -> 3 Age warning -> 4 Copy to WordPress.
 * Current step is derived from the post's state, so it doubles as a progress indicator.
 */
export function Steps({ current, done }: { current: 1 | 2 | 3 | 4; done: boolean[] }) {
  const steps = [
    { n: 1, label: "Run audit", hint: "rules + AI review" },
    { n: 2, label: "Decide each issue", hint: "accept / reject in the right column" },
    { n: 3, label: "Age warning", hint: "tick if the post is old" },
    { n: 4, label: "Copy to WordPress", hint: "Copy audited HTML, paste into the post" },
  ] as const;
  return (
    <ol className="flex flex-wrap items-stretch gap-1 text-xs">
      {steps.map((s, i) => {
        const isDone = done[i];
        const isCurrent = s.n === current;
        return (
          <li
            key={s.n}
            className={`flex min-w-[150px] flex-1 items-center gap-2 rounded-hc border px-2.5 py-1.5 ${
              isCurrent ? "border-brand-600 bg-brand-50" : isDone ? "border-success-300 bg-success-50" : "border-neutral-100 bg-white"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                isCurrent ? "bg-brand-600 text-white" : isDone ? "bg-success-600 text-white" : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {isDone && !isCurrent ? "✓" : s.n}
            </span>
            <span className="min-w-0 leading-tight">
              <span className={`block font-semibold ${isCurrent ? "text-brand-900" : "text-neutral-800"}`}>{s.label}</span>
              <span className="block truncate text-neutral-500">{s.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
