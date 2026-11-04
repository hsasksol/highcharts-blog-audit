"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Sync posts from the live blog, and audit the next N un-audited posts (one request per post). */
export function Toolbar({ pendingCount }: { pendingCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");
  const [batch, setBatch] = useState(10);
  const [full, setFull] = useState(false);
  const PARALLEL = 4;

  async function sync() {
    setBusy("sync");
    setLog("Syncing…");
    try {
      let offset = 0;
      let retries = 0;
      let totals = { inserted: 0, updated: 0 };
      for (;;) {
        const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offset }) });
        const text = await res.text();
        let data: { error?: string; processed: number; total: number; inserted: number; updated: number; done: boolean; next_offset: number };
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text.slice(0, 120), processed: 0, total: 0, inserted: 0, updated: 0, done: false, next_offset: offset };
        }
        if (!res.ok || data.error) {
          if (retries < 3) {
            retries += 1;
            setLog(`Chunk at ${offset} failed (${data.error ?? res.statusText}), retrying ${retries}/3…`);
            continue;
          }
          throw new Error(data.error ?? res.statusText);
        }
        retries = 0;
        totals = { inserted: totals.inserted + data.inserted, updated: totals.updated + data.updated };
        setLog(`Synced ${data.processed}/${data.total} (+${totals.inserted} new, ${totals.updated} updated)`);
        router.refresh();
        if (data.done) break;
        offset = data.next_offset;
      }
      router.refresh();
    } catch (e) {
      setLog(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function auditNext() {
    setBusy("audit");
    try {
      const res = await fetch(`/api/pending?limit=${batch}`);
      const { ids } = (await res.json()) as { ids: number[] };
      if (!ids.length) {
        setLog("Nothing left to audit.");
        return;
      }
      let done = 0;
      let failed = 0;
      let next = 0;
      const t0 = Date.now();
      await Promise.all(
        Array.from({ length: Math.min(PARALLEL, ids.length) }, async () => {
          while (next < ids.length) {
            const id = ids[next++];
            try {
              const r = await fetch(`/api/audit/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fast: !full }) });
              const d = await r.json().catch(() => ({}));
              if (!r.ok) failed += 1;
              if (!r.ok) console.warn(`Post ${id} failed: ${d.error}`);
            } catch {
              failed += 1;
            }
            done += 1;
            setLog(`Audited ${done}/${ids.length}${failed ? ` (${failed} failed)` : ""} · ${Math.round((Date.now() - t0) / 1000)}s`);
            router.refresh();
          }
        })
      );
      setLog(`Audited ${done} posts${failed ? `, ${failed} failed (re-run “Audit next” to retry)` : ""} in ${Math.round((Date.now() - t0) / 1000)}s.`);
    } catch (e) {
      setLog(`Audit failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button onClick={sync} disabled={!!busy} className="rounded-hc border border-neutral-300 bg-white px-3 py-1.5 font-medium hover:bg-neutral-50 disabled:opacity-50">
        {busy === "sync" ? "Syncing…" : "Sync posts"}
      </button>
      <div className="flex items-center gap-1">
        <button onClick={auditNext} disabled={!!busy || pendingCount === 0} className="rounded-hc bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy === "audit" ? "Auditing…" : "Audit next"}
        </button>
        <input type="number" min={1} max={200} value={batch} onChange={(e) => setBatch(Math.max(1, Number(e.target.value)))} className="w-16 rounded-hc border border-neutral-300 px-2 py-1.5" />
        <label className="ml-1 flex items-center gap-1 text-xs text-neutral-600" title="Slower: also generates a complete rewritten version of each post">
          <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Full rewrite
        </label>
      </div>
      {log && <span className="text-neutral-500">{log}</span>}
    </div>
  );
}
