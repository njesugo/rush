/**
 * Reels v2 render pipeline (Remotion).
 *
 * Steps :
 *  1. Load reel + assert v2 inputs (script, voiceStorageKey, screenshotKeys).
 *  2. Download the voice-over from Supabase to /tmp.
 *  3. Run Whisper word-level transcription.
 *  4. Build signed URLs for each screenshot so Claude (and Remotion) can fetch them.
 *  5. Ask Claude for a Storyboard JSON.
 *  6. Persist storyboardV2 + hook on the reel.
 *  7. Bundle the Remotion site (apps/remotion/src/index.ts), select the
 *     "Reel" composition, render to mp4 with the user's audio.
 *  8. Upload the mp4 to Supabase under `reels/<id>/render.mp4`.
 *  9. Mark reel `remotion_ready` with renderedVideoKey set.
 *
 * Status transitions :
 *   any -> remotion_rendering (set by /api/reels/v2 on insert) ->
 *     remotion_ready (success) | failed (error message persisted).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { eq } from "drizzle-orm";
import { getDb, reels, type ReelStatus } from "@rush/db";
import type { Storyboard } from "@rush/shared";

import { downloadObject, signedUrl, uploadObject } from "../storage";
import { transcribeAudioWords } from "../youtube/transcribe";
import {
  generateRemotionStoryboard,
  type WhisperWord,
} from "./generateRemotionStoryboard";

/** Allow callers (worker tests) to inject the actual Remotion render call. */
export type RenderRemotionFn = (args: {
  storyboard: Storyboard;
  voicePath: string;
  outPath: string;
}) => Promise<void>;

export interface RenderReelV2Options {
  reelId: number;
  /** Render implementation. The worker passes a real Remotion-based one;
   *  unit tests can pass a no-op. Decoupled so this package stays free of
   *  the @remotion/renderer dependency (which pulls in Chromium). */
  render: RenderRemotionFn;
  /** ISO-639-1 hint for Whisper. Defaults to "fr". */
  language?: string;
}

async function setReelStatus(
  reelId: number,
  status: ReelStatus,
  patch: Partial<{
    storyboardV2: unknown;
    hook: string;
    renderedVideoKey: string;
    error: string | null;
  }> = {}
): Promise<void> {
  const db = getDb();
  await db
    .update(reels)
    .set({
      status,
      updatedAt: new Date(),
      ...(patch.storyboardV2 !== undefined ? { storyboardV2: patch.storyboardV2 } : {}),
      ...(patch.hook !== undefined ? { hook: patch.hook } : {}),
      ...(patch.renderedVideoKey !== undefined
        ? { renderedVideoKey: patch.renderedVideoKey }
        : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    })
    .where(eq(reels.id, reelId));
}

/** Loud signed URL helper: 30 minutes is plenty for one render run. */
async function signFor(key: string): Promise<string> {
  return signedUrl(key, 60 * 30);
}

/**
 * Run the full v2 render pipeline. Throws on any failure so the BullMQ worker
 * can surface it to the queue's retry/dlq mechanism.
 */
export async function renderReelV2(opts: RenderReelV2Options): Promise<{
  reelId: number;
  renderedVideoKey: string;
  storyboard: Storyboard;
}> {
  const { reelId, render, language = "fr" } = opts;
  const db = getDb();

  const rows = await db.select().from(reels).where(eq(reels.id, reelId)).limit(1);
  const reel = rows[0];
  if (!reel) throw new Error(`reel ${reelId} not found`);

  const script = reel.script?.trim();
  const voiceKey = reel.voiceStorageKey;
  const screenshotKeys = (reel.screenshotKeys ?? []) as string[];
  if (!script) throw new Error(`reel ${reelId} has no script`);
  if (!voiceKey) throw new Error(`reel ${reelId} has no voiceStorageKey`);
  if (!screenshotKeys.length) {
    throw new Error(`reel ${reelId} has no screenshotKeys`);
  }

  await setReelStatus(reelId, "remotion_rendering", { error: null });

  // 1. Workspace temp dir.
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `reel-${reelId}-`));
  const voicePath = path.join(tmpRoot, "voice" + (path.extname(voiceKey) || ".mp3"));
  const outPath = path.join(tmpRoot, "render.mp4");

  try {
    // 2. Download voice.
    const voiceBuf = await downloadObject(voiceKey);
    await fs.writeFile(voicePath, voiceBuf);

    // 3. Whisper word-level.
    const { words, durationS } = await transcribeAudioWords(voicePath, { language });
    if (!words.length) throw new Error("Whisper returned 0 words");

    // 4. Sign screenshot URLs so Claude vision can fetch them.
    const screenshotUrls = await Promise.all(screenshotKeys.map(signFor));

    // 5. Claude.
    const voTranscript: WhisperWord[] = words;
    const { storyboard } = await generateRemotionStoryboard({
      script,
      voTranscript,
      voDurationS: durationS,
      screenshotUrls,
      topic: reel.title ?? reel.angle ?? null,
    });

    // 6. Persist storyboard + hook for UI / regen.
    const hookSection = storyboard.sections.find((s) => s.kind === "hook");
    const hookText = hookSection && hookSection.kind === "hook" ? hookSection.text : null;
    await setReelStatus(reelId, "remotion_rendering", {
      storyboardV2: storyboard,
      ...(hookText ? { hook: hookText } : {}),
    });

    // 7. Render. Pass the *local* voice path so the composition can play it
    //    via a file:// Audio src (we substitute assets.voiceUrl for that).
    const storyboardForRender: Storyboard = {
      ...storyboard,
      assets: {
        ...storyboard.assets,
        voiceUrl: pathToFileUrl(voicePath),
      },
    };
    await render({ storyboard: storyboardForRender, voicePath, outPath });

    // 8. Upload mp4.
    const renderedKey = `reels/${reelId}/render.mp4`;
    const mp4 = await fs.readFile(outPath);
    await uploadObject(renderedKey, mp4, "video/mp4");

    // 9. Mark ready.
    await setReelStatus(reelId, "remotion_ready", { renderedVideoKey: renderedKey });

    return { reelId, renderedVideoKey: renderedKey, storyboard };
  } catch (err) {
    const msg = (err as Error).message || "unknown render error";
    await setReelStatus(reelId, "failed", { error: msg });
    throw err;
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

function pathToFileUrl(p: string): string {
  // Cross-platform: Windows paths need to start with `///C:/...`.
  const resolved = path.resolve(p).replace(/\\/g, "/");
  return resolved.startsWith("/") ? `file://${resolved}` : `file:///${resolved}`;
}
