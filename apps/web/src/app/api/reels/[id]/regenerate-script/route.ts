import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, reels, sourceVideos } from "@rush/db";
import { reelGenerateQueue } from "@rush/services";

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
  if (!reel.sourceVideoId) {
    return NextResponse.json({ error: "no source video linked" }, { status: 400 });
  }

  const svRows = await db
    .select({ status: sourceVideos.status })
    .from(sourceVideos)
    .where(eq(sourceVideos.id, reel.sourceVideoId))
    .limit(1);
  if (svRows[0]?.status !== "ready") {
    return NextResponse.json(
      { error: `source video not ready (status=${svRows[0]?.status ?? "missing"})` },
      { status: 409 }
    );
  }

  await reelGenerateQueue().add("generate", { reelId });
  return NextResponse.json({ ok: true, queued: "reel-generate" });
}
