import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  generateCarouselForNews,
  markCarouselFailed,
  type CarouselGenerateJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(job: Job<CarouselGenerateJobData>): Promise<{ carouselId: number; slideCount: number }> {
  const { carouselId, newsId, angleIndex } = job.data;
  logger.info({ jobId: job.id, carouselId, newsId, angleIndex }, "carousel-generate start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.carouselGenerate,
    jobId: String(job.id),
    kind: "carousel-generate",
    payload: { carouselId, newsId, angleIndex },
    at: Date.now(),
  });

  const result = await generateCarouselForNews({ carouselId, newsId, angleIndex });

  logger.info(
    { jobId: job.id, carouselId, slides: result.slides.length },
    "carousel-generate done"
  );

  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.carouselGenerate,
    jobId: String(job.id),
    result: { carouselId, slideCount: result.slides.length },
    at: Date.now(),
  });

  return { carouselId, slideCount: result.slides.length };
}

export function startCarouselGenerateWorker(): Worker<CarouselGenerateJobData> {
  const worker = new Worker<CarouselGenerateJobData>(QUEUE_NAMES.carouselGenerate, handle, {
    connection: getRedis(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    const carouselId = job?.data?.carouselId;
    logger.error({ jobId: job?.id, carouselId, err: err.message }, "carousel-generate failed");
    if (typeof carouselId === "number") {
      void markCarouselFailed(carouselId, err.message).catch((e) =>
        logger.error({ err: (e as Error).message }, "markCarouselFailed failed")
      );
    }
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.carouselGenerate,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
