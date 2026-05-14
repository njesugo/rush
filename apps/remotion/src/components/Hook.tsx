import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts, radius, springs } from "../tokens";

export type HookProps = {
  /** Full punchline text. Will be split on whitespace and revealed word-by-word. */
  text: string;
  /**
   * Optional substring matched (case-insensitive) inside `text`. The matching
   * word(s) get a Facebook-blue pill highlight.
   */
  highlight?: string;
};

const STAGGER_FRAMES = 4; // ~133 ms between each word at 30fps

/**
 * Big punchline that fills the screen. Each word springs in from below with
 * a small scale + opacity ramp, staggered. The optional highlighted word(s)
 * gets a brand-blue pill background.
 */
export const Hook: React.FC<HookProps> = ({ text, highlight }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.trim().split(/\s+/);
  const highlightLower = highlight?.trim().toLowerCase() ?? null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          fontFamily: fonts.sans,
          fontWeight: 800,
          fontSize: 92,
          lineHeight: 1.08,
          color: colors.text,
          letterSpacing: -1.5,
          textAlign: "center",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.25em",
          maxWidth: "100%",
        }}
      >
        {words.map((word, i) => {
          const startFrame = i * STAGGER_FRAMES;
          const progress = spring({
            frame: frame - startFrame,
            fps,
            config: springs.pop,
            durationInFrames: 14,
          });
          const isHighlighted =
            highlightLower !== null &&
            word.toLowerCase().replace(/[.,!?;:]/g, "") === highlightLower;
          return (
            <span
              key={`${i}-${word}`}
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - progress) * 28}px) scale(${
                  0.85 + progress * 0.15
                })`,
                opacity: progress,
                ...(isHighlighted
                  ? {
                      backgroundColor: colors.accent,
                      color: "#fff",
                      padding: "2px 22px",
                      borderRadius: radius.pill,
                    }
                  : {}),
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
