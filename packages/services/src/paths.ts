import path from "node:path";
import fs from "node:fs/promises";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_BANK_DIR = path.join(PROJECT_ROOT, "data", "bank");

export const BANK_DIR = process.env.BANK_DIR
  ? path.isAbsolute(process.env.BANK_DIR)
    ? process.env.BANK_DIR
    : path.resolve(PROJECT_ROOT, process.env.BANK_DIR)
  : DEFAULT_BANK_DIR;

export const RAW_DIR = path.join(BANK_DIR, "raw");
export const GENERIC_DIR = path.join(BANK_DIR, "generic");
export const DONE_DIR = path.join(BANK_DIR, "done");
export const FAIL_DIR = path.join(BANK_DIR, "fail");
export const OUTPUT_DIR = path.join(BANK_DIR, "output");

export async function ensureBankDirs(): Promise<void> {
  for (const d of [BANK_DIR, RAW_DIR, GENERIC_DIR, DONE_DIR, FAIL_DIR, OUTPUT_DIR]) {
    await fs.mkdir(d, { recursive: true });
  }
}

/** Map an image row storageKey (relative to BANK_DIR) to absolute path. */
export function resolveStorage(storageKey: string): string {
  return path.join(BANK_DIR, storageKey);
}

/** Reverse: absolute path → key relative to BANK_DIR. */
export function toStorageKey(absPath: string): string {
  return path.relative(BANK_DIR, absPath).split(path.sep).join("/");
}
