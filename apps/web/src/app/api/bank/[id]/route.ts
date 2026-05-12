import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, images } from "@rush/db";
import { deleteImage, publishJobEvent, requeueBgRemoval } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "keep" | "delete" | "redo";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const imageId = parseInt(id, 10);
  if (!Number.isFinite(imageId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  let body: { action?: Action };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "keep" && action !== "delete" && action !== "redo") {
    return NextResponse.json({ error: "bad action" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "delete") {
    await deleteImage(imageId);
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (action === "keep") {
    await db
      .update(images)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(images.id, imageId));
    await publishJobEvent({
      type: "image:updated",
      imageId,
      status: "done",
      at: Date.now(),
    });
    return NextResponse.json({ ok: true, status: "done" });
  }

  // redo: locate the original raw, move it back to raw/ and re-enqueue
  try {
    await requeueBgRemoval(imageId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "redo failed" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, status: "raw", enqueued: true });
}
