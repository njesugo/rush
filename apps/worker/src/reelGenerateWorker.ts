import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  generateReelStoryboard,
  type ReelGenerateJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(job: Job<ReelGenerateJobData>): Promise<void> {
  const { reelId } = job.data;
  logger.info({ jobId: job.id, reelId }, "reel-generate start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.reelGenerate,
    jobId: String(job.id),
    kind: "reel-generate",
    payload: { reelId },
    at: Date.now(),
  });

  const storyboard = await generateReelStoryboard(reelId);

  logger.info(
    { jobId: job.id, reelId, blocks: storyboard.blocks.length },
    "reel-generate done"
  );
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.reelGenerate,
    jobId: String(job.id),
    result: { reelId, blocks: storyboard.blocks.length },
    at: Date.now(),
  });
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
