import path from "node:path";
import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  renderTextCut,
  type TextCutRenderJobData,
} from "@rush/services";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { logger } from "./logger";

let bundlePromise: Promise<string> | null = null;
function getRemotionBundle(): Promise<string> {
  if (bundlePromise) return bundlePromise;
  const entry = path.resolve(__dirname, "../../remotion/src/index.ts");
  logger.info({ entry }, "remotion bundle (textcut): starting");
  bundlePromise = bundle({
    entryPoint: entry,
    webpackOverride: (config) => config,
  }).then((url) => {
    logger.info({ url }, "remotion bundle (textcut): ready");
    return url;
  });
  return bundlePromise;
}

const CHROMIUM_PATH = process.env.REMOTION_CHROMIUM_PATH || "/usr/bin/chromium";

function existsOrNull(p: string): string | null {
  try {
    require("node:fs").accessSync(p);
    return p;
  } catch {
    return null;
  }
}

async function handle(job: Job<TextCutRenderJobData>): Promise<void> {
  const { videoId } = job.data;
  logger.info({ jobId: job.id, videoId }, "text-cut-render start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.textCutRender,
    jobId: String(job.id),
    kind: "text-cut-render",
    payload: { videoId },
    at: Date.now(),
  });

  const result = await renderTextCut({
    videoId,
    render: async ({ props, silentOutPath }) => {
      const serveUrl = await getRemotionBundle();
      const composition = await selectComposition({
        serveUrl,
        id: "TextMatchCut",
        inputProps: props,
        browserExecutable: existsOrNull(CHROMIUM_PATH),
      });
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation: silentOutPath,
        inputProps: props,
        browserExecutable: existsOrNull(CHROMIUM_PATH),
        chromiumOptions: { headless: true },
        // 90 frames at 30fps; render in seconds.
        timeoutInMilliseconds: 2 * 60_000,
        concurrency: Math.min(
          2,
          Math.max(1, parseInt(process.env.REMOTION_CONCURRENCY || "2", 10))
        ),
      });
    },
  });

  logger.info(
    { jobId: job.id, videoId, key: result.renderedVideoKey },
    "text-cut-render done"
  );
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.textCutRender,
    jobId: String(job.id),
    result: { videoId, renderedVideoKey: result.renderedVideoKey },
    at: Date.now(),
  });
}

export function startTextCutRenderWorker(): Worker<TextCutRenderJobData> {
  const worker = new Worker<TextCutRenderJobData>(
    QUEUE_NAMES.textCutRender,
    handle,
    {
      connection: getRedis(),
      concurrency: 1,
      lockDuration: 5 * 60_000,
    }
  );
  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message },
      "text-cut-render failed"
    );
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.textCutRender,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
