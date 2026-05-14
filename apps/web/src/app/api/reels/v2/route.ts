import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, reels } from "@rush/db";
import {
  uploadObject,
  reelRenderRemotionQueue,
} from "@rush/services";
import path from "node:path";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reels/v2 — create a v2 (Remotion) reel from user uploads.
 *
 * multipart/form-data fields:
 *  - script        : text  (required) the user's free-text script
 *  - title         : text  (optional) display title
 *  - topic         : text  (optional) hint for Claude
 *  - voice         : File  (required) mp3/m4a/wav voice-over
 *  - screenshots   : File[] (1+) PNG/JPEG screenshots (ordered)
 *
 * Pipeline triggered:
 *   uploaded -> reelRenderRemotionQueue("render", { reelId })
 *     -> worker: Whisper(voice) -> Claude(script + transcript + screenshots)
 *        -> Remotion render -> upload mp4 -> mark remotion_ready
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const script = (form.get("script") as string | null)?.trim() ?? "";
  const title = (form.get("title") as string | null)?.trim() || null;
  const topic = (form.get("topic") as string | null)?.trim() || null;
  const voice = form.get("voice");
  const screenshots = form.getAll("screenshots");

  if (!script) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }
  if (!(voice instanceof File) || voice.size === 0) {
    return NextResponse.json({ error: "voice file is required" }, { status: 400 });
  }
  const screenshotFiles = screenshots.filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  if (screenshotFiles.length === 0) {
    return NextResponse.json(
      { error: "at least one screenshot is required" },
      { status: 400 }
    );
  }
  if (screenshotFiles.length > 12) {
    return NextResponse.json(
      { error: "max 12 screenshots per reel" },
      { status: 400 }
    );
  }

  // Insert the reel row first so we get a stable id for the storage prefix.
  const db = getDb();
  const inserted = await db
    .insert(reels)
    .values({
      title,
      // v2 reels have no source video / angle in the legacy sense.
      youtubeUrl: null,
      angle: topic,
      status: "remotion_rendering",
      script,
    })
    .returning({ id: reels.id });
  const reelId = inserted[0]!.id;

  try {
    const baseKey = `reels/${reelId}`;
    const voiceKey = `${baseKey}/voice${safeExt(voice.name, ".mp3")}`;
    const voiceBuf = Buffer.from(await voice.arrayBuffer());
    await uploadObject(voiceKey, voiceBuf, voice.type || "audio/mpeg");

    const screenshotKeys: string[] = [];
    for (let i = 0; i < screenshotFiles.length; i++) {
      const f = screenshotFiles[i]!;
      const key = `${baseKey}/screenshots/${String(i).padStart(2, "0")}-${randomSlug()}${safeExt(f.name, ".png")}`;
      const buf = Buffer.from(await f.arrayBuffer());
      await uploadObject(key, buf, f.type || "image/png");
      screenshotKeys.push(key);
    }

    await db
      .update(reels)
      .set({
        voiceStorageKey: voiceKey,
        screenshotKeys,
        updatedAt: new Date(),
      })
      .where(eq(reels.id, reelId));

    await reelRenderRemotionQueue().add("render", { reelId });

    return NextResponse.json(
      { id: reelId, voiceKey, screenshotKeys, status: "remotion_rendering" },
      { status: 201 }
    );
  } catch (err) {
    const msg = (err as Error).message || "upload error";
    await db
      .update(reels)
      .set({ status: "failed", error: msg, updatedAt: new Date() })
      .where(eq(reels.id, reelId));
    return NextResponse.json({ error: msg, reelId }, { status: 500 });
  }
}

/* ---------------- helpers ---------------- */

function safeExt(filename: string, fallback: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (!ext) return fallback;
  if (!/^\.[a-z0-9]{1,5}$/.test(ext)) return fallback;
  return ext;
}

function randomSlug(): string {
  return crypto.randomBytes(4).toString("hex");
}
