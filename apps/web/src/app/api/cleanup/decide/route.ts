import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, images, pinterestSwipes } from "@rush/db";
import { publishJobEvent, requeueBgRemoval } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "keep" | "skip" | "redo";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { imageId?: number; action?: Action };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const { imageId, action } = body;
  if (!imageId || !action) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  if (action !== "keep" && action !== "skip" && action !== "redo") {
    return NextResponse.json({ error: "bad action" }, { status: 400 });
  }

  const db = getDb();
  const [img] = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
  if (!img) return NextResponse.json({ error: "not found" }, { status: 404 });

  const newStatus =
    action === "keep" ? "done" : action === "skip" ? "review_skipped" : "raw";
  const swipeAction = action === "keep" ? "kept" : action === "skip" ? "skipped" : "redo_bg";

  if (action === "redo") {
    try {
      await requeueBgRemoval(imageId);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "redo failed" },
        { status: 500 }
      );
    }
    await db
      .insert(pinterestSwipes)
      .values({ imageId, action: swipeAction, mode: "review" });
    return NextResponse.json({ ok: true, status: "raw", enqueued: true });
  }

  await db
    .update(images)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(images.id, imageId));
  await db.insert(pinterestSwipes).values({ imageId, action: swipeAction, mode: "review" });

  await publishJobEvent({
    type: "image:updated",
    imageId,
    status: newStatus,
    at: Date.now(),
  });

  return NextResponse.json({ ok: true, status: newStatus });
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select({ id: images.id, storageKey: images.storageKey, filename: images.filename })
    .from(images)
    .where(
      inArray(
        images.status,
        ["generic", "review_pending"] as (typeof images.status.enumValues)[number][]
      )
    )
    .limit(200);

  return NextResponse.json({ items: rows });
}
