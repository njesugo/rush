import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pinterestSyncQueue } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const job = await pinterestSyncQueue().add(
    "pinterest-sync",
    { triggeredBy: session.user?.email ?? "manual" },
    { jobId: `pinsync-${Date.now()}` }
  );

  return NextResponse.json({ ok: true, jobId: job.id });
}
