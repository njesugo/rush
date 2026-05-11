import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  syncPending,
  type PinterestSyncJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(job: Job<PinterestSyncJobData>) {
  const triggeredBy = job.data?.triggeredBy ?? "cron";
  logger.info({ jobId: job.id, triggeredBy }, "pinterest-sync start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.pinterestSync,
    jobId: String(job.id),
    kind: "pinterest-sync",
    payload: { triggeredBy },
    at: Date.now(),
  });

  const result = await syncPending();

  logger.info({ jobId: job.id, ...result }, "pinterest-sync done");
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.pinterestSync,
    jobId: String(job.id),
    result,
    at: Date.now(),
  });

  return result;
}

export function startPinterestSyncWorker(): Worker<PinterestSyncJobData> {
  const worker = new Worker<PinterestSyncJobData>(QUEUE_NAMES.pinterestSync, handle, {
    connection: getRedis(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "pinterest-sync failed");
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.pinterestSync,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
