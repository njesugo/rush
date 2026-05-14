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
    </>
  );
};
