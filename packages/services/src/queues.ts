import { Queue, type JobsOptions } from "bullmq";
import { getRedis } from "./redis";

export const QUEUE_NAMES = {
  bgRemoval: "bg-removal",
  pinterestScrape: "pinterest-scrape",
  publerSchedule: "publer-schedule",
  bankReviewPush: "bank-review-push",
  newsScrape: "news-scrape",
  carouselGenerate: "carousel-generate",
  pinterestSync: "pinterest-sync",
  carouselRender: "carousel-render",
  carouselPublish: "carousel-publish",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/* ---------- Job payload types ---------- */
export interface BgRemovalJobData {
  imageId: number;
  rawPath: string; // absolute path on disk
  filename: string;
}

export interface BankReviewPushJobData {
  imageIds: number[];
}

export interface PinterestScrapeJobData {
  keyword: string;
}

export interface PublerScheduleJobData {
  carouselId: number;
}

export interface NewsScrapeJobData {
  useTavily?: boolean;
  triggeredBy?: string;
}

export interface CarouselGenerateJobData {
  carouselId: number;
  newsId: number;
  angleIndex?: number;
}

export interface PinterestSyncJobData {
  triggeredBy?: string;
}

export interface CarouselRenderJobData {
  carouselId: number;
  format?: "1:1" | "4:5";
}

export interface CarouselPublishJobData {
  carouselId: number;
  scheduledAt?: string | null;
  format?: "1:1" | "4:5";
  forceRerender?: boolean;
}

/* ---------- Queue singletons ---------- */
const _queues = new Map<string, Queue>();

function makeQueue<T>(name: string): Queue<T> {
  const existing = _queues.get(name);
  if (existing) return existing as Queue<T>;
  const q = new Queue<T>(name, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  });
  _queues.set(name, q);
  return q;
}

export const bgRemovalQueue = () => makeQueue<BgRemovalJobData>(QUEUE_NAMES.bgRemoval);
export const bankReviewPushQueue = () => makeQueue<BankReviewPushJobData>(QUEUE_NAMES.bankReviewPush);
export const pinterestScrapeQueue = () => makeQueue<PinterestScrapeJobData>(QUEUE_NAMES.pinterestScrape);
export const publerScheduleQueue = () => makeQueue<PublerScheduleJobData>(QUEUE_NAMES.publerSchedule);
export const newsScrapeQueue = () => makeQueue<NewsScrapeJobData>(QUEUE_NAMES.newsScrape);
export const carouselGenerateQueue = () =>
  makeQueue<CarouselGenerateJobData>(QUEUE_NAMES.carouselGenerate);
export const pinterestSyncQueue = () =>
  makeQueue<PinterestSyncJobData>(QUEUE_NAMES.pinterestSync);

export const carouselRenderQueue = () =>
  makeQueue<CarouselRenderJobData>(QUEUE_NAMES.carouselRender);
export const carouselPublishQueue = () =>
  makeQueue<CarouselPublishJobData>(QUEUE_NAMES.carouselPublish);

export type { JobsOptions };
