import "./loadEnv";
import { logger } from "./logger";
import { startBgRemovalWorker } from "./bgRemovalWorker";
import { startNewsScrapeWorker } from "./newsScrapeWorker";
import { startCarouselGenerateWorker } from "./carouselGenerateWorker";
import { startPinterestSyncWorker } from "./pinterestSyncWorker";
import { startCarouselRenderWorker } from "./carouselRenderWorker";
import { startCarouselPublishWorker } from "./carouselPublishWorker";
import { startYtDownloadWorker } from "./ytDownloadWorker";
import { startYtTranscribeWorker } from "./ytTranscribeWorker";
import { startReelGenerateWorker } from "./reelGenerateWorker";
import { startReelExtractBrollWorker } from "./reelExtractBrollWorker";
import { startReelRenderRemotionWorker } from "./reelRenderRemotionWorker";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not set");
  if (!process.env.SUPABASE_URL) throw new Error("SUPABASE_URL is not set");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  logger.info("Rush worker starting…");

  const workers = [
    startBgRemovalWorker(),
    startNewsScrapeWorker(),
    startCarouselGenerateWorker(),
    startPinterestSyncWorker(),
    startCarouselRenderWorker(),
    startCarouselPublishWorker(),
    startYtDownloadWorker(),
    startYtTranscribeWorker(),
    startReelGenerateWorker(),
    startReelExtractBrollWorker(),
    startReelRenderRemotionWorker(),
  ];

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down workers");
    await Promise.allSettled(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  logger.info({ queues: workers.length }, "workers ready");
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, "worker failed to start");
  process.exit(1);
});
