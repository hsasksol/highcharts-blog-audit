import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE, verifySession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Highcharts blog audit",
  description: "Content + AEO audit of highcharts.com/blog",
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
                <path d="M4 26 L13 12 L19 19 L28 5" fill="none" stroke="#626bd0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 26 L13 18 L19 23 L28 13" fill="none" stroke="#2ee0ca" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              </svg>
              Highcharts blog audit
            </Link>
            {user && (
              <>
                <nav className="flex gap-4 text-sm text-neutral-600">
                  <Link href="/" className="hover:text-brand-700">Posts</Link>
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
