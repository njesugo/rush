import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, ms, springs } from "../tokens";

export type CursorActionProps = {
  /** Start point in normalized [0,1] screenshot coords. */
  from: { x: number; y: number };
  /** End point in normalized [0,1] screenshot coords. */
  to: { x: number; y: number };
  /** Onset relative to the parent <Sequence> in ms. */
  startMs: number;
  /** Offset relative to the parent <Sequence> in ms. */
  endMs: number;
  /** If true, plays a click ripple at `to` once the cursor arrives. */
  click?: boolean;
};

/**
 * Ghost cursor SVG that slides from `from` to `to` over the active window,
 * then optionally plays a click ripple. Lives in the same normalized coord
 * space as the screenshot it's overlaid on.
 *
 * Motion: 60% of the window is the move, then a hold; click ripple at 70%.
 */
export const CursorAction: React.FC<CursorActionProps> = ({
  from,
  to,
  startMs,
  endMs,
  click = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = ms(startMs);
  const endFrame = ms(endMs);
  if (frame < startFrame - 1 || frame > endFrame + 1) return null;

  const totalFrames = Math.max(2, endFrame - startFrame);
  const moveFrames = Math.round(totalFrames * 0.6);
  const clickAt = Math.round(totalFrames * 0.7);

  // Smooth move with spring for natural deceleration.
  const moveT = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 22, stiffness: 75, mass: 0.9 },
    durationInFrames: moveFrames,
  });

  const x = interpolate(moveT, [0, 1], [from.x, to.x]);
  const y = interpolate(moveT, [0, 1], [from.y, to.y]);

  // Fade in / out around the boundaries.
  const enter = spring({
    frame: frame - startFrame,
    fps,
    config: springs.enter,
    durationInFrames: 8,
  });
  const exit = spring({
    frame: frame - (endFrame - 8),
    fps,
    config: springs.enter,
    durationInFrames: 8,
  });
  const opacity = enter * (1 - exit);

  // Click ripple
  let clickProgress = 0;
  if (click && frame >= startFrame + clickAt) {
    clickProgress = spring({
      frame: frame - (startFrame + clickAt),
      fps,
      config: { damping: 18, stiffness: 120, mass: 0.5 },
      durationInFrames: 18,
    });
  }
  const rippleSize = interpolate(clickProgress, [0, 1], [0, 120]);
  const rippleOpacity = interpolate(clickProgress, [0, 0.4, 1], [0.6, 0.4, 0]);

  return (
    <>
      {click ? (
        <div
          style={{
            position: "absolute",
            left: `${to.x * 100}%`,
            top: `${to.y * 100}%`,
            width: rippleSize,
            height: rippleSize,
            marginLeft: -rippleSize / 2,
            marginTop: -rippleSize / 2,
            borderRadius: "50%",
            border: `4px solid ${colors.accent}`,
            opacity: rippleOpacity,
            pointerEvents: "none",
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: 56,
          height: 56,
          marginLeft: -8,
          marginTop: -6,
          opacity,
          pointerEvents: "none",
        }}
      >
        <CursorSvg />
      </div>
    </>
  );
};

const CursorSvg: React.FC = () => (
  <svg
    width="56"
    height="56"
    viewBox="0 0 24 24"
    style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.25))" }}
  >
    <path
      d="M5 3 L5 19 L9 15 L11 21 L14 20 L12 14 L18 14 Z"
      fill="#fff"
      stroke="#282829"
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </svg>
);
