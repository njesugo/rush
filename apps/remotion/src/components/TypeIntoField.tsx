import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts, ms, springs } from "../tokens";

export type TypeIntoFieldProps = {
  /** Rect of the input field on the screenshot, normalized [0,1]. */
  rect: { x: number; y: number; w: number; h: number };
  /** Text typed character-by-character across [startMs, endMs]. */
  text: string;
  /** Onset relative to the parent <Sequence> in ms. */
  startMs: number;
  /** Offset relative to the parent <Sequence> in ms. */
  endMs: number;
};

/**
 * Simulates typing into an input on the screenshot. Renders a white "field"
 * card over the supplied rect with a blinking caret + progressively revealed
 * text. The text grows linearly across [startMs, endMs - 200ms], then a
 * caret blink continues until endMs.
 */
export const TypeIntoField: React.FC<TypeIntoFieldProps> = ({
  rect,
  text,
  startMs,
  endMs,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = ms(startMs);
  const endFrame = ms(endMs);
  if (frame < startFrame - 1 || frame > endFrame + 1) return null;

  const enter = spring({
    frame: frame - startFrame,
    fps,
    config: springs.enter,
    durationInFrames: 10,
  });
  const exit = spring({
    frame: frame - (endFrame - 6),
    fps,
    config: springs.enter,
    durationInFrames: 8,
  });
  const opacity = enter * (1 - exit);

  // Reveal characters across the typing window (leave a 200ms tail).
  const typeEndFrame = endFrame - ms(200);
  const totalTypeFrames = Math.max(1, typeEndFrame - startFrame);
  const elapsedTypeFrames = Math.max(0, Math.min(totalTypeFrames, frame - startFrame));
  const reveal = elapsedTypeFrames / totalTypeFrames;
  const visibleChars = Math.max(0, Math.min(text.length, Math.round(text.length * reveal)));
  const visibleText = text.slice(0, visibleChars);

  // Caret blink (15 fps blink rate ⇒ visible half the time).
  const caretOn = Math.floor((frame - startFrame) / Math.round(fps / 2)) % 2 === 0;

  // Font size = 60% of rect height (capped). Field is 1080-px wide canvas →
  // pixel sizes work out fine because the inner showcase is 880×1100.
  const fontSize = Math.max(18, Math.min(40, Math.round(rect.h * 1100 * 0.55)));

  return (
    <div
      style={{
        position: "absolute",
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
        backgroundColor: "#fff",
        border: `2px solid ${colors.accent}`,
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(24, 119, 242, 0.18)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        opacity,
        transform: `translateY(${interpolate(enter, [0, 1], [6, 0])}px)`,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontFamily: fonts.sans,
          fontWeight: 500,
          fontSize,
          color: colors.text,
          whiteSpace: "nowrap",
          letterSpacing: -0.2,
        }}
      >
        {visibleText}
        <span
          style={{
            display: "inline-block",
            width: 2,
            height: fontSize * 1.1,
            marginLeft: 2,
            verticalAlign: "middle",
            backgroundColor: caretOn ? colors.accent : "transparent",
          }}
        />
      </span>
    </div>
  );
};
