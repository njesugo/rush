import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, reels } from "@rush/db";
import { reelExtractBrollQueue } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const reelId = Number(id);
  if (!Number.isFinite(reelId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db.select().from(reels).where(eq(reels.id, reelId)).limit(1);
  const reel = rows[0];
  if (!reel) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!reel.storyboard || !Array.isArray(reel.storyboard.blocks) || !reel.storyboard.blocks.length) {
    return NextResponse.json({ error: "storyboard not ready" }, { status: 409 });
  }

  // Mark as rendering immediately for UI feedback; worker will overwrite.
  await db
    .update(reels)
    .set({ status: "broll_rendering", error: null, updatedAt: new Date() })
    .where(eq(reels.id, reelId));

  await reelExtractBrollQueue().add("render", { reelId });
  return NextResponse.json({ ok: true, queued: "reel-extract-broll" });
}
