import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { Worker, type Job } from "bullmq";
import sharp from "sharp";
import {
  QUEUE_NAMES,
  PREFIX,
  joinKey,
  basenameOfKey,
  downloadObject,
  uploadObject,
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

async function handle(job: Job<BgRemovalJobData>): Promise<{ outKey: string }> {
  const { imageId, rawKey, filename } = job.data;
  logger.info({ imageId, filename, rawKey }, "bg-removal start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.bgRemoval,
    jobId: String(job.id),
    kind: "bg-removal",
    payload: { imageId },
    at: Date.now(),
  });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `bgrm-${imageId}-`));
  const rawBase = basenameOfKey(rawKey);
  const rawTmp = path.join(workDir, rawBase);
  const outName = rawBase.replace(/\.[^.]+$/, "") + ".png";
  const outTmp = path.join(workDir, outName);
  const outKey = joinKey(PREFIX.generic, outName);

  try {
    const buf = await downloadObject(rawKey);
    await fs.writeFile(rawTmp, buf);

    const result = await runChild(rawTmp, outTmp);
    if (!result.ok) {
      logger.warn(
        { imageId, reason: result.reason },
        "bg-removal child failed — fallback: copy original"
      );
      await fs.writeFile(outTmp, buf);
    }

    let width: number | undefined;
    let height: number | undefined;
    try {
      const meta = await sharp(outTmp).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      /* non-fatal */
    }

    const outBytes = await fs.readFile(outTmp);
    await uploadObject(outKey, outBytes, "image/png");

    await markImageGeneric(imageId, rawKey, outKey, { width, height });
    await publishJobEvent({
      type: "completed",
      queue: QUEUE_NAMES.bgRemoval,
      jobId: String(job.id),
      result: { imageId, outKey },
      at: Date.now(),
    });
    logger.info({ imageId, outKey }, "bg-removal done");
    return { outKey };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
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
      await markImageFailed(job.data.imageId, job.data.rawKey, err.message);
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
