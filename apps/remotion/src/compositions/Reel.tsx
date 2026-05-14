import React from "react";
import { AbsoluteFill, Audio, Img, Sequence } from "remotion";
import {
  storyboardSchema,
  type Storyboard,
  type Section,
  type StoryboardAssets,
  type Overlay,
} from "@rush/shared";
import { Hook } from "../components/Hook";
import { Caption } from "../components/Caption";
import { ScreenshotShowcase } from "../components/ScreenshotShowcase";
import { EndCard } from "../components/EndCard";
import { MockClaudeCowork } from "../components/MockClaudeCowork";
import { Highlight } from "../components/Highlight";
import { CursorAction } from "../components/CursorAction";
import { TypeIntoField } from "../components/TypeIntoField";
import { colors, fonts, ms } from "../tokens";

export const reelSchema = storyboardSchema;
export type ReelProps = Storyboard;

/**
 * Data-driven reel composition. Renders any valid `Storyboard` (produced by
 * Claude or hand-authored) to mp4. Each section becomes a `<Sequence>` placed
 * at its `startMs`, with the appropriate component dispatched on `kind`.
 */
export const Reel: React.FC<ReelProps> = (storyboard) => {
  const { sections, assets } = storyboard;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {sections.map((section, i) => {
        const from = ms(section.startMs);
        const dur = Math.max(1, ms(section.endMs - section.startMs));
        return (
          <Sequence key={i} from={from} durationInFrames={dur} name={section.kind}>
            <SectionRenderer section={section} assets={assets} />
          </Sequence>
        );
      })}

      {assets.voiceUrl ? <Audio src={assets.voiceUrl} /> : null}
    </AbsoluteFill>
  );
};

const SectionRenderer: React.FC<{
  section: Section;
  assets: StoryboardAssets;
}> = ({ section, assets }) => {
  switch (section.kind) {
    case "hook":
      return <Hook text={section.text} highlight={section.highlight} />;

    case "setup":
    case "beat": {
      const url = assets.screenshots[section.screenshotIndex];
      const captionWords = section.caption.map((w) => ({
        text: w.text,
        // Caption timestamps in the storyboard are absolute; the component
        // expects them relative to its sequence start.
        startMs: w.startMs - section.startMs,
        endMs: w.endMs - section.startMs,
      }));
      const isBeat = section.kind === "beat";
      const overlays = isBeat ? section.overlays : [];
      return (
        <AbsoluteFill style={{ backgroundColor: colors.bg }}>
          {isBeat ? <BeatChip label={section.label} /> : null}
          <ScreenshotShowcase
            focusRect={section.focusRect}
            overlay={
              overlays.length > 0 ? (
                <OverlayLayer overlays={overlays} sectionStartMs={section.startMs} />
              ) : null
            }
          >
            {url ? (
              <Img
                src={url}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <MockClaudeCowork />
            )}
          </ScreenshotShowcase>
          <Caption words={captionWords} />
        </AbsoluteFill>
      );
    }

    case "endCard":
      return (
        <EndCard
          title={section.title}
          subtitle={section.subtitle}
          cta={section.cta}
        />
      );

    default:
      return null;
  }
};

/**
 * Renders all per-beat overlays. Each overlay's absolute timestamps are
 * shifted to be relative to the parent <Sequence> (which starts at
 * `sectionStartMs`).
 */
const OverlayLayer: React.FC<{
  overlays: Overlay[];
  sectionStartMs: number;
}> = ({ overlays, sectionStartMs }) => (
  <>
    {overlays.map((o, i) => {
      const startMs = o.startMs - sectionStartMs;
      const endMs = o.endMs - sectionStartMs;
      switch (o.kind) {
        case "highlight":
          return (
            <Highlight
              key={i}
              rect={o.rect}
              startMs={startMs}
              endMs={endMs}
              label={o.label}
            />
          );
        case "cursor":
          return (
            <CursorAction
              key={i}
              from={o.from}
              to={o.to}
              startMs={startMs}
              endMs={endMs}
              click={o.click}
            />
          );
        case "typeInto":
          return (
            <TypeIntoField
              key={i}
              rect={o.rect}
              text={o.text}
              startMs={startMs}
              endMs={endMs}
            />
          );
        default:
          return null;
      }
    })}
  </>
);

const BeatChip: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      position: "absolute",
      top: 110,
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
    }}
  >
    <div
      style={{
        backgroundColor: colors.accent,
        color: "#fff",
        fontFamily: fonts.sans,
        fontWeight: 700,
        fontSize: 36,
        padding: "12px 28px",
        borderRadius: 9999,
        letterSpacing: -0.3,
      }}
    >
      {label}
    </div>
  </div>
);

/**
 * Demo storyboard — same Claude Cowork hook as the PR8 ReelV1 default, now
 * authored as a full Storyboard so the studio preview renders the v2 pipeline
 * end-to-end (without screenshot URLs — falls back to MockClaudeCowork).
 */
export const reelDemoStoryboard: Storyboard = {
  version: 1,
  durationMs: 38000,
  fps: 30,
  width: 1080,
  height: 1920,
  assets: {
    screenshots: [],
    voiceUrl: null,
  },
  sections: [
    {
      kind: "hook",
      startMs: 0,
      endMs: 3000,
      text: "Tout le monde parle de Claude Cowork mais voici les 4 fonctionnalités à connaître",
      highlight: "Cowork",
    },
    {
      kind: "setup",
      startMs: 3000,
      endMs: 5000,
      screenshotIndex: 0,
      focusRect: { x: 0.42, y: 0.32, w: 0.55, h: 0.4 },
      caption: [
        { text: "Claude", startMs: 3000, endMs: 3380 },
        { text: "Cowork,", startMs: 3380, endMs: 3920 },
        { text: "c'est", startMs: 3920, endMs: 4180 },
        { text: "bien", startMs: 4180, endMs: 4480 },
        { text: "plus", startMs: 4480, endMs: 4780 },
        { text: "qu'un", startMs: 4780, endMs: 5000 },
      ],
    },
    {
      kind: "beat",
      index: 1,
      startMs: 5000,
      endMs: 12000,
      label: "01 · Espaces partagés",
      screenshotIndex: 0,
      focusRect: { x: 0.05, y: 0.18, w: 0.3, h: 0.5 },
      caption: [
        { text: "Crée", startMs: 5200, endMs: 5500 },
        { text: "un", startMs: 5500, endMs: 5650 },
        { text: "espace", startMs: 5650, endMs: 6100 },
        { text: "par", startMs: 6100, endMs: 6350 },
        { text: "projet,", startMs: 6350, endMs: 6900 },
        { text: "Claude", startMs: 7000, endMs: 7400 },
        { text: "garde", startMs: 7400, endMs: 7750 },
        { text: "le", startMs: 7750, endMs: 7900 },
        { text: "contexte.", startMs: 7900, endMs: 8600 },
      ],
      overlays: [],
    },
    {
      kind: "beat",
      index: 2,
      startMs: 12000,
      endMs: 19000,
      label: "02 · Multi-joueur",
      screenshotIndex: 0,
      focusRect: { x: 0.35, y: 0.12, w: 0.4, h: 0.3 },
      caption: [
        { text: "Toute", startMs: 12200, endMs: 12500 },
        { text: "ton", startMs: 12500, endMs: 12700 },
        { text: "équipe", startMs: 12700, endMs: 13150 },
        { text: "tape", startMs: 13150, endMs: 13450 },
        { text: "dans", startMs: 13450, endMs: 13700 },
        { text: "le", startMs: 13700, endMs: 13850 },
        { text: "même", startMs: 13850, endMs: 14150 },
        { text: "thread.", startMs: 14150, endMs: 14700 },
      ],
      overlays: [],
    },
    {
      kind: "beat",
      index: 3,
      startMs: 19000,
      endMs: 26000,
      label: "03 · Memory",
      screenshotIndex: 0,
      focusRect: { x: 0.4, y: 0.55, w: 0.45, h: 0.3 },
      caption: [
        { text: "Il", startMs: 19200, endMs: 19400 },
        { text: "se", startMs: 19400, endMs: 19550 },
        { text: "souvient", startMs: 19550, endMs: 20100 },
        { text: "de", startMs: 20100, endMs: 20300 },
        { text: "tout", startMs: 20300, endMs: 20650 },
        { text: "ce", startMs: 20650, endMs: 20800 },
        { text: "que", startMs: 20800, endMs: 21000 },
        { text: "vous", startMs: 21000, endMs: 21250 },
        { text: "écrivez.", startMs: 21250, endMs: 21900 },
      ],
      overlays: [],
    },
    {
      kind: "beat",
      index: 4,
      startMs: 26000,
      endMs: 33000,
      label: "04 · Templates",
      screenshotIndex: 0,
      focusRect: { x: 0.05, y: 0.65, w: 0.35, h: 0.3 },
      caption: [
        { text: "Sauvegarde", startMs: 26200, endMs: 26900 },
        { text: "tes", startMs: 26900, endMs: 27150 },
        { text: "prompts", startMs: 27150, endMs: 27600 },
        { text: "comme", startMs: 27600, endMs: 27900 },
        { text: "des", startMs: 27900, endMs: 28100 },
        { text: "templates", startMs: 28100, endMs: 28700 },
        { text: "réutilisables.", startMs: 28700, endMs: 29600 },
      ],
      overlays: [],
    },
    {
      kind: "endCard",
      startMs: 33000,
      endMs: 38000,
      title: "Claude Cowork.",
      subtitle: "Le mode équipe que tout le monde attendait.",
      cta: "Suis-moi pour +",
    },
  ],
};
