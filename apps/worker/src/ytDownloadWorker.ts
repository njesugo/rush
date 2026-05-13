import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  type YtDownloadJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(job: Job<YtDownloadJobData>): Promise<void> {
  logger.warn({ jobId: job.id, data: job.data }, "yt-download stub (PR2)");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.ytDownload,
    jobId: String(job.id),
    kind: "yt-download",
    payload: job.data ?? {},
    at: Date.now(),
  });
  throw new Error("yt-download worker not implemented yet (PR2)");
}

export function startYtDownloadWorker(): Worker<YtDownloadJobData> {
  const worker = new Worker<YtDownloadJobData>(QUEUE_NAMES.ytDownload, handle, {
    connection: getRedis(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "yt-download failed");
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.ytDownload,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
