import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/pending?limit=10  IDs of posts not yet audited (newest first). */
export async function GET(req: NextRequest) {
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 10)));
  const { data, error } = await db()
    .from("posts")
    .select("id")
    .in("audit_status", ["pending", "error"])
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ids: (data ?? []).map((p) => p.id) });
}
