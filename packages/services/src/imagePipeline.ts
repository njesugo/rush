import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, images } from "@rush/db";
import {
  BANK_DIR,
  RAW_DIR,
  GENERIC_DIR,
  DONE_DIR,
  FAIL_DIR,
  ensureBankDirs,
  toStorageKey,
  resolveStorage,
} from "./paths";
import { bgRemovalQueue } from "./queues";
import { publishJobEvent } from "./redis";

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function sanitizeName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 120);
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
 * - upload_generic → goes to /generic, status=generic
 * - upload_raw     → goes to /raw, status=raw, enqueues bg-removal job
 */
export async function ingestUpload({ filename, buffer, source }: UploadInput): Promise<UploadResult> {
  await ensureBankDirs();
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new Error(`Unsupported extension: ${ext}`);

  const hash = sha256(buffer);
  const db = getDb();

  // Dedupe by hash
  const [existing] = await db.select().from(images).where(eq(images.hash, hash)).limit(1);
  if (existing) {
    return { imageId: existing.id, status: "duplicate", storageKey: existing.storageKey };
  }

  const safe = sanitizeName(filename);
  const stamped = `${Date.now()}-${hash.slice(0, 8)}-${safe}`;

  let absPath: string;
  let dbStatus: "raw" | "generic";
  if (source === "upload_generic") {
    // Force PNG extension preserved
    absPath = path.join(GENERIC_DIR, stamped);
    dbStatus = "generic";
  } else {
    absPath = path.join(RAW_DIR, stamped);
    dbStatus = "raw";
  }

  await fs.writeFile(absPath, buffer);
  const storageKey = toStorageKey(absPath);

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
      { imageId: row.id, rawPath: absPath, filename: safe },
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

/** Mark image as fail (move file + update row). */
export async function markImageFailed(imageId: number, srcAbs: string, err: string): Promise<void> {
  await ensureBankDirs();
  const dest = path.join(FAIL_DIR, path.basename(srcAbs));
  try {
    await fs.rename(srcAbs, dest);
  } catch {
    /* ignore */
  }
  const db = getDb();
  await db
    .update(images)
    .set({ status: "fail", storageKey: toStorageKey(dest), updatedAt: new Date() })
    .where(eq(images.id, imageId));
  await publishJobEvent({ type: "image:updated", imageId, status: "fail", at: Date.now() });
  void err;
}

/** Mark image as generic after successful bg-removal. */
export async function markImageGeneric(
  imageId: number,
  rawAbs: string,
  outAbs: string,
  meta: { width?: number; height?: number }
): Promise<void> {
  await ensureBankDirs();
  // Move raw to done/
  try {
    await fs.rename(rawAbs, path.join(DONE_DIR, path.basename(rawAbs)));
  } catch {
    /* ignore */
  }
  const db = getDb();
  await db
    .update(images)
    .set({
      status: "generic",
      storageKey: toStorageKey(outAbs),
      width: meta.width,
      height: meta.height,
      updatedAt: new Date(),
    })
    .where(eq(images.id, imageId));
  await publishJobEvent({ type: "image:updated", imageId, status: "generic", at: Date.now() });
}

export { BANK_DIR, RAW_DIR, GENERIC_DIR, DONE_DIR, FAIL_DIR };

/**
 * Re-enqueue a bg-removal job for an existing image:
 * - Locate original raw file (in RAW_DIR / DONE_DIR / FAIL_DIR or current storage),
 * - Move it back to RAW_DIR if needed,
 * - Reset DB status to "raw",
 * - Enqueue a new bg-removal job.
 *
 * Returns the absolute raw path that will be processed.
 */
export async function requeueBgRemoval(imageId: number): Promise<string> {
  await ensureBankDirs();
  const db = getDb();
  const [row] = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
  if (!row) throw new Error(`image #${imageId} not found`);

  const currentAbs = resolveStorage(row.storageKey);
  const currentBase = path.basename(currentAbs);
  const stem = currentBase.replace(/\.[^.]+$/, "");
  const originalExt = path.extname(row.filename) || path.extname(currentBase);
  const originalBase = `${stem}${originalExt}`;

  const candidates = [
    currentAbs,
    path.join(RAW_DIR, originalBase),
    path.join(DONE_DIR, originalBase),
    path.join(FAIL_DIR, originalBase),
    path.join(DONE_DIR, currentBase),
    path.join(FAIL_DIR, currentBase),
  ];
  let sourceAbs: string | null = null;
  for (const c of candidates) {
    try {
      await fs.access(c);
      sourceAbs = c;
      break;
    } catch {
      /* keep trying */
    }
  }
  if (!sourceAbs) throw new Error(`source file missing for image #${imageId}`);

  let rawAbs = sourceAbs;
  if (path.dirname(sourceAbs) !== RAW_DIR) {
    rawAbs = path.join(RAW_DIR, originalBase);
    try {
      await fs.rename(sourceAbs, rawAbs);
    } catch {
      const buf = await fs.readFile(sourceAbs);
      await fs.writeFile(rawAbs, buf);
      await fs.unlink(sourceAbs).catch(() => {});
    }
  }

  await db
    .update(images)
    .set({ status: "raw", storageKey: toStorageKey(rawAbs), updatedAt: new Date() })
    .where(eq(images.id, imageId));

  await bgRemovalQueue().add(
    "bg-removal",
    { imageId, rawPath: rawAbs, filename: row.filename },
    { jobId: `bg-${imageId}-${Date.now()}` }
  );

  await publishJobEvent({
    type: "image:updated",
    imageId,
    status: "raw",
    at: Date.now(),
  });

  return rawAbs;
}
