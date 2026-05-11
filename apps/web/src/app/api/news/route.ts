import { NextRequest, NextResponse } from "next/server";
import { desc, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, newsItems } from "@rush/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
  const sort = url.searchParams.get("sort") === "recent" ? "recent" : "score";
  const sourcesParam = url.searchParams.get("sources");
  const sources = sourcesParam
    ? sourcesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const onlyUnused = url.searchParams.get("unused") === "1";

  const db = getDb();

  const conditions = [
    sources && sources.length ? inArray(newsItems.source, sources) : null,
    onlyUnused ? sql`${newsItems.used} = 0` : null,
  ].filter(Boolean) as ReturnType<typeof sql>[];

  const rows = await db
    .select({
      id: newsItems.id,
      source: newsItems.source,
      title: newsItems.title,
      url: newsItems.url,
      summary: newsItems.summary,
      fetchedAt: newsItems.fetchedAt,
      publishedAt: newsItems.publishedAt,
      used: newsItems.used,
      region: newsItems.region,
      geoScore: newsItems.geoScore,
      keywordScore: newsItems.keywordScore,
      editorialScore: newsItems.editorialScore,
      finalScore: newsItems.finalScore,
      money: newsItems.money,
    })
    .from(newsItems)
    .where(conditions.length ? sql.join(conditions, sql` AND `) : sql`true`)
    .orderBy(sort === "recent" ? desc(newsItems.fetchedAt) : desc(newsItems.finalScore))
    .limit(limit);

  // distinct source list pour le filter UI
  const sourceRows = await db
    .selectDistinct({ source: newsItems.source })
    .from(newsItems);

  return NextResponse.json({
    items: rows,
    sources: sourceRows.map((r) => r.source).sort(),
  });
}
