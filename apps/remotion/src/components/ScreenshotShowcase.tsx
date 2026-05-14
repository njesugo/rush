import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, radius, springs } from "../tokens";

export type ScreenshotShowcaseProps = {
  /** What goes inside the "device" — typically <img src=... /> or a mock UI. */
  children: React.ReactNode;
  /**
   * Optional overlay layer rendered above the screenshot but inside the same
   * zoom/translation transform — so overlays placed in normalized [0,1] coords
   * track the screenshot when it zooms.
   */
  overlay?: React.ReactNode;
  /** Width of the showcase frame. Defaults to 880 (90 % of 1080-w canvas). */
  width?: number;
  /** Height of the showcase frame. Defaults to 1100. */
  height?: number;
  /**
   * Optional focus rect in normalized 0-1 coords inside the screenshot.
   * If provided, after the entry animation the showcase slowly zooms into
   * that region.
   */
  focusRect?: { x: number; y: number; w: number; h: number };
};

const ENTER_DURATION = 22; // frames
const ZOOM_START_FRAME = 28;
const ZOOM_DURATION = 90;

/**
 * Floating "screenshot" container with brand-aligned chrome (rounded corners,
 * shadow, border). Animates in with a smooth spring. Optionally zooms into a
 * focal region after the entry settles.
 */
export const ScreenshotShowcase: React.FC<ScreenshotShowcaseProps> = ({
  children,
  overlay,
  width = 880,
  height = 1100,
  focusRect,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame,
    fps,
    config: springs.enter,
    durationInFrames: ENTER_DURATION,
  });

  // Optional zoom-into-focus
  let zoomScale = 1;
  let zoomTx = 0;
  let zoomTy = 0;
  if (focusRect) {
    const z = spring({
      frame: frame - ZOOM_START_FRAME,
      fps,
      config: { damping: 28, stiffness: 50, mass: 1 },
      durationInFrames: ZOOM_DURATION,
    });
    // Target scale = 1 / max(focusRect.w, focusRect.h) capped at 2.2
    const target = Math.min(2.2, 1 / Math.max(focusRect.w, focusRect.h, 0.45));
    zoomScale = 1 + (target - 1) * z;
    // Center the focus region
    const cx = focusRect.x + focusRect.w / 2; // 0..1
    const cy = focusRect.y + focusRect.h / 2;
    zoomTx = (0.5 - cx) * width * z;
    zoomTy = (0.5 - cy) * height * z;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width,
        height,
        marginLeft: -width / 2,
        marginTop: -height / 2,
        borderRadius: radius.card,
        backgroundColor: "#fff",
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
        overflow: "hidden",
        transform: `scale(${0.92 + 0.08 * enter})`,
        opacity: enter,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transform: `translate(${zoomTx}px, ${zoomTy}px) scale(${zoomScale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
        {overlay ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
            }}
          >
            {overlay}
          </div>
        ) : null}
      </div>
    </div>
  );
};
