import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, reels } from "@rush/db";
import { signedUrl } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reels/[id]/render-url — returns a short-lived signed URL to the
 * rendered Remotion mp4 (set by the reelRenderRemotionWorker on success).
 *
 * Response: { url: string, key: string, expiresInSec: number }
 * 404 if the reel exists but has no rendered video yet.
 */
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
  const rows = await db
    .select({
      renderedVideoKey: reels.renderedVideoKey,
      status: reels.status,
    })
    .from(reels)
    .where(eq(reels.id, reelId))
    .limit(1);
  const reel = rows[0];
  if (!reel) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!reel.renderedVideoKey) {
    return NextResponse.json(
      { error: "render not ready", status: reel.status },
      { status: 404 }
    );
  }

  const expiresInSec = 60 * 10; // 10 min — enough for a download click.
  const url = await signedUrl(reel.renderedVideoKey, expiresInSec);
  return NextResponse.json({ url, key: reel.renderedVideoKey, expiresInSec });
}
