import { z } from "zod";

/**
 * Storyboard schema — single source of truth shared between:
 *  - The Remotion composition (renders this JSON to mp4)
 *  - The Claude generator service (must produce JSON matching this shape)
 *  - The /api/reels/v2 route (validates payload roundtrips)
 *
 * Conventions:
 *  - All time values are in **milliseconds** from the start of the reel.
 *  - All normalized rect coordinates are in [0, 1] (top-left origin).
 *  - Screenshot references use the index in `assets.screenshots`.
 */

/** A single word with start/end ms — matches Whisper word-level output. */
export const captionWordSchema = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});
export type CaptionWord = z.infer<typeof captionWordSchema>;

/** Region of a screenshot to focus on (zoom + crop). */
export const focusRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type FocusRect = z.infer<typeof focusRectSchema>;

/** A normalized point on a screenshot (used for cursor positions). */
export const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type Point = z.infer<typeof pointSchema>;

/* ----------------- Sections ----------------- */

/** 0–3s opening kinetic punchline. */
export const hookSchema = z.object({
  kind: z.literal("hook"),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  text: z.string().min(1),
  /** Word (case-insensitive, ignoring punctuation) to highlight with accent pill. */
  highlight: z.string().optional(),
});
export type HookSection = z.infer<typeof hookSchema>;

/** 3–5s "set the scene" — usually first screenshot reveal + caption. */
export const setupSchema = z.object({
  kind: z.literal("setup"),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  /** Index into assets.screenshots. */
  screenshotIndex: z.number().int().nonnegative(),
  focusRect: focusRectSchema.optional(),
  caption: z.array(captionWordSchema),
});
export type SetupSection = z.infer<typeof setupSchema>;

/** Per-beat overlay primitives (extension points; renderer skips unknown kinds). */
export const overlaySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("highlight"),
    /** Rect on the screenshot, normalized. */
    rect: focusRectSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal("cursor"),
    /** Cursor moves from `from` to `to` then optionally clicks at `to`. */
    from: pointSchema,
    to: pointSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    click: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("typeInto"),
    /** Rect of the input field on the screenshot, normalized. */
    rect: focusRectSchema,
    /** Text typed character-by-character across [startMs, endMs]. */
    text: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  }),
]);
export type Overlay = z.infer<typeof overlaySchema>;

/** A "beat" = one feature/idea ~7s. Screenshot + caption + optional overlays. */
export const beatSchema = z.object({
  kind: z.literal("beat"),
  /** 1-based for human readability ("Beat 1", "Beat 2"…). */
  index: z.number().int().positive(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  /** Short label rendered as chip ("01 · Espaces partagés"). */
  label: z.string(),
  screenshotIndex: z.number().int().nonnegative(),
  focusRect: focusRectSchema.optional(),
  caption: z.array(captionWordSchema),
  overlays: z.array(overlaySchema).default([]),
});
export type BeatSection = z.infer<typeof beatSchema>;

/** End card with CTA + handle. */
export const endCardSchema = z.object({
  kind: z.literal("endCard"),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  title: z.string().min(1),
  /** Optional sub-line (handle, "Suis-moi pour…"). */
  subtitle: z.string().optional(),
  cta: z.string().optional(),
});
export type EndCardSection = z.infer<typeof endCardSchema>;

export const sectionSchema = z.discriminatedUnion("kind", [
  hookSchema,
  setupSchema,
  beatSchema,
  endCardSchema,
]);
export type Section = z.infer<typeof sectionSchema>;

/* ----------------- Assets + root ----------------- */

export const assetsSchema = z.object({
  /** Public URLs of uploaded screenshots, ordered. */
  screenshots: z.array(z.string().url()),
  /** Public URL of the user's voice-over audio (mp3/m4a/wav). */
  voiceUrl: z.string().url().nullable().optional(),
});
export type StoryboardAssets = z.infer<typeof assetsSchema>;

export const storyboardSchema = z.object({
  /** Schema version — bump on breaking changes. */
  version: z.literal(1),
  /** Total reel duration in ms. Must match max(section.endMs). */
  durationMs: z.number().int().positive(),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  assets: assetsSchema,
  sections: z.array(sectionSchema).min(1),
});
export type Storyboard = z.infer<typeof storyboardSchema>;
