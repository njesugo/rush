import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, carousels, images, type CarouselSlide } from "@rush/db";
import { carouselRenderQueue } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/carousels/:id/slides/:n/reroll-image
 *
 * Tire une image aléatoire de la banque (différente de l'image actuelle si possible)
 * pour la slide n du carousel, met à jour son `imageStorageKey`, et déclenche un re-render.
 */
export async function POST(
  _req: NextRequest,
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

  const db = getDb();
  const [row] = await db.select().from(carousels).where(eq(carousels.id, carouselId)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const slides = (row.slides ?? []) as CarouselSlide[];
  const idx = slides.findIndex((s) => s.slide_number === slideNumber);
  if (idx === -1) return NextResponse.json({ error: "slide not found" }, { status: 404 });
  if (slides[idx].type === "outro") {
    return NextResponse.json({ error: "outro has no image" }, { status: 400 });
  }

  // Pioche une image au hasard parmi done/generic, idéalement différente de l'actuelle.
  const current = slides[idx].imageStorageKey ?? null;
  const candidates = await db
    .select({ storageKey: images.storageKey })
    .from(images)
    .where(inArray(images.status, ["done", "generic"]));
  const pool = candidates
    .map((c) => c.storageKey)
    .filter((k) => k && k !== current);
  if (!pool.length) {
    return NextResponse.json({ error: "no images available" }, { status: 400 });
  }
  const next = pool[Math.floor(Math.random() * pool.length)];

  const newSlides = slides.map((s, i) =>
    i === idx ? { ...s, imageStorageKey: next } : s
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

  return NextResponse.json({
    ok: true,
    slideNumber,
    imageStorageKey: next,
    jobId: job.id,
  });
}

// avoid unused import warning when tsc strict
void ne;
