import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  downloadSourceVideo,
  transcribeSourceVideo,
  type YtTranscribeJobData,
} from "@rush/services";
import { logger } from "./logger";

/**
 * Standalone re-transcription path: re-downloads the YouTube video to extract
 * audio (we don't keep the WAV around), then runs Whisper. The normal flow
 * (download → transcribe in one shot) is handled by the yt-download worker.
 */
async function handle(job: Job<YtTranscribeJobData>): Promise<void> {
  const { sourceVideoId } = job.data;
  logger.info({ jobId: job.id, sourceVideoId }, "yt-transcribe start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.ytTranscribe,
    jobId: String(job.id),
    kind: "yt-transcribe",
    payload: job.data,
    at: Date.now(),
  });

  const dl = await downloadSourceVideo(sourceVideoId);
  await transcribeSourceVideo(sourceVideoId, dl.audioPath, dl.workDir);

  logger.info({ jobId: job.id, sourceVideoId }, "yt-transcribe done");
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.ytTranscribe,
    jobId: String(job.id),
    result: { sourceVideoId, storageKey: dl.storageKey },
    at: Date.now(),
  });
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
