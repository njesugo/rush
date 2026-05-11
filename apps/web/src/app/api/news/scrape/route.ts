import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { newsScrapeQueue } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { useTavily?: boolean };

  const job = await newsScrapeQueue().add(
    "news-scrape",
    { useTavily: body.useTavily, triggeredBy: session.user?.email ?? "manual" },
    { jobId: `news-${Date.now()}` }
  );

  return NextResponse.json({ ok: true, jobId: job.id });
}
