import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, radius, springs, ms } from "../tokens";

export type HighlightProps = {
  /** Rect on the screenshot in normalized [0,1] coords (top-left origin). */
  rect: { x: number; y: number; w: number; h: number };
  /** Onset relative to the parent <Sequence> in ms. */
  startMs: number;
  /** Offset relative to the parent <Sequence> in ms. */
  endMs: number;
  /** Optional caption tag rendered next to the highlight. */
  label?: string;
};

/**
 * Animated rounded outline drawn over a region of the underlying screenshot.
 * Lives inside the same transformed coordinate space as `<ScreenshotShowcase>`'s
 * inner div — so coordinates are normalized to the screenshot bounds.
 *
 * Renders nothing outside [startMs, endMs].
 */
export const Highlight: React.FC<HighlightProps> = ({
  rect,
  startMs,
  endMs,
  label,
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
    durationInFrames: 14,
  });
  const exit = spring({
    frame: frame - (endFrame - 8),
    fps,
    config: springs.enter,
    durationInFrames: 10,
  });
  const opacity = enter * (1 - exit);

  // Subtle pulse on the outline while visible.
  const pulse = 0.5 + 0.5 * Math.sin((frame - startFrame) * 0.18);
  const ringWidth = 4 + 2 * pulse;

  return (
    <div
      style={{
        position: "absolute",
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
        borderRadius: radius.small,
        boxShadow: `0 0 0 ${ringWidth}px ${colors.accent}, 0 0 0 ${ringWidth + 6}px rgba(24, 119, 242, 0.18)`,
        opacity,
        transform: `scale(${0.96 + 0.04 * enter})`,
        transformOrigin: "center center",
        pointerEvents: "none",
      }}
    >
      {label ? (
        <div
          style={{
            position: "absolute",
            top: -56,
            left: 0,
            backgroundColor: colors.accent,
            color: "#fff",
            fontFamily: "Inter",
            fontWeight: 700,
            fontSize: 28,
            padding: "8px 18px",
            borderRadius: radius.pill,
            whiteSpace: "nowrap",
            opacity: interpolate(enter, [0, 0.6, 1], [0, 0, 1]),
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};
