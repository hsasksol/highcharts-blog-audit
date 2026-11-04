"use client";

import { useMemo, useState } from "react";
import { AeoScore, SeverityBadge } from "./Badges";
import type { OverallSeverity } from "@/lib/types";

export interface ReportRow {
  id: number;
  title: string;
  url: string;
  adminUrl: string;
  author: string;
  category: string;
  published: string;
  severity: string;
  aeo: number | null;
  issues: number;
  major: number;
  deadLinks: number;
  code: number;
  historical: boolean;
  summary: string;
  top: string[];
  state: string;
}

type SortKey = "aeo" | "issues" | "major" | "published" | "title";

export function ReportTable({ rows, authors }: { rows: ReportRow[]; authors: string[] }) {
  const [author, setAuthor] = useState("");
  const [sev, setSev] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("aeo");
  const [dir, setDir] = useState<1 | -1>(1);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out = rows.filter((r) => (!author || r.author === author) && (!sev || r.severity === sev) && (!ql || r.title.toLowerCase().includes(ql)));
    const val = (r: ReportRow): number | string => {
      switch (sort) {
        case "aeo": return r.aeo ?? 999;
        case "issues": return r.issues;
        case "major": return r.major;
        case "published": return r.published;
        case "title": return r.title.toLowerCase();
      }
    };
    return out.sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, author, sev, q, sort, dir]);

  function header(label: string, key: SortKey, defaultDir: 1 | -1 = 1) {
    const active = sort === key;
    return (
      <button
        onClick={() => {
          if (active) setDir((d) => (d === 1 ? -1 : 1));
          else {
            setSort(key);
            setDir(defaultDir);
          }
        }}
        className={`inline-flex items-center gap-1 ${active ? "text-brand-800" : ""}`}
        title="Sort"
      >
        {label}
        {active && <span>{dir === 1 ? "▲" : "▼"}</span>}
      </button>
    );
  }

  const counts = { total: filtered.length, issues: filtered.reduce((s, r) => s + r.issues, 0), major: filtered.reduce((s, r) => s + r.major, 0), dead: filtered.reduce((s, r) => s + r.deadLinks, 0) };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={author} onChange={(e) => setAuthor(e.target.value)} className="rounded-hc border border-neutral-200 bg-white px-2 py-1">
          <option value="">All authors</option>
          {authors.map((a) => (
            <option key={a} value={a}>
              {a} ({rows.filter((r) => r.author === a).length})
            </option>
          ))}
        </select>
        <select value={sev} onChange={(e) => setSev(e.target.value)} className="rounded-hc border border-neutral-200 bg-white px-2 py-1">
          <option value="">All severities</option>
          {["blocker", "major", "minor", "ok"].map((s) => (
            <option key={s} value={s}>
              {s} ({rows.filter((r) => r.severity === s).length})
            </option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title" className="w-56 rounded-hc border border-neutral-200 px-2 py-1" />
        <span className="text-neutral-500">
          {counts.total} posts · {counts.issues} findings · {counts.major} major · {counts.dead} dead links
        </span>
      </div>

      <div className="overflow-x-auto rounded-hc border border-neutral-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">{header("Post", "title")}</th>
              <th className="px-3 py-2">Links</th>
              <th className="px-3 py-2">Sev</th>
              <th className="px-3 py-2">{header("AEO", "aeo")}</th>
              <th className="px-3 py-2">{header("Findings", "issues", -1)}</th>
              <th className="px-3 py-2">{header("Major", "major", -1)}</th>
              <th className="px-3 py-2">Key findings</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100 align-top hover:bg-neutral-25">
                <td className="max-w-[360px] px-3 py-2">
                  <div className="font-medium text-neutral-900">{r.title}</div>
                  <div className="text-xs text-neutral-500">
                    {r.author} · {r.category} · {r.published}
                    {r.historical && <span className="ml-1 rounded-hc bg-neutral-100 px-1 text-[10px] font-semibold uppercase text-neutral-600">historical</span>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  <a href={r.url} target="_blank" rel="noreferrer" className="block text-brand-700 underline">
                    Live post
                  </a>
                  <a href={r.adminUrl} target="_blank" rel="noreferrer" className="block text-brand-700 underline">
                    Edit in WP
                  </a>
                  <a href={`/posts/${r.id}`} className="block text-neutral-500 underline">
                    Audit
                  </a>
                </td>
                <td className="px-3 py-2">
                  <SeverityBadge value={r.severity as OverallSeverity} />
                </td>
                <td className="px-3 py-2">
                  <AeoScore value={r.aeo} />
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {r.issues}
                  {r.deadLinks > 0 && <span className="ml-1 text-xs text-danger-700" title="dead links">({r.deadLinks} dead)</span>}
                  {r.code > 0 && <span className="ml-1 text-xs text-attention-700" title="code issues">({r.code} code)</span>}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.major}</td>
                <td className="max-w-[520px] px-3 py-2 text-xs text-neutral-700">
                  <ul className="list-disc pl-4">
                    {r.top.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                  {r.summary && <p className="mt-1 text-neutral-500">{r.summary}</p>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                  No posts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
