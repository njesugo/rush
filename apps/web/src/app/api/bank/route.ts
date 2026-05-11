import { NextRequest, NextResponse } from "next/server";
import { desc, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, images } from "@rush/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTER_MAP = {
  all: null,
  available: ["generic", "done"] as const,
  used: ["done"] as const,
  raw: ["raw", "processing"] as const,
  failed: ["fail"] as const,
} satisfies Record<string, ReadonlyArray<string> | null>;

type FilterKey = keyof typeof FILTER_MAP;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const filterParam = (url.searchParams.get("filter") ?? "available") as FilterKey;
  const filter = (filterParam in FILTER_MAP ? filterParam : "available") as FilterKey;
  const sort = url.searchParams.get("sort") === "popular" ? "popular" : "recent";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 500);

  const db = getDb();
  const statuses = FILTER_MAP[filter];

  const rows = await db
    .select({
      id: images.id,
      filename: images.filename,
      storageKey: images.storageKey,
      status: images.status,
      source: images.source,
      width: images.width,
      height: images.height,
      createdAt: images.createdAt,
    })
    .from(images)
    .where(
      statuses
        ? inArray(images.status, statuses as unknown as (typeof images.status.enumValues)[number][])
        : sql`true`
    )
    .orderBy(sort === "recent" ? desc(images.createdAt) : desc(images.id))
    .limit(limit);

  return NextResponse.json({ items: rows });
}
