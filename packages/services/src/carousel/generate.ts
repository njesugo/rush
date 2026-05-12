/**
 * Orchestre la génération complète d'un carousel à partir d'une news :
 * angles → planSlides → generateSlides → generateCaption → DB update.
 */

import { eq } from "drizzle-orm";
import { getDb, carousels, newsItems, type CarouselSlide, type CarouselAngle } from "@rush/db";
import {
  generateAngles,
  planSlides,
  generateSlides,
  generateCaption,
  type Angle,
  type Money,
} from "./claude";
import { getPrefs } from "../settings";

export interface GenerateCarouselResult {
  carouselId: number;
  slides: CarouselSlide[];
  caption: string;
  angle: CarouselAngle;
  candidateAngles: CarouselAngle[];
}

export async function generateCarouselForNews(args: {
  carouselId: number;
  newsId: number;
  angleIndex?: number; // 0..2 — défaut 0
}): Promise<GenerateCarouselResult> {
  const { carouselId, newsId, angleIndex = 0 } = args;
  const db = getDb();

  const newsRow = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.id, newsId))
    .limit(1);
  if (!newsRow.length) throw new Error(`news_items #${newsId} introuvable`);
  const news = newsRow[0];

  const money: Money | null = news.money ? { formatted: news.money } : null;

  // 1) Angles
  const { angles } = await generateAngles({
    title: news.title,
    summary: news.summary || "",
    money,
  });
  const chosen = angles[Math.min(angleIndex, angles.length - 1)] as Angle;

  // 2) Plan
  const plan = await planSlides({
    title: news.title,
    summary: news.summary || "",
    angle: chosen,
  });

  // 3) Slides
  const { slides } = await generateSlides({
    angle: chosen,
    articleSummary: news.summary || "",
    slideCount: plan.slideCount,
    outline: plan.outline,
  });

  // 4) Caption
  const { caption } = await generateCaption({ slides, angle: chosen });

  // 5) Ajoute systématiquement la slide outro (CTA Suis pour plus)
  const prefs = await getPrefs();
  const slidesWithOutro: CarouselSlide[] = [
    ...(slides as CarouselSlide[]),
    {
      slide_number: slides.length + 1,
      type: "outro",
      title: "Suis pour plus",
      body: prefs.carouselOutroTemplate,
    } as CarouselSlide,
  ];

  // 6) Persist
  await db
    .update(carousels)
    .set({
      title: chosen.angle_title,
      slides: slidesWithOutro,
      caption,
      angle: chosen as CarouselAngle,
      candidateAngles: angles as CarouselAngle[],
      status: "ready",
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(carousels.id, carouselId));

  return {
    carouselId,
    slides: slidesWithOutro,
    caption,
    angle: chosen as CarouselAngle,
    candidateAngles: angles as CarouselAngle[],
  };
}

export async function markCarouselFailed(carouselId: number, error: string): Promise<void> {
  const db = getDb();
  await db
    .update(carousels)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(eq(carousels.id, carouselId));
}
