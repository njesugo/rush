import { promises as fs } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, sourceVideos, type SourceVideoStatus } from "@rush/db";
import { uploadObject } from "../storage";
import {
  cleanupDownload,
  downloadYoutube,
  parseYoutubeId,
  probeYoutube,
  MAX_SOURCE_DURATION_S,
} from "./download";
import { transcribeAudio } from "./transcribe";

/** Storage prefix used by all reel/source video assets. */
export const VIDEOS_PREFIX = {
  raw: "videos/raw",
  output: "videos/output",
} as const;

export const sourceVideoStorageKey = (youtubeId: string) =>
  `${VIDEOS_PREFIX.raw}/${youtubeId}.mp4`;

/**
 * Idempotent: find an existing `source_videos` row by youtube_id, otherwise
 * insert a fresh `pending` row. Always returns the row id.
 */
export async function getOrCreateSourceVideo(youtubeUrlOrId: string): Promise<{
  id: number;
  reused: boolean;
}> {
  const ytId = parseYoutubeId(youtubeUrlOrId);
  if (!ytId) throw new Error(`invalid YouTube URL/id: ${youtubeUrlOrId}`);
  const db = getDb();

  const existing = await db
    .select({ id: sourceVideos.id, status: sourceVideos.status })
    .from(sourceVideos)
    .where(eq(sourceVideos.youtubeId, ytId))
    .limit(1);
  if (existing[0]) {
    return { id: existing[0].id, reused: true };
  }

  const url = /^https?:\/\//.test(youtubeUrlOrId)
    ? youtubeUrlOrId
    : `https://www.youtube.com/watch?v=${ytId}`;

  // Probe upfront so we can refuse over-long videos before queueing work.
  const meta = await probeYoutube(url);
  if (meta.durationS > MAX_SOURCE_DURATION_S) {
    throw new Error(
      `Video too long: ${Math.round(meta.durationS)}s (max ${MAX_SOURCE_DURATION_S}s)`
    );
  }

  const inserted = await db
    .insert(sourceVideos)
    .values({
      youtubeId: meta.id,
      youtubeUrl: url,
      title: meta.title,
      channel: meta.uploader,
      durationS: meta.durationS,
      status: "pending" satisfies SourceVideoStatus,
    })
    .returning({ id: sourceVideos.id });
  return { id: inserted[0]!.id, reused: false };
}

async function setStatus(
  id: number,
  status: SourceVideoStatus,
  patch: Partial<{
    storageKey: string;
    error: string | null;
    transcript: unknown;
  }> = {}
): Promise<void> {
  const db = getDb();
  await db
    .update(sourceVideos)
    .set({
      status,
      updatedAt: new Date(),
      ...(patch.storageKey !== undefined ? { storageKey: patch.storageKey } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.transcript !== undefined ? { transcript: patch.transcript as never } : {}),
    })
    .where(eq(sourceVideos.id, id));
}

/**
 * Full download pipeline: yt-dlp → upload mp4 to Supabase → mark `ready`-for-transcribe.
 * Returns the storage key + audio path so the transcribe step can reuse the WAV.
 */
export async function downloadSourceVideo(sourceVideoId: number): Promise<{
  storageKey: string;
  audioPath: string;
  workDir: string;
  durationS: number;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sourceVideos)
    .where(eq(sourceVideos.id, sourceVideoId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`source_video ${sourceVideoId} not found`);

  await setStatus(sourceVideoId, "downloading", { error: null });

  let workDir = "";
  try {
    const dl = await downloadYoutube(row.youtubeUrl);
    workDir = dl.workDir;

    const key = sourceVideoStorageKey(dl.meta.id);
    const buf = await fs.readFile(dl.filePath);
    await uploadObject(key, buf, "video/mp4");

    await setStatus(sourceVideoId, "transcribing", { storageKey: key });

    return {
      storageKey: key,
      audioPath: dl.audioPath,
      workDir,
      durationS: dl.meta.durationS,
    };
  } catch (err) {
    if (workDir) await cleanupDownload(workDir).catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    await setStatus(sourceVideoId, "failed", { error: msg });
    throw err;
  }
}

/** Transcribe the WAV produced by `downloadSourceVideo` and persist segments. */
export async function transcribeSourceVideo(
  sourceVideoId: number,
  audioPath: string,
  workDir: string
): Promise<void> {
  try {
    const segments = await transcribeAudio(audioPath);
    await setStatus(sourceVideoId, "ready", {
      transcript: segments,
      error: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setStatus(sourceVideoId, "failed", { error: msg });
    throw err;
  } finally {
    await cleanupDownload(workDir).catch(() => undefined);
  }
}
