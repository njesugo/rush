import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrefs, setPrefs } from "@rush/services";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  claudeModel: z.string().trim().min(1).optional(),
  carouselSchedule: z.string().trim().optional(),
  pinterestSyncSchedule: z.string().trim().optional(),
  newsScrapeSchedule: z.string().trim().optional(),
  defaultCarouselCount: z.number().int().min(1).max(20).optional(),
  autoEnqueueBgRemoval: z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prefs = await getPrefs();
  return NextResponse.json({ prefs });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }
  const prefs = await setPrefs(parsed.data);
  return NextResponse.json({ prefs });
}
