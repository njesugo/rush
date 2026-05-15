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
  ytDownload: "yt-download",
  ytTranscribe: "yt-transcribe",
  reelGenerate: "reel-generate",
  reelExtractBroll: "reel-extract-broll",
  reelRenderRemotion: "reel-render-remotion",
  textCutRender: "text-cut-render",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/* ---------- Job payload types ---------- */
export interface BgRemovalJobData {
  imageId: number;
  rawKey: string; // storage key inside the bank bucket (e.g. "raw/...")
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
  /** Si fourni, seules ces slides sont (re)rendues ; les autres conservent leur PNG existant. */
  onlySlideNumbers?: number[];
}

export interface CarouselPublishJobData {
  carouselId: number;
  scheduledAt?: string | null;
  format?: "1:1" | "4:5";
  forceRerender?: boolean;
}

/** Download a YouTube video (yt-dlp), upload mp4 to Supabase. */
export interface YtDownloadJobData {
  sourceVideoId: number;
}

/** Run Whisper over a downloaded source video and persist transcript. */
export interface YtTranscribeJobData {
  sourceVideoId: number;
}

/** Ask Claude to produce a reel storyboard from the transcript + user angle. */
export interface ReelGenerateJobData {
  reelId: number;
}

/** FFmpeg-extract every block's B-roll clip into Supabase Storage. */
export interface ReelExtractBrollJobData {
  reelId: number;
}

/** v2: Whisper VO -> Claude storyboard -> Remotion render -> upload mp4. */
export interface ReelRenderRemotionJobData {
  reelId: number;
}

/** Text-match-cut viral video generator. */
export interface TextCutRenderJobData {
  videoId: number;
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

export const ytDownloadQueue = () => makeQueue<YtDownloadJobData>(QUEUE_NAMES.ytDownload);
export const ytTranscribeQueue = () =>
  makeQueue<YtTranscribeJobData>(QUEUE_NAMES.ytTranscribe);
export const reelGenerateQueue = () =>
  makeQueue<ReelGenerateJobData>(QUEUE_NAMES.reelGenerate);
export const reelExtractBrollQueue = () =>
  makeQueue<ReelExtractBrollJobData>(QUEUE_NAMES.reelExtractBroll);
export const reelRenderRemotionQueue = () =>
  makeQueue<ReelRenderRemotionJobData>(QUEUE_NAMES.reelRenderRemotion);
export const textCutRenderQueue = () =>
  makeQueue<TextCutRenderJobData>(QUEUE_NAMES.textCutRender);

export type { JobsOptions };
