"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-hc border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-bold">Highcharts blog audit</h1>
        <p className="text-sm text-neutral-500">Sign in to review posts.</p>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required className="mt-1 w-full rounded-hc border border-neutral-300 px-3 py-2" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="mt-1 w-full rounded-hc border border-neutral-300 px-3 py-2" />
      </label>
      {error && <p className="text-sm text-danger-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-hc bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
