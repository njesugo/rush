import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isKnownQueueName, runJobAction, type JobAction } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ACTIONS = new Set<JobAction>([
  "retryFailed",
  "cleanCompleted",
  "cleanFailed",
  "retryJob",
  "removeJob",
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name } = await ctx.params;
  if (!isKnownQueueName(name)) return NextResponse.json({ error: "unknown queue" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; jobId?: string };
  if (!body.action || !VALID_ACTIONS.has(body.action as JobAction)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  try {
    const result = await runJobAction(name, body.action as JobAction, body.jobId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
