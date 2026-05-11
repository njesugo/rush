import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { testConnection, type TestableService } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: TestableService[] = ["anthropic", "tavily", "pinterest", "redis", "db", "publer"];

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ service: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { service } = await ctx.params;
  if (!ALLOWED.includes(service as TestableService)) {
    return NextResponse.json({ error: "unknown_service" }, { status: 400 });
  }
  const result = await testConnection(service as TestableService);
  return NextResponse.json(result);
}
