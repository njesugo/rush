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
      title: "amour, n.m.",
      before: "Du latin classique. Premier emploi attesté en 1690 dans les",
      after: "dictionnaires de l'époque. Synonymes proches : forme, idée, principe.",
      layout: "paragraph",
    },
    {
      title: "Chapitre VII",
      before: "Elle relut la lettre une dernière fois. Le mot revenait sans cesse, comme un",
      after: "lancinant qu'elle ne pouvait plus chasser. Il pleuvait sur les tuiles.",
      layout: "paragraph",
    },
    {
      title: "Trois choses à retenir",
      before: "• Toujours commencer par l'essentiel\n• Ne jamais oublier le",
      after: "• Et savoir reconnaître quand s'arrêter",
      layout: "list",
    },
    {
      title: null,
      before: "« Au commencement était le",
      after: "», disait-il en souriant. Personne ne sut jamais s'il plaisantait.",
      layout: "quote",
    },
    {
      title: "Édito du jour",
      before: "Disons-le franchement : on a perdu le sens du",
      after: "et c'est probablement ce qui explique tout le reste, à y regarder de près.",
      layout: "columns",
    },
  ],
};
