import { NextRequest, NextResponse } from "next/server";
import { processWorkerItems, type WorkerItem } from "@rush/services";
import { verify, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "@/lib/cleanup-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook receiving swipes from the Cloudflare review worker.
 *
 * Authentication: HMAC-SHA256 over `<timestamp>.<rawBody>` using the shared
 * `CLEANUP_BRIDGE_SECRET`. Headers `X-Rush-Signature` (hex) and
 * `X-Rush-Timestamp` (unix seconds) are required. 5-minute replay window.
 *
 * Body: `{ items: WorkerItem[] }` where `WorkerItem` matches the existing
 * Pinterest sync shape (id, url, action, swiped_at, …).
 *
 * Response: `{ ok: true, processed, ackIds }`. The worker should drop the
 * acked ids from its KV queue.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const verdict = verify(
    raw,
    req.headers.get(SIGNATURE_HEADER),
    req.headers.get(TIMESTAMP_HEADER)
  );
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason }, { status: 401 });
  }

  let body: { items?: WorkerItem[] };
  try {
    body = JSON.parse(raw) as { items?: WorkerItem[] };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, ackIds: [] });
  }

  const result = await processWorkerItems(items);
  return NextResponse.json({
    ok: true,
    processed: result.downloaded + result.skipped,
    downloaded: result.downloaded,
    skipped: result.skipped,
    errors: result.errors,
    ackIds: result.ackIds,
  });
}
