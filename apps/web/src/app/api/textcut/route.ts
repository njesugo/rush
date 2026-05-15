import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, textCutVideos, type TextCutLanguage } from "@rush/db";
import { textCutRenderQueue } from "@rush/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/textcut — create + enqueue a viral "text match cut" video.
 *
 * Body: { word: string, language?: "fr" | "en" }
 *  - `word` may contain spaces (multi-word anchor) but must fit on one line.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { word?: unknown; language?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const word = typeof body.word === "string" ? body.word.trim() : "";
  if (!word) return NextResponse.json({ error: "word is required" }, { status: 400 });
  if (word.length > 40) {
    return NextResponse.json({ error: "word too long (max 40 chars)" }, { status: 400 });
  }
  const language: TextCutLanguage =
    body.language === "en" ? "en" : "fr";

  const db = getDb();
  const inserted = await db
    .insert(textCutVideos)
    .values({ word, language, status: "queued" })
    .returning({ id: textCutVideos.id });
  const videoId = inserted[0]!.id;

  await textCutRenderQueue().add("render", { videoId });

  return NextResponse.json({ id: videoId, status: "queued" }, { status: 201 });
}

/**
 * GET /api/textcut — list recent videos (newest first).
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const items = await db
    .select()
    .from(textCutVideos)
    .orderBy(desc(textCutVideos.createdAt))
    .limit(50);
  return NextResponse.json({ items });
}
