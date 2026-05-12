import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, carousels } from "@rush/db";
import { signedUrl } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; n: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, n } = await ctx.params;
  const carouselId = parseInt(id, 10);
  const slideIdx = parseInt(n, 10) - 1; // 1-based input
  if (!Number.isFinite(carouselId) || !Number.isFinite(slideIdx) || slideIdx < 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({ renderedPaths: carousels.renderedPaths })
    .from(carousels)
    .where(eq(carousels.id, carouselId))
    .limit(1);
  const key = (row?.renderedPaths as string[] | null)?.[slideIdx];
  if (!key) return NextResponse.json({ error: "not rendered" }, { status: 404 });

  try {
    const url = await signedUrl(key, 600);
    return NextResponse.redirect(url, { status: 307 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "signed url failed" },
      { status: 404 }
    );
  }
}
