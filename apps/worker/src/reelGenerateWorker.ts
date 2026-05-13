import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  type ReelGenerateJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(job: Job<ReelGenerateJobData>): Promise<void> {
  logger.warn({ jobId: job.id, data: job.data }, "reel-generate stub (PR3)");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.reelGenerate,
    jobId: String(job.id),
    kind: "reel-generate",
    payload: job.data ?? {},
    at: Date.now(),
  });
  throw new Error("reel-generate worker not implemented yet (PR3)");
}

export function startReelGenerateWorker(): Worker<ReelGenerateJobData> {
  const worker = new Worker<ReelGenerateJobData>(QUEUE_NAMES.reelGenerate, handle, {
    connection: getRedis(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "reel-generate failed");
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.reelGenerate,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
