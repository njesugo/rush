import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { colors, fonts, springs } from "../tokens";

export interface EndCardProps {
  title: string;
  subtitle?: string;
  cta?: string;
}

/**
 * Closing card. Big bold CTA over solid bg. Used as the last section of a
 * storyboard so the reel ends on a strong "follow / save" message.
 */
export const EndCard: React.FC<EndCardProps> = ({ title, subtitle, cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: springs.enter });
  const popCta = spring({
    frame: frame - 18,
    fps,
    config: springs.pop,
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
        gap: 40,
      }}
    >
      <div
        style={{
          opacity: enter,
          transform: `translateY(${(1 - enter) * 24}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: fonts.sans,
            fontWeight: 800,
            fontSize: 96,
            lineHeight: 1.05,
            color: colors.text,
            letterSpacing: -2,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              marginTop: 28,
              fontFamily: fonts.sans,
              fontWeight: 600,
              fontSize: 44,
              color: colors.textMuted,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      {cta ? (
        <div
          style={{
            opacity: Math.max(0, popCta),
            transform: `scale(${0.85 + 0.15 * Math.max(0, popCta)})`,
            backgroundColor: colors.accent,
            color: "#fff",
            fontFamily: fonts.sans,
            fontWeight: 700,
            fontSize: 56,
            padding: "28px 64px",
            borderRadius: 9999,
            letterSpacing: -0.5,
          }}
        >
          {cta}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
