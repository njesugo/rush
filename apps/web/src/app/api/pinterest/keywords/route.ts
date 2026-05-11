import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { suggestQueries } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const count = Number(sp.get("count") ?? 30);
  const sampleSize = Number(sp.get("sample") ?? 300);

  const result = await suggestQueries({ count, sampleSize });
  return NextResponse.json(result);
}
