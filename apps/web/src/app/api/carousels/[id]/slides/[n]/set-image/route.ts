import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, carousels, type CarouselSlide } from "@rush/db";
import { carouselRenderQueue } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/carousels/:id/slides/:n/set-image
 * Body: { storageKey: string }
 *
 * Fixe une image précise (storageKey de la banque) sur la slide n,
 * puis re-render le carousel.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; n: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, n } = await ctx.params;
  const carouselId = Number(id);
  const slideNumber = Number(n);
  if (!Number.isFinite(carouselId) || !Number.isFinite(slideNumber)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { storageKey?: string };
  const storageKey = body.storageKey?.trim();
  if (!storageKey) {
    return NextResponse.json({ error: "storageKey required" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db.select().from(carousels).where(eq(carousels.id, carouselId)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const slides = (row.slides ?? []) as CarouselSlide[];
  const idx = slides.findIndex((s) => s.slide_number === slideNumber);
  if (idx === -1) return NextResponse.json({ error: "slide not found" }, { status: 404 });
  if (slides[idx].type === "outro") {
    return NextResponse.json({ error: "outro has no image" }, { status: 400 });
  }

  const newSlides = slides.map((s, i) =>
    i === idx ? { ...s, imageStorageKey: storageKey } : s
  );
  await db
    .update(carousels)
    .set({ slides: newSlides, updatedAt: new Date() })
    .where(eq(carousels.id, carouselId));

  const job = await carouselRenderQueue().add("carousel-render", {
    carouselId,
    format: row.renderFormat === "1:1" ? "1:1" : "4:5",
    onlySlideNumbers: [slideNumber],
  });

  return NextResponse.json({ ok: true, slideNumber, imageStorageKey: storageKey, jobId: job.id });
}
