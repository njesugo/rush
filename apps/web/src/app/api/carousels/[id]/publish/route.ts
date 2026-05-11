import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { carouselPublishQueue } from "@rush/services";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  scheduledAt: z.string().datetime().nullable().optional(),
  format: z.enum(["1:1", "4:5"]).optional(),
  forceRerender: z.boolean().optional(),
});

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

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }

  const job = await carouselPublishQueue().add("carousel-publish", {
    carouselId,
    scheduledAt: parsed.data.scheduledAt ?? null,
    format: parsed.data.format,
    forceRerender: parsed.data.forceRerender,
  });

  return NextResponse.json({ jobId: job.id, carouselId, scheduledAt: parsed.data.scheduledAt ?? null });
}
