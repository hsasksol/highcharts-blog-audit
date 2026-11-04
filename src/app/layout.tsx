import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE, verifySession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Highcharts blog audit",
  description: "Content + AEO audit of highcharts.com/blog",
  icons: { icon: "/icon.svg" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await verifySession((await cookies()).get(COOKIE)?.value).catch(() => null);
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3">
            <Link href="/" className="flex items-center gap-2 text-base font-bold tracking-tight text-neutral-900">
              <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M20 5.5 L26.5 12 L12 26.5 L5.5 20 Z" fill="#626bd0" />
                <path d="M23.2 2.3 a2.3 2.3 0 0 1 3.2 0 l3.3 3.3 a2.3 2.3 0 0 1 0 3.2 L26.5 12 L20 5.5 Z" fill="#2ee0ca" />
                <path d="M5.5 20 L12 26.5 L3.5 28.5 Z" fill="#151733" />
                <path d="M9.5 24.5 L22.5 11.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
              </svg>
              Highcharts blog audit
            </Link>
            {user && (
              <>
                <nav className="flex gap-4 text-sm text-neutral-600">
                  <Link href="/" className="hover:text-brand-700">Posts</Link>
                  <Link href="/report" className="hover:text-neutral-900">Report</Link>
                  <a href="/api/export?state=approved" className="hover:text-neutral-900" target="_blank" rel="noreferrer">Export approved</a>
                </nav>
                <div className="ml-auto flex items-center gap-3 text-sm text-neutral-500">
                  <span>{user}</span>
                  <LogoutButton />
                </div>
              </>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
