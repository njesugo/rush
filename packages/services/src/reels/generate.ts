/**
 * Reel storyboard orchestrator.
 * Reads a reel + its source_video transcript, calls Claude, persists the storyboard,
 * and transitions reel.status: generating -> ready (or failed).
 */

import { eq } from "drizzle-orm";
import {
  getDb,
  reels,
  sourceVideos,
  type ReelStatus,
  type ReelStoryboard,
} from "@rush/db";
import { generateReelScript } from "./script";

async function setReelStatus(
  reelId: number,
  status: ReelStatus,
  patch: Partial<{
    storyboard: ReelStoryboard;
    hook: string;
    error: string | null;
  }> = {}
): Promise<void> {
  const db = getDb();
  await db
    .update(reels)
    .set({
      status,
      updatedAt: new Date(),
      ...(patch.storyboard !== undefined ? { storyboard: patch.storyboard } : {}),
      ...(patch.hook !== undefined ? { hook: patch.hook } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    })
    .where(eq(reels.id, reelId));
}

/**
 * Generate (or regenerate) the storyboard for a reel.
 * Requires: reel.sourceVideoId set + source_videos row in status=ready with transcript.
 */
export async function generateReelStoryboard(reelId: number): Promise<ReelStoryboard> {
  const db = getDb();
  const reelRows = await db.select().from(reels).where(eq(reels.id, reelId)).limit(1);
  const reel = reelRows[0];
  if (!reel) throw new Error(`reel ${reelId} not found`);
  if (!reel.sourceVideoId) {
    throw new Error(`reel ${reelId} has no source_video linked`);
  }

  const svRows = await db
    .select()
    .from(sourceVideos)
    .where(eq(sourceVideos.id, reel.sourceVideoId))
    .limit(1);
  const sv = svRows[0];
  if (!sv) throw new Error(`source_video ${reel.sourceVideoId} not found`);
  if (sv.status !== "ready") {
    throw new Error(`source_video ${sv.id} not ready (status=${sv.status})`);
  }
  if (!sv.transcript || !Array.isArray(sv.transcript) || sv.transcript.length === 0) {
    throw new Error(`source_video ${sv.id} has no transcript`);
  }
  if (!sv.durationS || sv.durationS <= 0) {
    throw new Error(`source_video ${sv.id} has invalid durationS`);
  }

  if (!reel.angle) {
    throw new Error(`reel ${reelId} has no angle (legacy v1 generate flow)`);
  }

  await setReelStatus(reelId, "generating", { error: null });

  try {
    const { storyboard } = await generateReelScript({
      angle: reel.angle,
      transcript: sv.transcript,
      sourceTitle: sv.title,
      sourceDurationS: sv.durationS,
    });
    await setReelStatus(reelId, "ready", {
      storyboard,
      hook: storyboard.hook,
      error: null,
    });
    return storyboard;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setReelStatus(reelId, "failed", { error: msg });
    throw err;
  }
}
