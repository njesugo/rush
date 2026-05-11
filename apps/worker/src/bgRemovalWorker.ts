import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { Worker, type Job } from "bullmq";
import sharp from "sharp";
import {
  QUEUE_NAMES,
  GENERIC_DIR,
  getRedis,
  markImageFailed,
  markImageGeneric,
  publishJobEvent,
  type BgRemovalJobData,
} from "@rush/services";
import { logger } from "./logger";

const CHILD_SCRIPT = path.resolve(__dirname, "bgRemovalChild.ts");

function runChild(rawPath: string, outPath: string): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const cp = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        CHILD_SCRIPT,
        rawPath,
        outPath,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      }
    );
    let stderr = "";
    cp.stderr.on("data", (d) => (stderr += d.toString()));
    cp.stdout.on("data", (d) => logger.debug({ msg: d.toString().trim() }));
    cp.on("exit", (code, signal) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, reason: stderr.trim() || `exit=${code} signal=${signal}` });
    });
    cp.on("error", (err) => resolve({ ok: false, reason: err.message }));
  });
}

async function handle(job: Job<BgRemovalJobData>): Promise<{ outPath: string }> {
  const { imageId, rawPath, filename } = job.data;
  logger.info({ imageId, filename }, "bg-removal start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.bgRemoval,
    jobId: String(job.id),
    kind: "bg-removal",
    payload: { imageId },
    at: Date.now(),
  });

  const buf = await fs.readFile(rawPath);
  const outName = path.basename(rawPath).replace(/\.[^.]+$/, "") + ".png";
  const outPath = path.join(GENERIC_DIR, outName);

  const result = await runChild(rawPath, outPath);
  if (!result.ok) {
    logger.warn(
      { imageId, reason: result.reason },
      "bg-removal child failed — fallback: copy original"
    );
    // Fallback: write the original buffer as PNG-named file so the image
    // still shows up in the cleanup queue. The cleanup operator can mark it
    // "redo" later if needed.
    await fs.writeFile(outPath, buf);
  }

  // Read dims
  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(outPath).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    /* non-fatal */
  }

  await markImageGeneric(imageId, rawPath, outPath, { width, height });
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.bgRemoval,
    jobId: String(job.id),
    result: { imageId, outPath },
    at: Date.now(),
  });
  logger.info({ imageId, outPath }, "bg-removal done");
  return { outPath };
}

export function startBgRemovalWorker(): Worker<BgRemovalJobData> {
  const worker = new Worker<BgRemovalJobData>(QUEUE_NAMES.bgRemoval, handle, {
    connection: getRedis(),
    concurrency: 1,
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;
    logger.error({ jobId: job.id, err: err.message }, "bg-removal failed");
    try {
      await markImageFailed(job.data.imageId, job.data.rawPath, err.message);
    } catch (e) {
      logger.error({ e }, "markImageFailed failed");
    }
    await publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.bgRemoval,
      jobId: String(job.id),
      error: err.message,
      at: Date.now(),
    });
  });

  worker.on("progress", async (job, progress) => {
    const p = typeof progress === "number" ? progress : 0;
    await publishJobEvent({
      type: "progress",
      queue: QUEUE_NAMES.bgRemoval,
      jobId: String(job.id),
      progress: p,
      at: Date.now(),
    });
  });

  return worker;
}
