import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts, springs } from "../tokens";

export type CaptionWord = {
  text: string;
  /** Word-level timestamps relative to the start of THIS caption sequence (ms). */
  startMs: number;
  endMs: number;
};

export type CaptionProps = {
  words: CaptionWord[];
  /** Position from the bottom of the frame. */
  bottom?: number;
};

/**
 * Bottom-third kinetic caption. Synced to word timestamps from the user's
 * voice-over (Whisper). The currently-active word springs slightly bigger and
 * gets accent color; past/future words remain in the muted state.
 */
export const Caption: React.FC<CaptionProps> = ({ words, bottom = 220 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        bottom,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "baseline",
        gap: "0.32em",
        fontFamily: fonts.sans,
        fontWeight: 700,
        fontSize: 56,
        lineHeight: 1.18,
        textAlign: "center",
      }}
    >
      {words.map((w, i) => {
        const isActive = ms >= w.startMs && ms < w.endMs;
        const isPast = ms >= w.endMs;
        const enterProgress = spring({
          frame: frame - Math.round((w.startMs / 1000) * fps),
          fps,
          config: springs.emphasize,
          durationInFrames: 10,
        });
        const scale = isActive ? 1 + 0.1 * enterProgress : 1;
        const color = isActive
          ? colors.accent
          : isPast
            ? colors.text
            : colors.textMuted;
        const opacity = interpolate(enterProgress, [0, 1], [0.55, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={`${i}-${w.text}`}
            style={{
              color,
              transform: `scale(${scale})`,
              transformOrigin: "center bottom",
              transition: "color 80ms linear",
              opacity: ms < w.startMs ? opacity : 1,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};
