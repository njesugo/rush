import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, images, pinterestAssets } from "@rush/db";
import { pushToReviewWorker } from "@/lib/cleanup-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Push a batch of bg-removed images to the Cloudflare review worker so they
 * appear in the mobile swipe queue. Body: `{ limit?: number; ids?: number[] }`.
 *
 * Selection (when `ids` not provided): images with status `generic` (i.e.
 * background removed, ready for human review) that are not yet linked to a
 * `pinterest_assets` row in `review_pending` state. Limit defaults to 20.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    ids?: number[];
  };
  const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);

  const db = getDb();

  const rows = body.ids?.length
    ? await db
        .select({ id: images.id, storageKey: images.storageKey, filename: images.filename })
        .from(images)
        .where(inArray(images.id, body.ids))
    : await db
        .select({ id: images.id, storageKey: images.storageKey, filename: images.filename })
        .from(images)
        .where(eq(images.status, "generic"))
        .limit(limit);

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, pushed: 0, items: [] });
  }

  const items = rows.map((r) => ({
    imageId: r.id,
    filename: r.filename,
    url: `${process.env.AUTH_URL ?? ""}/api/bank/file/${r.id}`,
  }));

  let workerResponse: { status: number; body: string };
  try {
    workerResponse = await pushToReviewWorker(items);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "push failed" },
      { status: 500 }
    );
  }

  if (workerResponse.status >= 400) {
    return NextResponse.json(
      { error: "worker rejected", status: workerResponse.status, body: workerResponse.body },
      { status: 502 }
    );
  }

  // Mark images as review_pending so they aren't pushed again.
  await db
    .update(images)
    .set({ status: "review_pending", updatedAt: new Date() })
    .where(
      and(
        inArray(
          images.id,
          rows.map((r) => r.id)
        ),
        eq(images.status, "generic")
      )
    );

  // touch pinterest_assets rows linked to these images so the dashboard reflects the push
  await db
    .update(pinterestAssets)
    .set({ syncedAt: new Date() })
    .where(
      and(
        inArray(
          pinterestAssets.imageId,
          rows.map((r) => r.id)
        ),
        isNull(pinterestAssets.error)
      )
    );

  return NextResponse.json({ ok: true, pushed: items.length, items });
}
