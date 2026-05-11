import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, carousels, newsItems } from "@rush/db";
import { carouselGenerateQueue } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    newsId?: number;
    angleIndex?: number;
  };
  const newsId = Number(body.newsId);
  if (!Number.isFinite(newsId)) {
    return NextResponse.json({ error: "newsId requis" }, { status: 400 });
  }

  const db = getDb();
  const news = await db
    .select({ id: newsItems.id, title: newsItems.title })
    .from(newsItems)
    .where(eq(newsItems.id, newsId))
    .limit(1);
  if (!news.length) {
    return NextResponse.json({ error: "news introuvable" }, { status: 404 });
  }

  // Crée un draft d'abord pour avoir un ID stable
  const inserted = await db
    .insert(carousels)
    .values({
      title: news[0].title.slice(0, 120),
      status: "draft",
      slides: [],
      sourceNewsIds: [newsId],
    })
    .returning({ id: carousels.id });
  const carouselId = inserted[0].id;

  // Incrémente news.used
  await db
    .update(newsItems)
    .set({ used: sql`${newsItems.used} + 1` })
    .where(eq(newsItems.id, newsId));

  const job = await carouselGenerateQueue().add(
    "carousel-generate",
    { carouselId, newsId, angleIndex: body.angleIndex ?? 0 },
    { jobId: `carousel-${carouselId}-${Date.now()}` }
  );

  return NextResponse.json({ ok: true, carouselId, jobId: job.id });
}
