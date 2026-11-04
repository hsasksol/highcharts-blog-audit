"use client";


export function LogoutButton() {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.assign("/login");
  }
  return (
    <button onClick={logout} className="text-sm text-neutral-500 hover:text-neutral-900">
      Log out
    </button>
  );
}
