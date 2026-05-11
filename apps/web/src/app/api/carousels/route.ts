import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, carousels } from "@rush/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select({
      id: carousels.id,
      title: carousels.title,
      status: carousels.status,
      slides: carousels.slides,
      caption: carousels.caption,
      angle: carousels.angle,
      sourceNewsIds: carousels.sourceNewsIds,
      scheduledAt: carousels.scheduledAt,
      publerPostId: carousels.publerPostId,
      error: carousels.error,
      createdAt: carousels.createdAt,
      updatedAt: carousels.updatedAt,
    })
    .from(carousels)
    .orderBy(desc(carousels.createdAt))
    .limit(200);

  return NextResponse.json({ items: rows });
}
