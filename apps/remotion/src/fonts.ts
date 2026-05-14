/**
 * Load Inter + JetBrains Mono via @remotion/google-fonts so they're embedded
 * deterministically in renders (no FOUC, no missing-font issues on Lambda).
 */
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

loadInter("normal", { weights: ["400", "600", "700", "800"] });
loadJetBrains("normal", { weights: ["400", "600"] });
