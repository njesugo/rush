import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { VIDEO, ms } from "./tokens";
import {
  ReelV1,
  reelV1DefaultProps,
  reelV1Schema,
} from "./compositions/ReelV1";
import { Reel, reelDemoStoryboard, reelSchema } from "./compositions/Reel";
import {
  TextMatchCut,
  textMatchCutSchema,
  type TextMatchCutProps,
} from "./compositions/TextMatchCut";

/**
 * Remotion root — registers all compositions. Add new ones here.
 *  - ReelV1 : PR8 hand-wired demo (Hook + ScreenshotShowcase + Caption)
 *  - Reel   : PR9 data-driven composition rendering any Storyboard JSON
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ReelV1"
        component={ReelV1}
        durationInFrames={ms(9000)}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
        schema={reelV1Schema}
        defaultProps={reelV1DefaultProps}
      />
      <Composition
        id="Reel"
        component={Reel}
        // For studio preview we use the demo storyboard's duration; render
        // commands override via calculateMetadata once real props are passed.
        durationInFrames={ms(reelDemoStoryboard.durationMs)}
        fps={reelDemoStoryboard.fps}
        width={reelDemoStoryboard.width}
        height={reelDemoStoryboard.height}
        schema={reelSchema}
        defaultProps={reelDemoStoryboard}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            1,
            Math.round((props.durationMs / 1000) * props.fps)
          ),
          fps: props.fps,
          width: props.width,
          height: props.height,
        })}
      />
      <Composition
        id="TextMatchCut"
        component={TextMatchCut}
        durationInFrames={ms(3000)}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
        schema={textMatchCutSchema}
        defaultProps={textMatchCutDefaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            1,
            Math.round((props.durationMs / 1000) * props.fps)
          ),
          fps: props.fps,
          width: props.width,
          height: props.height,
        })}
      />
    </>
  );
};

const textMatchCutDefaultProps: TextMatchCutProps = {
  word: "amour",
  durationMs: 3000,
  fps: 30,
  width: 1080,
  height: 1920,
  audioUrl: null,
  frames: [
    {
      layout: "novel",
      linesAbove: [
        "Elle relut la",
        "lettre une",
        "dernière fois.",
        "Le mot revenait",
        "sans cesse,",
        "comme un",
      ],
      inlinePrefix: "battement",
      inlineSuffix: "lancinant",
      linesBelow: [
        "qu'elle ne",
        "pouvait plus",
        "chasser de sa",
        "tête. Dehors,",
        "il pleuvait",
        "sur les tuiles.",
      ],
    },
    {
      layout: "press",
      linesAbove: [
        "Du latin",
        "classique,",
        "premier emploi",
        "attesté en 1690",
        "dans les",
        "ouvrages de",
      ],
      inlinePrefix: "référence,",
      inlineSuffix: "désigne",
      linesBelow: [
        "depuis lors",
        "l'ensemble des",
        "phénomènes",
        "associés à la",
        "perception, la",
        "mémoire et l'",
      ],
    },
    {
      layout: "manuscript",
      linesAbove: [
        "Et estoit là",
        "escript en",
        "lettres d'or",
        "sur le vieux",
        "parchemin, le",
        "très grand et",
      ],
      inlinePrefix: "très saint",
      inlineSuffix: "que",
      linesBelow: [
        "nul homme ne",
        "pouvoit dire",
        "à voix haulte",
        "sans en frémir",
        "d'aise et de",
        "crainte aussi.",
      ],
    },
    {
      layout: "typewriter",
      linesAbove: [
        "ÉTAPE 3.",
        "Localisez la",
        "zone marquée",
        "d'un trait jaune",
        "et identifiez",
        "soigneusement",
      ],
      inlinePrefix: "le",
      inlineSuffix: "principal",
      linesBelow: [
        "avant de",
        "poursuivre",
        "l'assemblage",
        "selon le schéma",
        "joint à la fin",
        "du présent livret.",
      ],
    },
    {
      layout: "marginalia",
      linesAbove: [
        "Au commencement",
        "il y avait",
        "le silence,",
        "puis vint enfin",
        "la lumière, puis",
        "tout doucement",
      ],
      inlinePrefix: "vint le",
      inlineSuffix: "—",
      linesBelow: [
        "et tout le",
        "reste découla",
        "de cette",
        "première petite",
        "syllabe que nul",
        "n'osa répéter.",
      ],
    },
  ],
};
