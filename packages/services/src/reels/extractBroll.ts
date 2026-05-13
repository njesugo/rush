/**
 * B-roll extraction orchestrator for Reels.
 * For each block in the storyboard, crops and zooms the source video using FFmpeg,
 * uploads the result to Supabase, and updates the reel's brollKeys.
 */

import { eq } from "drizzle-orm";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import {
  getDb,
  reels,
  sourceVideos,
  type ReelStatus,
  type ReelStoryboard,
  type ReelBlock,
} from "@rush/db";
import { downloadObject, uploadObject } from "../storage";

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 960;

function runFFmpeg(args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      cwd: opts.cwd,
      stdio: ["ignore", "inherit", "inherit"],
    });
    let killed = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          killed = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (killed) return reject(new Error(`ffmpeg timed out after ${opts.timeoutMs}ms`));
      if (code !== 0) {
        return reject(new Error(`ffmpeg exited ${code}`));
      }
      resolve();
    });
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function buildFilter(block: ReelBlock, srcWidth: number, srcHeight: number): string {
  // block.broll.zoom: { x, y, scale }
  const { zoom } = block.broll!;
  const scale = clamp(zoom.scale, 1, 3);
  // Compute crop region in source pixels
  const cropW = Math.round(OUTPUT_WIDTH / scale);
  const cropH = Math.round(OUTPUT_HEIGHT / scale);
  const x = clamp(Math.round(zoom.x * (srcWidth - cropW)), 0, srcWidth - cropW);
  const y = clamp(Math.round(zoom.y * (srcHeight - cropH)), 0, srcHeight - cropH);
  // Crop, then scale to output size
  return `crop=${cropW}:${cropH}:${x}:${y},scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`;
}

export async function extractBrollClips(args: {
  reelId: number;
  getSourceVideoFile: (youtubeId: string) => Promise<Buffer>;
}): Promise<string[]> {
  const db = getDb();
  const reelRows = await db.select().from(reels).where(eq(reels.id, args.reelId)).limit(1);
  const reel = reelRows[0];
  if (!reel) throw new Error(`reel ${args.reelId} not found`);
  if (!reel.storyboard || !Array.isArray(reel.storyboard.blocks)) {
    throw new Error(`reel ${args.reelId} has no storyboard`);
  }
  if (!reel.sourceVideoId) throw new Error(`reel ${args.reelId} has no sourceVideoId`);
  const svRows = await db.select().from(sourceVideos).where(eq(sourceVideos.id, reel.sourceVideoId)).limit(1);
  const sv = svRows[0];
  if (!sv || !sv.youtubeId || !sv.storageKey) throw new Error(`source_video missing`);

  // Download source mp4
  const videoBuf = await args.getSourceVideoFile(sv.youtubeId);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `broll-${reel.id}-`));
  const srcPath = path.join(workDir, `${sv.youtubeId}.mp4`);
  await fs.writeFile(srcPath, videoBuf);

  // Probe source dimensions
  const probeArgs = [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0",
    srcPath,
  ];
  const probe = spawn("ffprobe", probeArgs);
  let probeOut = "";
  for await (const chunk of probe.stdout!) probeOut += chunk.toString();
  await new Promise((res) => probe.on("close", res));
  const [srcWidth, srcHeight] = probeOut.trim().split(",").map(Number);
  if (!srcWidth || !srcHeight) throw new Error(`ffprobe failed: ${probeOut}`);

  // For each block, extract the clip
  const keys: string[] = [];
  for (let i = 0; i < reel.storyboard.blocks.length; ++i) {
    const block = reel.storyboard.blocks[i];
    if (!block.broll) {
      keys.push(""); // Use empty string for missing broll
      continue;
    }
    const { in_s, out_s } = block.broll;
    const outPath = path.join(workDir, `block-${i + 1}.mp4`);
    const filter = buildFilter(block, srcWidth, srcHeight);
    const ffmpegArgs = [
      "-ss", String(in_s),
      "-to", String(out_s),
      "-i", srcPath,
      "-an",
      "-vf", filter,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-y",
      outPath,
    ];
    await runFFmpeg(ffmpegArgs, { cwd: workDir, timeoutMs: 120_000 });
    // Upload to Supabase
    const storageKey = `videos/output/reel-${reel.id}/block-${i + 1}.mp4`;
    const outBuf = await fs.readFile(outPath);
    await uploadObject(storageKey, outBuf, "video/mp4");
    keys.push(storageKey);
  }

  // Update DB
  await db.update(reels).set({
    brollKeys: keys,
    status: "broll_ready",
    updatedAt: new Date(),
  }).where(eq(reels.id, args.reelId));

  // Cleanup
  await fs.rm(workDir, { recursive: true, force: true });
  return keys;
}
