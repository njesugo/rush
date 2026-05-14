import path from "node:path";
import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAMES,
  getRedis,
  publishJobEvent,
  renderReelV2,
  type ReelRenderRemotionJobData,
} from "@rush/services";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { logger } from "./logger";

/**
 * Resolve the Remotion entry point (apps/remotion/src/index.ts) once at
 * module load. We cache the bundle URL across jobs to avoid re-bundling
 * the React tree for every render.
 */
let bundlePromise: Promise<string> | null = null;
function getRemotionBundle(): Promise<string> {
  if (bundlePromise) return bundlePromise;
  // From apps/worker/dist (or src) → ../../apps/remotion/src/index.ts
  const entry = path.resolve(__dirname, "../../remotion/src/index.ts");
  logger.info({ entry }, "remotion bundle: starting");
  bundlePromise = bundle({
    entryPoint: entry,
    onProgress: (p) => {
      if (p % 25 === 0) logger.debug({ p }, "remotion bundle progress");
    },
    webpackOverride: (config) => config,
  }).then((url) => {
    logger.info({ url }, "remotion bundle: ready");
    return url;
  });
  return bundlePromise;
}

/** System Chromium path inside the Docker image (Alpine + apk chromium). */
const CHROMIUM_PATH = process.env.REMOTION_CHROMIUM_PATH || "/usr/bin/chromium";

async function handle(job: Job<ReelRenderRemotionJobData>): Promise<void> {
  const { reelId } = job.data;
  logger.info({ jobId: job.id, reelId }, "reel-render-remotion start");
  await publishJobEvent({
    type: "started",
    queue: QUEUE_NAMES.reelRenderRemotion,
    jobId: String(job.id),
    kind: "reel-render-remotion",
    payload: { reelId },
    at: Date.now(),
  });

  const result = await renderReelV2({
    reelId,
    render: async ({ storyboard, outPath }) => {
      const serveUrl = await getRemotionBundle();

      const composition = await selectComposition({
        serveUrl,
        id: "Reel",
        inputProps: storyboard,
        // Use system chromium installed by the Dockerfile rather than
        // letting Remotion download its own (the auto-install path crashes
        // on Alpine because of missing nspr/nss).
        browserExecutable: existsOrNull(CHROMIUM_PATH),
      });

      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation: outPath,
        inputProps: storyboard,
        browserExecutable: existsOrNull(CHROMIUM_PATH),
        // Encode the user's voice-over alongside the video.
        // The composition already injects an <Audio src={assets.voiceUrl} />.
        chromiumOptions: { headless: true },
        timeoutInMilliseconds: 5 * 60_000,
        // 30 fps × 60s max ⇒ ~1800 frames; small concurrency keeps RAM bounded.
        concurrency: Math.min(2, Math.max(1, parseInt(process.env.REMOTION_CONCURRENCY || "2", 10))),
      });
    },
  });

  logger.info(
    { jobId: job.id, reelId, key: result.renderedVideoKey },
    "reel-render-remotion done"
  );
  await publishJobEvent({
    type: "completed",
    queue: QUEUE_NAMES.reelRenderRemotion,
    jobId: String(job.id),
    result: { reelId, renderedVideoKey: result.renderedVideoKey },
    at: Date.now(),
  });
}

/**
 * Returns the path if it exists, otherwise null so Remotion falls back to its
 * downloaded copy of headless Chromium (useful in dev outside Docker).
 */
function existsOrNull(p: string): string | null {
  try {
    require("node:fs").accessSync(p);
    return p;
  } catch {
    return null;
  }
}

export function startReelRenderRemotionWorker(): Worker<ReelRenderRemotionJobData> {
  const worker = new Worker<ReelRenderRemotionJobData>(
    QUEUE_NAMES.reelRenderRemotion,
    handle,
    {
      connection: getRedis(),
      // Render is CPU + GPU-ish heavy; one at a time per worker dyno.
      concurrency: 1,
      lockDuration: 10 * 60_000, // 10 min — renders can be long.
    }
  );
  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message },
      "reel-render-remotion failed"
    );
    void publishJobEvent({
      type: "failed",
      queue: QUEUE_NAMES.reelRenderRemotion,
      jobId: String(job?.id ?? "?"),
      error: err.message,
      at: Date.now(),
    });
  });
  return worker;
}
