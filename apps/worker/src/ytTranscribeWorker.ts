import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  type YtTranscribeJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(job: Job<YtTranscribeJobData>): Promise<void> {
  logger.warn({ jobId: job.id, data: job.data }, "yt-transcribe stub (PR2)");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.ytTranscribe,
    jobId: String(job.id),
    kind: "yt-transcribe",
    payload: job.data ?? {},
    at: Date.now(),
  });
  throw new Error("yt-transcribe worker not implemented yet (PR2)");
}

export function startYtTranscribeWorker(): Worker<YtTranscribeJobData> {
  const worker = new Worker<YtTranscribeJobData>(QUEUE_NAMES.ytTranscribe, handle, {
    connection: getRedis(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "yt-transcribe failed");
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.ytTranscribe,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
