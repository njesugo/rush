import { NextRequest, NextResponse } from "next/server";
import { desc, inArray, or, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, newsItems } from "@rush/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAVILY_GROUP = "Tavily";
const TAVILY_PREFIX = "Tavily · ";

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

  // Décompose le filtre Tavily groupé : "Tavily" → LIKE 'Tavily · %'
  let sourceClause: ReturnType<typeof sql> | null = null;
  if (sources && sources.length) {
    const wantsTavily = sources.includes(TAVILY_GROUP);
    const exact = sources.filter((s) => s !== TAVILY_GROUP);
    const parts: ReturnType<typeof sql>[] = [];
    if (exact.length)
      parts.push(inArray(newsItems.source, exact) as unknown as ReturnType<typeof sql>);
    if (wantsTavily) parts.push(sql`${newsItems.source} LIKE ${TAVILY_PREFIX + "%"}`);
    sourceClause =
      parts.length === 1
        ? parts[0]
        : (or(...(parts as never[])) as unknown as ReturnType<typeof sql>);
  }

  const conditions = [
    sourceClause,
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

  // distinct source list pour le filter UI : regroupe tous les "Tavily · *" en "Tavily"
  const sourceRows = await db
    .selectDistinct({ source: newsItems.source })
    .from(newsItems);

  const grouped = new Set<string>();
  for (const r of sourceRows) {
    if (r.source.startsWith(TAVILY_PREFIX)) grouped.add(TAVILY_GROUP);
    else grouped.add(r.source);
  }

  return NextResponse.json({
    items: rows,
    sources: [...grouped].sort(),
  });
}
