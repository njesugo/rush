import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cloudflare Worker <-> rush-v2 bridge.
 *
 * Both sides share `CLEANUP_BRIDGE_SECRET`. The signature is HMAC-SHA256 of
 * the raw request body, hex-encoded. Replay protection is provided by an
 * `X-Rush-Timestamp` header (unix seconds) included in the signed payload
 * (`<timestamp>.<body>`), with a 5-minute window.
 */

const MAX_SKEW_SECONDS = 5 * 60;

export const SIGNATURE_HEADER = "x-rush-signature";
export const TIMESTAMP_HEADER = "x-rush-timestamp";

function getSecret(): string {
  const secret = process.env.CLEANUP_BRIDGE_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("CLEANUP_BRIDGE_SECRET missing or too short (>=16 chars)");
  }
  return secret;
}

export function sign(body: string, timestamp: number, secret = getSecret()): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing-headers" | "stale" | "bad-signature" | "no-secret" };

export function verify(
  body: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!signatureHeader || !timestampHeader) return { ok: false, reason: "missing-headers" };
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return { ok: false, reason: "missing-headers" };
  if (Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return { ok: false, reason: "no-secret" };
  }

  const expected = sign(body, ts, secret);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signatureHeader, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }
  return { ok: true };
}

/**
 * Push items to the Cloudflare review worker. The worker is expected to expose
 * `POST {CLEANUP_WORKER_URL}` accepting `{ items: [...] }` with the same HMAC
 * signature scheme.
 */
export async function pushToReviewWorker<T>(
  items: T[]
): Promise<{ status: number; body: string }> {
  const url = process.env.CLEANUP_WORKER_URL;
  if (!url) throw new Error("CLEANUP_WORKER_URL not set");

  const payload = JSON.stringify({ items });
  const ts = Math.floor(Date.now() / 1000);
  const sig = sign(payload, ts);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [SIGNATURE_HEADER]: sig,
      [TIMESTAMP_HEADER]: String(ts),
    },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}
