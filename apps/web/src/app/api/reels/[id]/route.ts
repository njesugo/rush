import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, reels, sourceVideos, type ReelStoryboard } from "@rush/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
  if (!rows.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  const reel = rows[0]!;

  let sourceVideo: typeof sourceVideos.$inferSelect | null = null;
  if (reel.sourceVideoId) {
    const sv = await db
      .select()
      .from(sourceVideos)
      .where(eq(sourceVideos.id, reel.sourceVideoId))
      .limit(1);
    sourceVideo = sv[0] ?? null;
  }

  return NextResponse.json({ item: reel, sourceVideo });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const reelId = Number(id);
  if (!Number.isFinite(reelId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string | null;
    angle?: string;
    storyboard?: ReelStoryboard;
  };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) patch.title = body.title;
  if (typeof body.angle === "string") patch.angle = body.angle;
  if (body.storyboard && typeof body.storyboard === "object") {
    patch.storyboard = body.storyboard;
    if (typeof body.storyboard.hook === "string") patch.hook = body.storyboard.hook;
  }

  const db = getDb();
  const updated = await db
    .update(reels)
    .set(patch)
    .where(eq(reels.id, reelId))
    .returning({ id: reels.id });
  if (!updated.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
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
  await db.delete(reels).where(eq(reels.id, reelId));
  return NextResponse.json({ ok: true });
}
