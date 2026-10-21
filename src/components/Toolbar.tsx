"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Sync posts from the live blog, and audit the next N un-audited posts (one request per post). */
export function Toolbar({ pendingCount }: { pendingCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");
  const [batch, setBatch] = useState(10);

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
      for (const id of ids) {
        setLog(`Auditing ${done + 1}/${ids.length} (post ${id})…`);
        const r = await fetch(`/api/audit/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        const d = await r.json();
        if (!r.ok) setLog(`Post ${id} failed: ${d.error}`);
        done += 1;
        router.refresh();
      }
      setLog(`Audited ${done} posts.`);
    } catch (e) {
      setLog(`Audit failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function resetAll() {
    const typed = window.prompt("This deletes every post, issue and decision in the tool (not on the blog). Type RESET to confirm.");
    if (typed !== "RESET") return;
    setBusy("reset");
    try {
      const res = await fetch("/api/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "RESET" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? res.statusText);
      setLog("Reset done. Click “Sync posts”.");
      router.refresh();
    } catch (e) {
      setLog(`Reset failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
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
        <input type="number" min={1} max={100} value={batch} onChange={(e) => setBatch(Math.max(1, Number(e.target.value)))} className="w-16 rounded-hc border border-neutral-300 px-2 py-1.5" />
      </div>
      <button onClick={resetAll} disabled={!!busy} className="rounded-hc border border-danger-300 bg-white px-2 py-1.5 text-xs font-medium text-danger-700 hover:bg-danger-50 disabled:opacity-50" title="Delete all audit data in the tool and start over">
        Reset all
      </button>
      {log && <span className="text-neutral-500">{log}</span>}
    </div>
  );
}
