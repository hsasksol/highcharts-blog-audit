import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifyReportToken, verifySession } from "@/lib/auth";

/**
 * Login gate: one shared username + password (APP_USERNAME / APP_PASSWORD), signed HttpOnly
 * session cookie (JWT_SECRET, 8 h). Pages redirect to /login, API routes answer 401.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/api/login" || pathname === "/api/report-login" || pathname.startsWith("/api/plan/") || pathname === "/api/gsc-snapshot" || pathname === "/api/wp-raw") return NextResponse.next(); // plan endpoint checks its own bearer token

  const user = await verifySession(req.cookies.get(COOKIE)?.value).catch(() => null);
  if (pathname === "/report") {
    // The report page renders its own password form when neither cookie is valid.
    return NextResponse.next();
  }
  if (pathname === "/login") {
    // Already signed in: never show the login form, go straight to the app (or ?next=).
    if (!user) return NextResponse.next();
    const url = req.nextUrl.clone();
    const next = req.nextUrl.searchParams.get("next");
    url.pathname = next && next.startsWith("/") && !next.startsWith("/login") ? next.split("?")[0] : "/";
    url.search = next && next.includes("?") ? `?${next.split("?")[1]}` : "";
    return NextResponse.redirect(url);
  }
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
