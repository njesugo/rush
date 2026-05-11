import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, carousels, type CarouselSlide, type CarouselAngle } from "@rush/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const carouselId = Number(id);
  if (!Number.isFinite(carouselId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(carousels)
    .where(eq(carousels.id, carouselId))
    .limit(1);
  if (!rows.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ item: rows[0] });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const carouselId = Number(id);
  if (!Number.isFinite(carouselId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    caption?: string;
    slides?: CarouselSlide[];
    angle?: CarouselAngle;
    status?: "draft" | "ready" | "scheduled" | "published" | "failed";
    scheduledAt?: string | null;
  };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.caption === "string") patch.caption = body.caption;
  if (Array.isArray(body.slides)) patch.slides = body.slides;
  if (body.angle && typeof body.angle === "object") patch.angle = body.angle;
  if (body.status) patch.status = body.status;
  if (body.scheduledAt !== undefined) {
    patch.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  }

  const db = getDb();
  const updated = await db
    .update(carousels)
    .set(patch)
    .where(eq(carousels.id, carouselId))
    .returning({ id: carousels.id });

  if (!updated.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const carouselId = Number(id);
  if (!Number.isFinite(carouselId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const db = getDb();
  await db.delete(carousels).where(eq(carousels.id, carouselId));
  return NextResponse.json({ ok: true });
}
