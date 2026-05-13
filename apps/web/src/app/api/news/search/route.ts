import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchAndIngestNews } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    timeRange?: "day" | "week" | "month" | "year";
    maxResults?: number;
    filterAI?: boolean;
  };

  const query = (body.query || "").trim();
  if (!query) {
    return NextResponse.json({ error: "query requis" }, { status: 400 });
  }

  try {
    const result = await searchAndIngestNews({
      query,
      timeRange: body.timeRange,
      maxResults: body.maxResults,
      filterAI: body.filterAI,
    });
    return NextResponse.json({
      ok: true,
      inserted: result.inserted,
      fetched: result.fetched,
      total: result.total,
      items: result.dbItems,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur recherche";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
