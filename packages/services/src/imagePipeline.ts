/**
 * Image ingestion / lifecycle.
 *
 * Storage backend: Supabase Storage (bucket "bank") — no local disk.
 * The `images.storageKey` column holds the bucket object key, e.g.
 *   raw/<file>, generic/<file>.png, done/<file>, fail/<file>
 */

import { createHash } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, images } from "@rush/db";
import { bgRemovalQueue } from "./queues";
import { publishJobEvent } from "./redis";
import {
  PREFIX,
  joinKey,
  basenameOfKey,
  prefixOfKey,
  uploadObject,
  moveObject,
  removeObject,
  existsObject,
} from "./storage";

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function sanitizeName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 120);
}

function contentTypeForExt(ext: string): string {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

export interface UploadInput {
  filename: string;
  buffer: Buffer;
  source: "upload_raw" | "upload_generic" | "pinterest";
}

export interface UploadResult {
  imageId: number;
  status: "raw" | "generic" | "duplicate";
  storageKey: string;
}

/**
 * Persist an uploaded file:
 * - upload_generic → goes to generic/, status=generic
 * - upload_raw     → goes to raw/, status=raw, enqueues bg-removal job
 */
export async function ingestUpload({ filename, buffer, source }: UploadInput): Promise<UploadResult> {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new Error(`Unsupported extension: ${ext}`);

  const hash = sha256(buffer);
  const db = getDb();

  const [existing] = await db.select().from(images).where(eq(images.hash, hash)).limit(1);
  if (existing) {
    return { imageId: existing.id, status: "duplicate", storageKey: existing.storageKey };
  }

  const safe = sanitizeName(filename);
  const stamped = `${Date.now()}-${hash.slice(0, 8)}-${safe}`;

  const dbStatus: "raw" | "generic" = source === "upload_generic" ? "generic" : "raw";
  const storageKey =
    dbStatus === "generic"
      ? joinKey(PREFIX.generic, stamped)
      : joinKey(PREFIX.raw, stamped);

  await uploadObject(storageKey, buffer, contentTypeForExt(ext));

  const [row] = await db
    .insert(images)
    .values({
      filename: safe,
      storageKey,
      status: dbStatus,
      source,
      hash,
    })
    .returning();

  if (dbStatus === "raw") {
    await bgRemovalQueue().add(
      "bg-removal",
      { imageId: row.id, rawKey: storageKey, filename: safe },
      { jobId: `bg-${row.id}` }
    );
  }

  await publishJobEvent({
    type: "image:updated",
    imageId: row.id,
    status: row.status,
    at: Date.now(),
  });

  return { imageId: row.id, status: dbStatus, storageKey };
}

/** Mark image as fail: move object to fail/ and update DB. */
export async function markImageFailed(imageId: number, srcKey: string, err: string): Promise<void> {
  const destKey = joinKey(PREFIX.fail, basenameOfKey(srcKey));
  try {
    await moveObject(srcKey, destKey);
  } catch {
    /* best-effort — file may already have been moved */
  }
  const db = getDb();
  await db
    .update(images)
    .set({ status: "fail", storageKey: destKey, updatedAt: new Date() })
    .where(eq(images.id, imageId));
  await publishJobEvent({ type: "image:updated", imageId, status: "fail", at: Date.now() });
  void err;
}

/** Mark image as generic after successful bg-removal. Moves raw → done/, sets storageKey to outKey. */
export async function markImageGeneric(
  imageId: number,
  rawKey: string,
  outKey: string,
  meta: { width?: number; height?: number }
): Promise<void> {
  const doneKey = joinKey(PREFIX.done, basenameOfKey(rawKey));
  try {
    await moveObject(rawKey, doneKey);
  } catch {
    /* best-effort */
  }
  const db = getDb();
  await db
    .update(images)
    .set({
      status: "generic",
      storageKey: outKey,
      width: meta.width,
      height: meta.height,
      updatedAt: new Date(),
    })
    .where(eq(images.id, imageId));
  await publishJobEvent({ type: "image:updated", imageId, status: "generic", at: Date.now() });
}

/**
 * Re-enqueue a bg-removal job for an existing image:
 *  - locate the original "raw" object (current key, or done/fail variants),
 *  - move it back under raw/,
 *  - reset DB status to "raw",
 *  - enqueue a new bg-removal job.
 */
export async function requeueBgRemoval(imageId: number): Promise<string> {
  const db = getDb();
  const [row] = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
  if (!row) throw new Error(`image #${imageId} not found`);

  const currentKey = row.storageKey;
  const currentBase = basenameOfKey(currentKey);
  const stem = currentBase.replace(/\.[^.]+$/, "");
  const originalExt = path.extname(row.filename) || path.extname(currentBase);
  const originalBase = `${stem}${originalExt}`;

  const candidates = [
    currentKey,
    joinKey(PREFIX.raw, originalBase),
    joinKey(PREFIX.done, originalBase),
    joinKey(PREFIX.fail, originalBase),
    joinKey(PREFIX.done, currentBase),
    joinKey(PREFIX.fail, currentBase),
  ];
  let sourceKey: string | null = null;
  for (const c of candidates) {
    if (await existsObject(c)) {
      sourceKey = c;
      break;
    }
  }
  if (!sourceKey) throw new Error(`source object missing for image #${imageId}`);

  const rawKey = joinKey(PREFIX.raw, originalBase);
  if (sourceKey !== rawKey) {
    try {
      await moveObject(sourceKey, rawKey);
    } catch (e) {
      throw new Error(`failed to relocate to raw/: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await db
    .update(images)
    .set({ status: "raw", storageKey: rawKey, updatedAt: new Date() })
    .where(eq(images.id, imageId));

  await bgRemovalQueue().add(
    "bg-removal",
    { imageId, rawKey, filename: row.filename },
    { jobId: `bg-${imageId}-${Date.now()}` }
  );

  await publishJobEvent({
    type: "image:updated",
    imageId,
    status: "raw",
    at: Date.now(),
  });

  return rawKey;
}

/** Delete an image (DB + storage). Best-effort on storage. */
export async function deleteImage(imageId: number): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
  if (!row) return;
  await removeObject(row.storageKey).catch(() => undefined);
  await db.delete(images).where(eq(images.id, imageId));
  await publishJobEvent({ type: "image:updated", imageId, status: "deleted", at: Date.now() });
}

/** Re-export for convenience. */
export { PREFIX, prefixOfKey };
