import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, reels, sourceVideos } from "@rush/db";
import {
  getOrCreateSourceVideo,
  ytDownloadQueue,
  reelGenerateQueue,
  parseYoutubeId,
} from "@rush/services";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select({
      id: reels.id,
      title: reels.title,
      youtubeUrl: reels.youtubeUrl,
      angle: reels.angle,
      sourceVideoId: reels.sourceVideoId,
      hook: reels.hook,
      status: reels.status,
      brollKeys: reels.brollKeys,
      error: reels.error,
      createdAt: reels.createdAt,
      updatedAt: reels.updatedAt,
    })
    .from(reels)
    .orderBy(desc(reels.createdAt))
    .limit(200);

  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    youtubeUrl?: string;
    angle?: string;
    title?: string;
  };
  const youtubeUrl = (body.youtubeUrl ?? "").trim();
  const angle = (body.angle ?? "").trim();
  if (!youtubeUrl) return NextResponse.json({ error: "youtubeUrl required" }, { status: 400 });
  if (!angle) return NextResponse.json({ error: "angle required" }, { status: 400 });
  if (!parseYoutubeId(youtubeUrl)) {
    return NextResponse.json({ error: "invalid YouTube URL" }, { status: 400 });
  }

  let sourceVideoId: number;
  let reused: boolean;
  try {
    const r = await getOrCreateSourceVideo(youtubeUrl);
    sourceVideoId = r.id;
    reused = r.reused;
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "source video error" },
      { status: 400 }
    );
  }

  const db = getDb();
  // Look up source video to determine initial reel status
  const sv = await db
    .select({ status: sourceVideos.status })
    .from(sourceVideos)
    .where(eq(sourceVideos.id, sourceVideoId))
    .limit(1);
  const svReady = sv[0]?.status === "ready";

  const inserted = await db
    .insert(reels)
    .values({
      title: body.title?.trim() || null,
      youtubeUrl,
      angle,
      sourceVideoId,
      status: svReady ? "generating" : "downloading",
    })
    .returning({ id: reels.id });
  const reelId = inserted[0]!.id;

  // If transcript already exists, jump straight to script generation.
  if (svReady) {
    await reelGenerateQueue().add("generate", { reelId });
  } else if (!reused) {
    // New source: queue full download → transcribe pipeline.
    await ytDownloadQueue().add("download", { sourceVideoId });
  }
  // else: another reel is already downloading the same source; the worker
  // will publish events but this reel will need a manual "regenerate-script"
  // once transcript becomes available (UI handles via SSE).

  return NextResponse.json({ id: reelId, sourceVideoId, reused, svReady }, { status: 201 });
}
