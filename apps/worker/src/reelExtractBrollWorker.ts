import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  type ReelExtractBrollJobData,
} from "@rush/services";
import { logger } from "./logger";
import { extractBrollClips } from "@rush/services";

async function handle(job: Job<ReelExtractBrollJobData>): Promise<void> {
  const { reelId } = job.data;
  logger.info({ jobId: job.id, reelId }, "reel-extract-broll start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.reelExtractBroll,
    jobId: String(job.id),
    kind: "reel-extract-broll",
    payload: { reelId },
    at: Date.now(),
  });
  const keys = await extractBrollClips({ reelId });
  logger.info({ jobId: job.id, reelId, keys }, "reel-extract-broll done");
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.reelExtractBroll,
    jobId: String(job.id),
    result: { reelId, keys },
    at: Date.now(),
  });
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
