import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { z } from "zod";
import { Hook } from "../components/Hook";
import { Caption, type CaptionWord } from "../components/Caption";
import { ScreenshotShowcase } from "../components/ScreenshotShowcase";
import { MockClaudeCowork } from "../components/MockClaudeCowork";
import { colors, ms } from "../tokens";

export const reelV1Schema = z.object({
  hook: z.object({
    text: z.string(),
    highlight: z.string().optional(),
  }),
  /** Caption words shown over the screenshot, with VO timestamps (ms from
   *  the start of the screenshot scene). */
  setupCaption: z.array(
    z.object({
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
    })
  ),
});

export type ReelV1Props = z.infer<typeof reelV1Schema>;

/**
 * PR8 demo composition — wires the 3 base components together so we can
 * iterate on the visual language in the Remotion preview before plugging in
 * Claude / the user's screenshots.
 *
 * Layout:
 *   0.0 - 3.0s : <Hook>            (90 frames)
 *   3.0 - 9.0s : <ScreenshotShowcase> + <Caption>   (180 frames)
 */
export const ReelV1: React.FC<ReelV1Props> = ({ hook, setupCaption }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <Sequence from={0} durationInFrames={ms(3000)}>
        <Hook text={hook.text} highlight={hook.highlight} />
      </Sequence>

      <Sequence from={ms(3000)} durationInFrames={ms(6000)}>
        <AbsoluteFill style={{ backgroundColor: colors.bg }}>
          <ScreenshotShowcase
            focusRect={{ x: 0.42, y: 0.32, w: 0.55, h: 0.4 }}
          >
            <MockClaudeCowork />
          </ScreenshotShowcase>
          <Caption words={setupCaption} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

/**
 * Default props used by the Remotion studio preview. Replace at render time
 * with the storyboard JSON produced by Claude.
 */
export const reelV1DefaultProps: ReelV1Props = {
  hook: {
    text: "Tout le monde parle de Claude Cowork mais voici les 4 fonctionnalités à connaître",
    highlight: "Cowork",
  },
  setupCaption: (
    [
      ["Claude", 0, 380],
      ["Cowork,", 380, 920],
      ["c'est", 920, 1180],
      ["bien", 1180, 1480],
      ["plus", 1480, 1780],
      ["qu'un", 1780, 2080],
      ["chat", 2080, 2520],
      ["partagé.", 2520, 3260],
      ["Voici", 3500, 3940],
      ["pourquoi.", 3940, 4720],
    ] satisfies [string, number, number][]
  ).map(([text, startMs, endMs]): CaptionWord => ({ text, startMs, endMs })),
};
