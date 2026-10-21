import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "@/lib/auth";

/**
 * Login gate: one shared username + password (APP_USERNAME / APP_PASSWORD), signed HttpOnly
 * session cookie (JWT_SECRET, 8 h). Pages redirect to /login, API routes answer 401.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const user = await verifySession(req.cookies.get(COOKIE)?.value).catch(() => null);
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
