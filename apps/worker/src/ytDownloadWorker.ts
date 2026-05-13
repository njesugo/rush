import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  downloadSourceVideo,
  transcribeSourceVideo,
  type YtDownloadJobData,
} from "@rush/services";
import { logger } from "./logger";

/**
 * Download a YouTube video and transcribe it in one shot. We chain the two
 * steps inside the same job so we don't have to upload/redownload the WAV.
 *
 * The DB row is updated as: pending → downloading → transcribing → ready (or failed).
 */
async function handle(job: Job<YtDownloadJobData>): Promise<{ storageKey: string }> {
  const { sourceVideoId } = job.data;
  logger.info({ jobId: job.id, sourceVideoId }, "yt-download start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.ytDownload,
    jobId: String(job.id),
    kind: "yt-download",
    payload: job.data,
    at: Date.now(),
  });

  const dl = await downloadSourceVideo(sourceVideoId);
  logger.info(
    { jobId: job.id, sourceVideoId, key: dl.storageKey, durationS: dl.durationS },
    "yt-download uploaded; transcribing"
  );
  await transcribeSourceVideo(sourceVideoId, dl.audioPath, dl.workDir);

  logger.info({ jobId: job.id, sourceVideoId }, "yt-download + transcribe done");
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.ytDownload,
    jobId: String(job.id),
    result: { sourceVideoId, storageKey: dl.storageKey },
    at: Date.now(),
  });

  return { storageKey: dl.storageKey };
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
