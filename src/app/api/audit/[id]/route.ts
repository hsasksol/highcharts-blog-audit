import { NextRequest, NextResponse } from "next/server";
import { auditPost } from "@/lib/audit";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST /api/audit/:id  { llm?: boolean }  Runs rules (+ LLM review) for one post. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { llm?: boolean };
  try {
    const result = await auditPost(Number(id), { llm: body.llm ?? true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
