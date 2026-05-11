import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { summarizeAllQueues } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 25), 1), 100);
  const queues = await summarizeAllQueues(limit);
  return NextResponse.json({ queues });
}
