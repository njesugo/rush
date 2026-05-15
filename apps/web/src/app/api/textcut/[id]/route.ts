import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, textCutVideos } from "@rush/db";
import { signedUrl } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/textcut/[id] — return the row + a signed download URL when ready.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const videoId = Number(id);
  if (!Number.isFinite(videoId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(textCutVideos)
    .where(eq(textCutVideos.id, videoId))
    .limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  let url: string | null = null;
  if (row.renderedVideoKey) {
    url = await signedUrl(row.renderedVideoKey, 60 * 10);
  }
  return NextResponse.json({ ...row, url });
}
