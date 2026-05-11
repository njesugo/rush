import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStats, listAssets } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [stats, assets] = await Promise.all([getStats(), listAssets({ limit: 120 })]);
  return NextResponse.json({ stats, assets });
}
