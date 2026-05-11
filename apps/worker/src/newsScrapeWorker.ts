import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  scrapeNews,
  type NewsScrapeJobData,
} from "@rush/services";
import { logger } from "./logger";

async function handle(job: Job<NewsScrapeJobData>): Promise<{
  inserted: number;
  total: number;
  sources: { rss: number; tavily: number };
}> {
  logger.info({ jobId: job.id, data: job.data }, "news-scrape start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.newsScrape,
    jobId: String(job.id),
    kind: "news-scrape",
    payload: job.data ?? {},
    at: Date.now(),
  });

  const result = await scrapeNews({ useTavily: job.data?.useTavily });

  logger.info(
    {
      jobId: job.id,
      inserted: result.inserted,
      total: result.total,
      sources: result.sources,
      regions: result.regions,
    },
    "news-scrape done"
  );

  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.newsScrape,
    jobId: String(job.id),
    result: {
      inserted: result.inserted,
      total: result.total,
      sources: result.sources,
      regions: result.regions,
    },
    at: Date.now(),
  });

  return { inserted: result.inserted, total: result.total, sources: result.sources };
}

export function startNewsScrapeWorker(): Worker<NewsScrapeJobData> {
  const worker = new Worker<NewsScrapeJobData>(QUEUE_NAMES.newsScrape, handle, {
    connection: getRedis(),
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "news-scrape failed");
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.newsScrape,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
