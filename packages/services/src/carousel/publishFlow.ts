/**
 * Orchestration of the publish flow:
 *  1. Ensure the carousel has rendered PNGs (call renderer if missing).
 *  2. Upload + schedule/publish on Instagram via Publer.
 *  3. Persist publerJobId, publerPostId, publerPostUrl, publishedAt and status.
 */

import { eq } from "drizzle-orm";
import { getDb, carousels } from "@rush/db";
import { renderCarousel, loadRenderedPaths, type RenderFormat } from "./renderer";
import { publishCarousel } from "../publer";

export interface PublishCarouselFlowArgs {
  carouselId: number;
  scheduledAt?: string | null;
  format?: RenderFormat;
  forceRerender?: boolean;
}

export interface PublishCarouselFlowResult {
  carouselId: number;
  publerPostId: string;
  publerJobId: string;
  url: string | null;
  scheduled: boolean;
}

export async function publishCarouselFlow(
  args: PublishCarouselFlowArgs
): Promise<PublishCarouselFlowResult> {
  const { carouselId, scheduledAt = null, format = "4:5", forceRerender = false } = args;
  const db = getDb();
  const [row] = await db.select().from(carousels).where(eq(carousels.id, carouselId)).limit(1);
  if (!row) throw new Error(`carousel #${carouselId} introuvable`);
  if (!row.caption || !row.caption.trim()) {
    throw new Error("Caption vide — impossible de publier");
  }

  let pngPaths = forceRerender ? [] : await loadRenderedPaths(carouselId);
  if (!pngPaths.length) {
    const r = await renderCarousel({ carouselId, format });
    pngPaths = r.paths;
  }
  if (pngPaths.length < 2) throw new Error("Moins de 2 slides rendues, impossible de publier");

  const result = await publishCarousel({
    pngPaths,
    caption: row.caption,
    scheduledAt,
  });

  await db
    .update(carousels)
    .set({
      publerJobId: result.jobId,
      publerPostId: result.id,
      publerPostUrl: result.url,
      status: result.scheduled ? "scheduled" : "published",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : row.scheduledAt,
      publishedAt: result.scheduled ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(carousels.id, carouselId));

  return {
    carouselId,
    publerPostId: result.id,
    publerJobId: result.jobId,
    url: result.url,
    scheduled: result.scheduled,
  };
}
