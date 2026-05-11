import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { carouselRenderQueue } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const carouselId = parseInt(id, 10);
  if (!Number.isFinite(carouselId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { format?: "1:1" | "4:5" };
  const format = body.format === "1:1" ? "1:1" : "4:5";

  const job = await carouselRenderQueue().add("carousel-render", { carouselId, format });
  return NextResponse.json({ jobId: job.id, carouselId, format });
}
