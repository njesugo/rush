/**
 * Text-cut render pipeline.
 *
 * Steps:
 *  1. Load row + assert valid word.
 *  2. Generate `frames` from templates (4-6 cuts).
 *  3. Persist frames on the row.
 *  4. Call the injected `render` (worker provides Remotion-based one).
 *  5. Mux a procedurally generated "ticking watch" track via FFmpeg.
 *  6. Upload mp4 to storage, mark `ready`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import {
  getDb,
  textCutVideos,
  type TextCutFrame,
  type TextCutStatus,
} from "@rush/db";
import { uploadObject } from "../storage";
import { buildFrames } from "./templates";

export interface TextCutRenderProps {
  word: string;
  frames: TextCutFrame[];
  /** Total duration of the video in milliseconds (target: ~3000). */
  durationMs: number;
  fps: number;
  width: number;
  height: number;
  /** Optional URL to an audio file to mix as background. We mux it AFTER
   *  Remotion render via FFmpeg, so the composition itself stays silent. */
  audioUrl?: string | null;
}

export type TextCutRenderFn = (args: {
  props: TextCutRenderProps;
  silentOutPath: string;
}) => Promise<void>;

export interface RenderTextCutOptions {
  videoId: number;
  render: TextCutRenderFn;
}

export const TEXT_CUT_VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: 3000,
} as const;

async function setStatus(
  videoId: number,
  status: TextCutStatus,
  patch: Partial<{
    frames: TextCutFrame[];
    renderedVideoKey: string;
    error: string | null;
  }> = {}
): Promise<void> {
  const db = getDb();
  await db
    .update(textCutVideos)
    .set({
      status,
      updatedAt: new Date(),
      ...(patch.frames !== undefined ? { frames: patch.frames } : {}),
      ...(patch.renderedVideoKey !== undefined
        ? { renderedVideoKey: patch.renderedVideoKey }
        : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    })
    .where(eq(textCutVideos.id, videoId));
}

export async function renderTextCut(opts: RenderTextCutOptions): Promise<{
  videoId: number;
  renderedVideoKey: string;
}> {
  const { videoId, render } = opts;
  const db = getDb();

  const rows = await db
    .select()
    .from(textCutVideos)
    .where(eq(textCutVideos.id, videoId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`text_cut_video ${videoId} not found`);

  const word = row.word.trim();
  if (!word) throw new Error(`text_cut_video ${videoId} has no word`);

  await setStatus(videoId, "rendering", { error: null });

  const tmpRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `textcut-${videoId}-`)
  );
  const silentPath = path.join(tmpRoot, "silent.mp4");
  const finalPath = path.join(tmpRoot, "final.mp4");
  const tickPath = path.join(tmpRoot, "tick.wav");

  try {
    const frames = buildFrames(word, row.language, 5);
    await setStatus(videoId, "rendering", { frames });

    const props: TextCutRenderProps = {
      word,
      frames,
      ...TEXT_CUT_VIDEO,
      audioUrl: null,
    };

    // 1. Render silent mp4 with Remotion.
    await render({ props, silentOutPath: silentPath });

    // 2. Synthesize a 3s ticking-watch track via FFmpeg lavfi (no asset needed).
    await synthesizeTickingTrack(tickPath, TEXT_CUT_VIDEO.durationMs / 1000);

    // 3. Mux: copy video, replace audio with tick track.
    await muxAudio(silentPath, tickPath, finalPath);

    // 4. Upload.
    const key = `textcuts/${videoId}/render.mp4`;
    const buf = await fs.readFile(finalPath);
    await uploadObject(key, buf, "video/mp4");

    await setStatus(videoId, "ready", { renderedVideoKey: key });
    return { videoId, renderedVideoKey: key };
  } catch (err) {
    const msg = (err as Error).message || "unknown render error";
    await setStatus(videoId, "failed", { error: msg });
    throw err;
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

/* ----- ffmpeg helpers ----- */

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
      else resolve();
    });
  });
}

/**
 * Procedurally generate a ticking-watch loop using FFmpeg lavfi sine bursts.
 * One sharp tick per second for `durationS` seconds. No external asset needed.
 */
async function synthesizeTickingTrack(outPath: string, durationS: number): Promise<void> {
  // Build a chain of N short sine pulses at 1s intervals via filter_complex.
  // Simpler: generate a 1s tick segment (sine 2.5kHz, 30ms with fast fade) +
  // 970ms silence, then loop it `durationS` times via aloop.
  const total = Math.ceil(durationS);
  const args = [
    "-y",
    "-f", "lavfi",
    "-i", "sine=frequency=2500:duration=0.03",
    "-f", "lavfi",
    "-t", "0.97",
    "-i", "anullsrc=channel_layout=mono:sample_rate=44100",
    "-filter_complex",
    `[0:a]afade=t=out:st=0.015:d=0.015,volume=0.35[t];[t][1:a]concat=n=2:v=0:a=1[seg];[seg]aloop=loop=${total - 1}:size=44100*1[loop];[loop]atrim=duration=${durationS}[out]`,
    "-map", "[out]",
    "-ac", "1",
    "-ar", "44100",
    outPath,
  ];
  await runFFmpeg(args);
}

async function muxAudio(videoPath: string, audioPath: string, outPath: string): Promise<void> {
  await runFFmpeg([
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    "-map", "0:v:0",
    "-map", "1:a:0",
    outPath,
  ]);
}
