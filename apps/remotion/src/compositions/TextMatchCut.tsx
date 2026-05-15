import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";

/* ------------------------------------------------------------------------- */
/* Schema                                                                    */
/* ------------------------------------------------------------------------- */

export const textCutFrameSchema = z.object({
  title: z.string().nullable().optional(),
  before: z.string(),
  after: z.string(),
  layout: z.enum(["paragraph", "columns", "list", "quote"]),
});

export const textMatchCutSchema = z.object({
  /** The anchor word (or short phrase) — rendered locked at center. */
  word: z.string(),
  /** 4-6 surrounding-content frames. */
  frames: z.array(textCutFrameSchema).min(4).max(6),
  /** Total duration ms (drives frame count via fps). */
  durationMs: z.number().default(3000),
  fps: z.number().default(30),
  width: z.number().default(1080),
  height: z.number().default(1920),
  /** Reserved for future use; audio is muxed post-render via FFmpeg. */
  audioUrl: z.string().nullable().optional(),
});

export type TextMatchCutProps = z.infer<typeof textMatchCutSchema>;
export type TextCutFrameProps = z.infer<typeof textCutFrameSchema>;

/* ------------------------------------------------------------------------- */
/* Constants                                                                 */
/* ------------------------------------------------------------------------- */

const PAPER = "#ededed";
const INK = "#1a1a1a";
const STABILO = "#FCE96A";
const STABILO_DARK = "#F0CC1B";

const SERIF = '"Crimson Text", Georgia, "Times New Roman", serif';
const FONT_WORD_SIZE = 116;
const FONT_BODY_SIZE = 44;
const FONT_TITLE_SIZE = 56;
const LINE_HEIGHT = 1.45;

/** Vertical motion-blur filter id used by all surrounding text. */
const VBLUR_ID = "tmc-vblur";
/** Subtle paper-grain filter id. */
const PAPER_FILTER_ID = "tmc-paper";

/* ------------------------------------------------------------------------- */
/* Composition                                                               */
/* ------------------------------------------------------------------------- */

export const TextMatchCut: React.FC<TextMatchCutProps> = ({
  word,
  frames,
  durationMs,
  fps,
}) => {
  const totalFrames = Math.round((durationMs / 1000) * fps);
  const cutCount = frames.length;
  // Equal slot per cut. We overlap a small fade window between consecutive
  // cuts so transitions feel like cross-dissolves rather than jump-cuts.
  const slot = totalFrames / cutCount;
  const fadeWin = Math.max(3, Math.round(fps * 0.13)); // ~4 frames at 30fps

  const currentFrame = useCurrentFrame();

  // Anchor word micro-pulse (very subtle): scale 1.00 → 1.018 over each cut.
  const cutIndexFloat = currentFrame / slot;
  const localPhase = cutIndexFloat - Math.floor(cutIndexFloat);
  const anchorScale = 1 + Math.sin(localPhase * Math.PI) * 0.018;

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, overflow: "hidden" }}>
      <SvgDefs />

      {/* Paper background (subtle noise + warm tint). */}
      <PaperBackground />

      {/* Each cut as its own layer with computed opacity. They are stacked
          underneath the anchor layer so the word always sits on top. */}
      {frames.map((f, i) => {
        const center = i * slot + slot / 2;
        const opacity = computeCutOpacity(
          currentFrame,
          i,
          slot,
          fadeWin,
          totalFrames,
          cutCount
        );
        if (opacity <= 0) return null;
        return (
          <AbsoluteFill key={i} style={{ opacity }}>
            <CutLayer frame={f} index={i} center={center} />
          </AbsoluteFill>
        );
      })}

      {/* Anchor word — rendered LAST and ALWAYS at full opacity, locked
          at the geometric center of the canvas. This is the trick: the
          word is never re-rendered between cuts, so it cannot move. */}
      <AnchorLayer word={word} scale={anchorScale} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------- */
/* Sub-components                                                            */
/* ------------------------------------------------------------------------- */

const SvgDefs: React.FC = () => (
  <svg
    width="0"
    height="0"
    style={{ position: "absolute", pointerEvents: "none" }}
    aria-hidden="true"
  >
    <defs>
      {/* Vertical motion blur — the spec's `feGaussianBlur stdDeviation="0 8"`. */}
      <filter id={VBLUR_ID} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="0 7" />
      </filter>

      {/* Paper grain via turbulence. */}
      <filter id={PAPER_FILTER_ID}>
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="2"
          seed="3"
        />
        <feColorMatrix
          values="0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 0.06 0"
        />
      </filter>
    </defs>
  </svg>
);

const PaperBackground: React.FC = () => (
  <>
    <AbsoluteFill style={{ backgroundColor: PAPER }} />
    {/* Subtle vignette to feel like a photographed page. */}
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.10) 100%)",
      }}
    />
    {/* Grain layer. */}
    <svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, mixBlendMode: "multiply" }}
      aria-hidden="true"
    >
      <rect width="100%" height="100%" filter={`url(#${PAPER_FILTER_ID})`} />
    </svg>
  </>
);

const AnchorLayer: React.FC<{ word: string; scale: number }> = ({
  word,
  scale,
}) => (
  <div
    style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: `translate(-50%, -50%) scale(${scale})`,
      transformOrigin: "center center",
      // No blur — this is the locked focal point.
      whiteSpace: "nowrap",
      pointerEvents: "none",
    }}
  >
    {/* Stabilo behind the word. Padding makes it overlap text edges like a
        real highlighter stroke. */}
    <span
      style={{
        position: "relative",
        fontFamily: SERIF,
        fontWeight: 700,
        fontSize: FONT_WORD_SIZE,
        color: INK,
        lineHeight: 1,
        padding: "8px 22px",
        display: "inline-block",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "12px 4px 14px 4px",
          background: `linear-gradient(180deg, ${STABILO} 0%, ${STABILO_DARK} 100%)`,
          // Mimic a hand-drawn highlight: not perfectly aligned, slight skew.
          transform: "rotate(-0.6deg) skewX(-2deg)",
          borderRadius: 4,
          mixBlendMode: "multiply",
          opacity: 0.92,
          zIndex: 0,
        }}
      />
      <span style={{ position: "relative", zIndex: 1 }}>{word}</span>
    </span>
  </div>
);

const CutLayer: React.FC<{
  frame: TextCutFrameProps;
  index: number;
  center: number;
}> = ({ frame, index }) => {
  // A tiny per-cut rotation/translation so consecutive frames don't feel
  // mechanically identical — same document, slightly different photo.
  const seed = (index * 13) % 7;
  const tilt = (seed - 3) * 0.18; // -0.54° to +0.54°
  const offsetY = (seed - 3) * 4;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `rotate(${tilt}deg) translateY(${offsetY}px)`,
        transformOrigin: "center center",
      }}
    >
      {/* Title block — top third. */}
      {frame.title ? (
        <div
          style={{
            position: "absolute",
            top: "12%",
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: SERIF,
            fontWeight: 700,
            fontSize: FONT_TITLE_SIZE,
            color: INK,
            filter: `url(#${VBLUR_ID})`,
            letterSpacing: "0.5px",
          }}
        >
          {frame.title}
        </div>
      ) : null}

      {/* "Before" — area between top of canvas and the anchor band. */}
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          // The anchor band is roughly y=860..1060; before block sits above.
          top: frame.title ? 270 : 200,
          height: 530,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          alignItems: "center",
          textAlign: "center",
          fontFamily: SERIF,
          fontWeight: 400,
          fontStyle: frame.layout === "quote" ? "italic" : "normal",
          fontSize: FONT_BODY_SIZE,
          lineHeight: LINE_HEIGHT,
          color: INK,
          filter: `url(#${VBLUR_ID})`,
        }}
      >
        <BodyBlock text={frame.before} layout={frame.layout} />
      </div>

      {/* "After" — area below the anchor band. */}
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 1100,
          height: 580,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "center",
          textAlign: "center",
          fontFamily: SERIF,
          fontWeight: 400,
          fontStyle: frame.layout === "quote" ? "italic" : "normal",
          fontSize: FONT_BODY_SIZE,
          lineHeight: LINE_HEIGHT,
          color: INK,
          filter: `url(#${VBLUR_ID})`,
        }}
      >
        <BodyBlock text={frame.after} layout={frame.layout} />
      </div>
    </div>
  );
};

const BodyBlock: React.FC<{ text: string; layout: TextCutFrameProps["layout"] }> = ({
  text,
  layout,
}) => {
  if (layout === "list") {
    const lines = text.split("\n");
    return (
      <div style={{ textAlign: "left", maxWidth: 760 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ marginBottom: 8 }}>{l}</div>
        ))}
      </div>
    );
  }
  if (layout === "columns") {
    return (
      <div
        style={{
          columnCount: 2,
          columnGap: 40,
          textAlign: "justify",
          maxWidth: 880,
        }}
      >
        {text}
      </div>
    );
  }
  // paragraph + quote
  return <div style={{ maxWidth: 880 }}>{text}</div>;
};

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Cross-fade between consecutive cuts. Each cut has a slot of `slot` frames;
 * the first `fadeWin` frames of each cut (except the first) fade IN while the
 * previous cut fades OUT — so on those frames the OPACITY of the new cut
 * ramps 0→1 and the previous cut's opacity ramps 1→0 (handled by symmetry,
 * since we render every cut and compute its own opacity).
 */
function computeCutOpacity(
  frame: number,
  index: number,
  slot: number,
  fadeWin: number,
  totalFrames: number,
  cutCount: number
): number {
  const start = index * slot;
  const end = (index + 1) * slot;

  // Fade-in (except first cut).
  if (index > 0 && frame >= start && frame < start + fadeWin) {
    return interpolate(frame, [start, start + fadeWin], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  // Fade-out (except last cut).
  if (
    index < cutCount - 1 &&
    frame >= end - fadeWin &&
    frame < end
  ) {
    return interpolate(frame, [end - fadeWin, end], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  // Fully visible during the steady portion of the slot.
  if (frame >= start && frame < end) return 1;
  // Outside the slot (and outside fade overlap with neighbours): hidden.
  // The neighbour's fade-out / fade-in already covers the boundary because
  // both cuts compute their opacity on the SAME frame independently.
  if (
    index < cutCount - 1 &&
    frame >= end &&
    frame < end + fadeWin
  ) {
    // We are inside the next cut's fade-in: this (outgoing) cut already
    // hit 0 at `end`, so stay at 0.
    return 0;
  }
  if (
    index > 0 &&
    frame >= start - fadeWin &&
    frame < start
  ) {
    // Inside this cut's fade-in window relative to neighbour — but our
    // own slot hasn't started yet, so we're still 0.
    return 0;
  }
  return 0;
}
