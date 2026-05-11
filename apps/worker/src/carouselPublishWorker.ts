import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  publishCarouselFlow,
  type CarouselPublishJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(
  job: Job<CarouselPublishJobData>
): Promise<{ carouselId: number; publerPostId: string; scheduled: boolean }> {
  const { carouselId, scheduledAt, format, forceRerender } = job.data;
  logger.info({ jobId: job.id, carouselId, scheduledAt }, "carousel-publish start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.carouselPublish,
    jobId: String(job.id),
    kind: "carousel-publish",
    payload: { carouselId, scheduledAt, format, forceRerender },
    at: Date.now(),
  });

  const result = await publishCarouselFlow({
    carouselId,
    scheduledAt: scheduledAt ?? null,
    format,
    forceRerender,
  });

  logger.info(
    { jobId: job.id, carouselId, publerPostId: result.publerPostId, url: result.url },
    "carousel-publish done"
  );
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.carouselPublish,
    jobId: String(job.id),
    result: {
      carouselId: result.carouselId,
      publerPostId: result.publerPostId,
      url: result.url,
      scheduled: result.scheduled,
    },
    at: Date.now(),
  });
  return { carouselId, publerPostId: result.publerPostId, scheduled: result.scheduled };
}

export function startCarouselPublishWorker(): Worker<CarouselPublishJobData> {
  const worker = new Worker<CarouselPublishJobData>(QUEUE_NAMES.carouselPublish, handle, {
    connection: getRedis(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, carouselId: job?.data?.carouselId, err: err.message },
      "carousel-publish failed"
    );
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.carouselPublish,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
