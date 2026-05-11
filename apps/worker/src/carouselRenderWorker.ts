import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  renderCarousel,
  type CarouselRenderJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(job: Job<CarouselRenderJobData>): Promise<{ carouselId: number; count: number }> {
  const { carouselId, format } = job.data;
  logger.info({ jobId: job.id, carouselId, format }, "carousel-render start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.carouselRender,
    jobId: String(job.id),
    kind: "carousel-render",
    payload: { carouselId, format },
    at: Date.now(),
  });

  const result = await renderCarousel({
    carouselId,
    format,
    onProgress: (pct) => {
      void job.updateProgress(pct);
    },
  });

  logger.info({ jobId: job.id, carouselId, count: result.paths.length }, "carousel-render done");
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.carouselRender,
    jobId: String(job.id),
    result: { carouselId, count: result.paths.length, format: result.format },
    at: Date.now(),
  });
  return { carouselId, count: result.paths.length };
}

export function startCarouselRenderWorker(): Worker<CarouselRenderJobData> {
  const worker = new Worker<CarouselRenderJobData>(QUEUE_NAMES.carouselRender, handle, {
    connection: getRedis(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, carouselId: job?.data?.carouselId, err: err.message }, "carousel-render failed");
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.carouselRender,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
