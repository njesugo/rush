/**
 * Supabase Storage abstraction for the bank.
 *
 * Replaces all fs.* operations on /data/bank with object storage.
 * The DB column `images.storageKey` (and `carousels.renderedPaths` entries)
 * are reused as-is — they map 1:1 to object keys inside the bucket.
 *
 *   raw/<file>          — original uploads awaiting bg-removal
 *   generic/<file>.png  — bg-removed assets ready for carousels
 *   done/<file>         — original raw kept after successful processing
 *   fail/<file>         — failed bg-removal attempts
 *   output/<file>.png   — rendered carousel slides
 */

import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// Node 20 (alpine) has no native WebSocket — supabase-js realtime requires one
// even when we only use Storage. Provide a polyfill via the `ws` package.
import WebSocket from "ws";

export const BANK_BUCKET = process.env.BANK_BUCKET || "bank";

export const PREFIX = {
  raw: "raw",
  generic: "generic",
  done: "done",
  fail: "fail",
  output: "output",
} as const;

let _client: SupabaseClient | null = null;

export function getStorage(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as never },
  });
  return _client;
}

function bucket() {
  return getStorage().storage.from(BANK_BUCKET);
}

function contentTypeForKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

/** Upload bytes to bucket. Overwrites if the key already exists. */
export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string
): Promise<void> {
  const { error } = await bucket().upload(key, body, {
    contentType: contentType ?? contentTypeForKey(key),
    upsert: true,
  });
  if (error) throw new Error(`storage upload failed (${key}): ${error.message}`);
}

/** Download bytes for a given key. */
export async function downloadObject(key: string): Promise<Buffer> {
  const { data, error } = await bucket().download(key);
  if (error || !data) {
    throw new Error(`storage download failed (${key}): ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Move object server-side. No-op if from === to. */
export async function moveObject(fromKey: string, toKey: string): Promise<void> {
  if (fromKey === toKey) return;
  const { error } = await bucket().move(fromKey, toKey);
  if (error) throw new Error(`storage move failed (${fromKey} -> ${toKey}): ${error.message}`);
}

/** Best-effort remove (ignores 404). */
export async function removeObject(key: string): Promise<void> {
  const { error } = await bucket().remove([key]);
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`storage remove failed (${key}): ${error.message}`);
  }
}

/** Bulk remove (ignores not-found errors per file). */
export async function removeObjects(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const { error } = await bucket().remove(keys);
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`storage bulk remove failed: ${error.message}`);
  }
}

/** Lightweight existence check using a 1-byte HEAD-like list. */
export async function existsObject(key: string): Promise<boolean> {
  const dir = path.posix.dirname(key);
  const base = path.posix.basename(key);
  const { data, error } = await bucket().list(dir === "." ? "" : dir, {
    limit: 1,
    search: base,
  });
  if (error) return false;
  return !!data?.some((item) => item.name === base);
}

/** Generate a short-lived signed URL (default 5 min) for client-side download. */
export async function signedUrl(key: string, expiresInSec = 300): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(key, expiresInSec);
  if (error || !data?.signedUrl) {
    throw new Error(`storage signedUrl failed (${key}): ${error?.message ?? "no url"}`);
  }
  return data.signedUrl;
}

/** Build a key under a prefix (e.g. PREFIX.raw, basename). */
export function joinKey(prefix: string, name: string): string {
  return `${prefix}/${name}`;
}

/** Extract the basename portion of a storage key. */
export function basenameOfKey(key: string): string {
  return path.posix.basename(key);
}

/** Extract the prefix (top-level folder) of a key. */
export function prefixOfKey(key: string): string {
  const idx = key.indexOf("/");
  return idx === -1 ? "" : key.slice(0, idx);
}
