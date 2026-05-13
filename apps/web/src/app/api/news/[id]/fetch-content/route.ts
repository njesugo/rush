import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, newsItems } from "@rush/db";
import { extractArticle } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/news/[id]/fetch-content
 * Récupère le contenu complet de l'article via Tavily /extract et le stocke
 * dans news_items.content. Idempotent : ?force=1 pour re-scraper.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const newsId = Number(id);
  if (!Number.isFinite(newsId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const db = getDb();

  const [row] = await db
    .select({
      id: newsItems.id,
      url: newsItems.url,
      content: newsItems.content,
      contentStatus: newsItems.contentStatus,
    })
    .from(newsItems)
    .where(eq(newsItems.id, newsId))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!force && row.content && row.contentStatus === "ok") {
    return NextResponse.json({
      ok: true,
      cached: true,
      chars: row.content.length,
      content: row.content,
    });
  }

  try {
    const { rawContent } = await extractArticle(row.url, { extractDepth: "advanced" });
    const content = rawContent.trim();
    await db
      .update(newsItems)
      .set({
        content,
        contentStatus: "ok",
        contentScrapedAt: new Date(),
        contentChars: content.length,
      })
      .where(eq(newsItems.id, newsId));

    return NextResponse.json({
      ok: true,
      cached: false,
      chars: content.length,
      content,
    });
  } catch (err) {
    const msg = (err as Error).message || "extract failed";
    const isPaywall = /paywall|403|401/i.test(msg);
    await db
      .update(newsItems)
      .set({
        contentStatus: isPaywall ? "paywall" : "failed",
        contentScrapedAt: new Date(),
      })
      .where(eq(newsItems.id, newsId));
    return NextResponse.json(
      { error: msg, status: isPaywall ? "paywall" : "failed" },
      { status: 502 }
    );
  }
}

/**
 * GET /api/news/[id]/fetch-content
 * Renvoie le contenu déjà stocké (sans appeler Tavily).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const newsId = Number(id);
  if (!Number.isFinite(newsId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: newsItems.id,
      url: newsItems.url,
      title: newsItems.title,
      summary: newsItems.summary,
      content: newsItems.content,
      contentStatus: newsItems.contentStatus,
      contentScrapedAt: newsItems.contentScrapedAt,
      contentChars: newsItems.contentChars,
    })
    .from(newsItems)
    .where(eq(newsItems.id, newsId))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}
