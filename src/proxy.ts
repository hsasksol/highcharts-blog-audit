import { NextRequest, NextResponse } from "next/server";

/**
 * Optional shared-password gate. Set AUDIT_PASSWORD in the environment to enable it.
 * Uses HTTP Basic auth so it works for both the UI and the API routes.
 */
export function proxy(req: NextRequest) {
  const password = process.env.AUDIT_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (given === password) return NextResponse.next();
    } catch {
      /* fall through */
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Highcharts blog audit"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
