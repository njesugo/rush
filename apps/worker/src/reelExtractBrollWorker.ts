import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  type ReelExtractBrollJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(job: Job<ReelExtractBrollJobData>): Promise<void> {
  logger.warn({ jobId: job.id, data: job.data }, "reel-extract-broll stub (PR4)");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.reelExtractBroll,
    jobId: String(job.id),
    kind: "reel-extract-broll",
    payload: job.data ?? {},
    at: Date.now(),
  });
  throw new Error("reel-extract-broll worker not implemented yet (PR4)");
}

export function startReelExtractBrollWorker(): Worker<ReelExtractBrollJobData> {
  const worker = new Worker<ReelExtractBrollJobData>(QUEUE_NAMES.reelExtractBroll, handle, {
    connection: getRedis(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "reel-extract-broll failed");
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.reelExtractBroll,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
