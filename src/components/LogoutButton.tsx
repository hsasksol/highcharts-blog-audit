"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="text-sm text-neutral-500 hover:text-neutral-900">
      Log out
    </button>
  );
}
