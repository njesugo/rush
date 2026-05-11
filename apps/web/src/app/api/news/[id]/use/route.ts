import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, newsItems } from "@rush/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const newsId = Number(id);
  if (!Number.isFinite(newsId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const db = getDb();
  const updated = await db
    .update(newsItems)
    .set({ used: sql`${newsItems.used} + 1` })
    .where(eq(newsItems.id, newsId))
    .returning({ id: newsItems.id, used: newsItems.used });

  if (!updated.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, used: updated[0].used });
}
