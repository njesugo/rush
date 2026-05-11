import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, pinterestAssets, images } from "@rush/db";
import { ingestUpload } from "../imagePipeline";

export interface SyncResult {
  pulled: number;
  downloaded: number;
  skipped: number;
  errors: number;
  disabled?: boolean;
}

interface WorkerItem {
  id: string;
  url: string;
  pin_url?: string | null;
  source?: string | null;
  action: "kept" | "skipped";
  swiped_at?: string | null;
}

function workerEndpoint(p: string): string {
  const base = process.env.PINTEREST_WORKER_URL;
  if (!base) throw new Error("PINTEREST_WORKER_URL missing");
  return base.replace(/\/+$/, "") + p;
}

function workerHeaders(): Record<string, string> {
  const token = process.env.PINTEREST_WORKER_TOKEN;
  if (!token) throw new Error("PINTEREST_WORKER_TOKEN missing");
  return { "X-Sync-Token": token, "Content-Type": "application/json" };
}

function safeExtFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.(jpe?g|png|webp|gif)$/i);
    return m ? m[0].toLowerCase() : ".jpg";
  } catch {
    return ".jpg";
  }
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Pull pending swipes from the Cloudflare worker, download "kept" images
 * into the bank (which auto-enqueues bg-removal), record everything in
 * `pinterest_assets`, then ack the worker for processed ids.
 */
export async function syncPending(): Promise<SyncResult> {
  if (!process.env.PINTEREST_WORKER_URL || !process.env.PINTEREST_WORKER_TOKEN) {
    return { pulled: 0, downloaded: 0, skipped: 0, errors: 0, disabled: true };
  }

  const db = getDb();

  // 1) Pull pending
  let payload: { items?: WorkerItem[] };
  try {
    const res = await fetch(workerEndpoint("/api/pending"), { headers: workerHeaders() });
    if (!res.ok) throw new Error(`worker /api/pending HTTP ${res.status}`);
    payload = (await res.json()) as { items?: WorkerItem[] };
  } catch (err) {
    console.warn("[pinterest] pull failed:", (err as Error).message);
    return { pulled: 0, downloaded: 0, skipped: 0, errors: 1 };
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) return { pulled: 0, downloaded: 0, skipped: 0, errors: 0 };

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  const ackIds: string[] = [];

  for (const it of items) {
    if (!it || !it.id || !it.url) continue;

    // Skip if we already saw this worker_id
    const [existing] = await db
      .select({ id: pinterestAssets.id })
      .from(pinterestAssets)
      .where(eq(pinterestAssets.workerId, it.id))
      .limit(1);
    if (existing) {
      ackIds.push(it.id);
      continue;
    }

    if (it.action === "skipped") {
      await db.insert(pinterestAssets).values({
        workerId: it.id,
        url: it.url,
        pinUrl: it.pin_url ?? null,
        source: it.source ?? null,
        action: "skipped",
        swipedAt: it.swiped_at ? new Date(it.swiped_at) : null,
      });
      skipped++;
      ackIds.push(it.id);
      continue;
    }

    // kept → download into bank as a raw upload (auto bg-removal)
    try {
      const buf = await downloadBuffer(it.url);
      const ext = safeExtFromUrl(it.url);
      const hash = createHash("sha1").update(buf).digest("hex").slice(0, 12);
      const filename = `pin_${hash}${ext}`;

      const upload = await ingestUpload({ filename, buffer: buf, source: "pinterest" });

      await db.insert(pinterestAssets).values({
        workerId: it.id,
        url: it.url,
        pinUrl: it.pin_url ?? null,
        source: it.source ?? null,
        action: "kept",
        swipedAt: it.swiped_at ? new Date(it.swiped_at) : null,
        filename,
        imageId: upload.imageId,
        downloadedAt: new Date(),
      });

      downloaded++;
      ackIds.push(it.id);
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[pinterest] download failed ${it.url}:`, msg);
      await db.insert(pinterestAssets).values({
        workerId: it.id,
        url: it.url,
        pinUrl: it.pin_url ?? null,
        source: it.source ?? null,
        action: "kept",
        swipedAt: it.swiped_at ? new Date(it.swiped_at) : null,
        error: msg,
      });
      errors++;
      // do NOT ack — allow retry
    }
  }

  // 2) Ack the worker
  if (ackIds.length > 0) {
    try {
      const res = await fetch(workerEndpoint("/api/ack"), {
        method: "POST",
        headers: workerHeaders(),
        body: JSON.stringify({ ids: ackIds }),
      });
      if (!res.ok) console.warn(`[pinterest] ack HTTP ${res.status}`);
    } catch (err) {
      console.warn("[pinterest] ack failed:", (err as Error).message);
    }
  }

  return { pulled: items.length, downloaded, skipped, errors };
}

export interface PinterestStats {
  downloaded: number;
  pending: number;
  skipped: number;
  lastSync: Date | null;
  enabled: boolean;
  workerUrl: string | null;
}

export async function getStats(): Promise<PinterestStats> {
  const db = getDb();
  const [row] = await db
    .select({
      downloaded: sql<number>`SUM(CASE WHEN ${pinterestAssets.action} = 'kept' AND ${pinterestAssets.filename} IS NOT NULL THEN 1 ELSE 0 END)`,
      pending: sql<number>`SUM(CASE WHEN ${pinterestAssets.action} = 'kept' AND ${pinterestAssets.filename} IS NULL THEN 1 ELSE 0 END)`,
      skipped: sql<number>`SUM(CASE WHEN ${pinterestAssets.action} = 'skipped' THEN 1 ELSE 0 END)`,
      lastSync: sql<Date | null>`MAX(${pinterestAssets.syncedAt})`,
    })
    .from(pinterestAssets);

  return {
    downloaded: Number(row?.downloaded ?? 0),
    pending: Number(row?.pending ?? 0),
    skipped: Number(row?.skipped ?? 0),
    lastSync: row?.lastSync ?? null,
    enabled: !!(process.env.PINTEREST_WORKER_URL && process.env.PINTEREST_WORKER_TOKEN),
    workerUrl: process.env.PINTEREST_WORKER_URL ?? null,
  };
}

export interface PinterestAssetRow {
  id: number;
  workerId: string;
  url: string;
  pinUrl: string | null;
  source: string | null;
  action: string;
  filename: string | null;
  imageId: number | null;
  imageStatus: string | null;
  imageStorageKey: string | null;
  swipedAt: Date | null;
  syncedAt: Date;
  downloadedAt: Date | null;
  error: string | null;
}

export async function listAssets(opts: { limit?: number; action?: "kept" | "skipped" } = {}): Promise<PinterestAssetRow[]> {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 500);
  const rows = await db
    .select({
      id: pinterestAssets.id,
      workerId: pinterestAssets.workerId,
      url: pinterestAssets.url,
      pinUrl: pinterestAssets.pinUrl,
      source: pinterestAssets.source,
      action: pinterestAssets.action,
      filename: pinterestAssets.filename,
      imageId: pinterestAssets.imageId,
      imageStatus: images.status,
      imageStorageKey: images.storageKey,
      swipedAt: pinterestAssets.swipedAt,
      syncedAt: pinterestAssets.syncedAt,
      downloadedAt: pinterestAssets.downloadedAt,
      error: pinterestAssets.error,
    })
    .from(pinterestAssets)
    .leftJoin(images, eq(images.id, pinterestAssets.imageId))
    .orderBy(sql`${pinterestAssets.syncedAt} DESC`)
    .limit(limit);

  return rows.filter((r) => !opts.action || r.action === opts.action);
}
