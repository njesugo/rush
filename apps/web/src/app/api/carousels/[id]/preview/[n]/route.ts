import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, carousels } from "@rush/db";
import { BANK_DIR } from "@rush/services";

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
  const rel = (row?.renderedPaths as string[] | null)?.[slideIdx];
  if (!rel) return NextResponse.json({ error: "not rendered" }, { status: 404 });

  const abs = path.join(BANK_DIR, rel);
  if (!abs.startsWith(BANK_DIR)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!fs.existsSync(abs)) return NextResponse.json({ error: "missing file" }, { status: 404 });

  const stat = fs.statSync(abs);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = fs.createReadStream(abs) as any;
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=300",
    },
  });
}
