import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";

/* ------------------------------------------------------------------------- */
/* Schema                                                                    */
/* ------------------------------------------------------------------------- */

export const textCutFrameSchema = z.object({
  layout: z.enum(["novel", "typewriter", "manuscript", "press", "marginalia"]),
  linesAbove: z.array(z.string()),
  inlinePrefix: z.string(),
  inlineSuffix: z.string(),
  linesBelow: z.array(z.string()),
});

export const textMatchCutSchema = z.object({
  word: z.string(),
  frames: z.array(textCutFrameSchema).min(4).max(6),
  durationMs: z.number().default(3000),
  fps: z.number().default(30),
  width: z.number().default(1080),
  height: z.number().default(1920),
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
const TYPEWRITER = '"Courier Prime", "Courier New", Courier, monospace';

/** Body / anchor share the same font size so the anchor reads as inline text. */
const FONT_SIZE = 124;
const LINE_HEIGHT = 1.18;
const ROW_HEIGHT = FONT_SIZE * LINE_HEIGHT; // ≈ 146 px
const ANCHOR_Y = 960; // vertical center of the 1920px canvas

/** Approximate glyph width per character (used to roughly size the anchor's
 *  on-screen footprint so prefix/suffix can be placed without overlap). */
const GLYPH_W_SERIF = FONT_SIZE * 0.55;

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
  const slot = totalFrames / cutCount;
  const fadeWin = Math.max(3, Math.round(fps * 0.13));

  const currentFrame = useCurrentFrame();

  // Anchor word micro-pulse: scale 1.00 → 1.018 over each cut.
  const cutIndexFloat = currentFrame / slot;
  const localPhase = cutIndexFloat - Math.floor(cutIndexFloat);
  const anchorScale = 1 + Math.sin(localPhase * Math.PI) * 0.018;

  // Anchor footprint width estimate so prefix/suffix can be placed beside it.
  const anchorWidth = Math.max(180, word.length * GLYPH_W_SERIF * 1.05);

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, overflow: "hidden" }}>
      <SvgDefs />
      <PaperBackground />

      {frames.map((f, i) => {
        const opacity = computeCutOpacity(currentFrame, i, slot, fadeWin, cutCount);
        if (opacity <= 0) return null;
        return (
          <AbsoluteFill key={i} style={{ opacity }}>
            <CutLayer frame={f} index={i} anchorWidth={anchorWidth} />
          </AbsoluteFill>
        );
      })}

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
      <filter id={VBLUR_ID} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="0 8" />
      </filter>
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
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.10) 100%)",
      }}
    />
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
      top: ANCHOR_Y,
      left: "50%",
      transform: `translate(-50%, -50%) scale(${scale})`,
      transformOrigin: "center center",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: 10,
    }}
  >
    <span
      style={{
        position: "relative",
        fontFamily: SERIF,
        fontWeight: 700,
        fontSize: FONT_SIZE,
        color: INK,
        lineHeight: 1,
        padding: "6px 18px",
        display: "inline-block",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "10px 2px 12px 2px",
          background: `linear-gradient(180deg, ${STABILO} 0%, ${STABILO_DARK} 100%)`,
          transform: "rotate(-0.6deg) skewX(-2deg)",
          borderRadius: 4,
          mixBlendMode: "multiply",
          opacity: 0.94,
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
  anchorWidth: number;
}> = ({ frame, index, anchorWidth }) => {
  // Per-cut tilt + offset so consecutive frames feel like different photos.
  const seed = (index * 13) % 7;
  const tilt = (seed - 3) * 0.18;
  const offsetY = (seed - 3) * 4;

  const isMono = frame.layout === "typewriter";
  const fontFamily = isMono ? TYPEWRITER : SERIF;
  const fontWeight = frame.layout === "manuscript" ? 600 : 400;
  const fontStyle = frame.layout === "marginalia" ? "italic" : "normal";

  const baseTextStyle: React.CSSProperties = {
    fontFamily,
    fontWeight,
    fontStyle,
    fontSize: FONT_SIZE,
    lineHeight: 1,
    color: INK,
    whiteSpace: "nowrap",
    filter: `url(#${VBLUR_ID})`,
  };

  // Horizontal gap between anchor box edge and prefix/suffix text.
  const sideGap = 22;
  const halfAnchor = anchorWidth / 2;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `rotate(${tilt}deg) translateY(${offsetY}px)`,
        transformOrigin: "center center",
      }}
    >
      {/* Lines ABOVE the anchor row, stacked upward. */}
      {frame.linesAbove
        .slice()
        .reverse()
        .map((line, i) => {
          const y = ANCHOR_Y - ROW_HEIGHT * (i + 1);
          return (
            <div
              key={`a${i}`}
              style={{
                ...baseTextStyle,
                position: "absolute",
                top: y,
                left: "50%",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
              }}
            >
              {line}
            </div>
          );
        })}

      {/* Inline prefix on the anchor's row, right-aligned to anchor's left edge. */}
      {frame.inlinePrefix ? (
        <div
          style={{
            ...baseTextStyle,
            position: "absolute",
            top: ANCHOR_Y,
            right: `calc(50% + ${halfAnchor + sideGap}px)`,
            transform: "translateY(-50%)",
            textAlign: "right",
          }}
        >
          {frame.inlinePrefix}
        </div>
      ) : null}

      {/* Inline suffix on the anchor's row, left-aligned to anchor's right edge. */}
      {frame.inlineSuffix ? (
        <div
          style={{
            ...baseTextStyle,
            position: "absolute",
            top: ANCHOR_Y,
            left: `calc(50% + ${halfAnchor + sideGap}px)`,
            transform: "translateY(-50%)",
            textAlign: "left",
          }}
        >
          {frame.inlineSuffix}
        </div>
      ) : null}

      {/* Lines BELOW the anchor row, stacked downward. */}
      {frame.linesBelow.map((line, i) => {
        const y = ANCHOR_Y + ROW_HEIGHT * (i + 1);
        return (
          <div
            key={`b${i}`}
            style={{
              ...baseTextStyle,
              position: "absolute",
              top: y,
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

function computeCutOpacity(
  frame: number,
  index: number,
  slot: number,
  fadeWin: number,
  cutCount: number
): number {
  const start = index * slot;
  const end = (index + 1) * slot;

  if (index > 0 && frame >= start && frame < start + fadeWin) {
    return interpolate(frame, [start, start + fadeWin], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  if (index < cutCount - 1 && frame >= end - fadeWin && frame < end) {
    return interpolate(frame, [end - fadeWin, end], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  if (frame >= start && frame < end) return 1;
  return 0;
}
