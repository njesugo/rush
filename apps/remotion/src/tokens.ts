/**
 * Rush Reels — Design tokens.
 * Single source of truth for the Remotion design system.
 */

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

/** Colors — light theme aligned with the webapp brand. */
export const colors = {
  bg: "#FAFAFA",
  text: "#282829",
  /** Used sparingly: highlights, CTA, focus rings. */
  accent: "#1877F2",
  /** Caption secondary state (past/future words). */
  textMuted: "rgba(40, 40, 41, 0.45)",
  /** Subtle border for screenshot frames. */
  border: "rgba(40, 40, 41, 0.08)",
  /** Drop shadow under floating screenshots. */
  shadow: "0 20px 60px rgba(0, 0, 0, 0.15)",
} as const;

/** Typography. */
export const fonts = {
  sans: "Inter",
  mono: "JetBrains Mono",
} as const;

/** Border radii. */
export const radius = {
  card: 24,
  pill: 9999,
  small: 8,
} as const;

/**
 * Spring presets — all transitions in the system go through one of these to
 * keep the motion language consistent.
 */
export const springs = {
  /** Hook word reveal: punchy but not bouncy. */
  pop: { damping: 15, stiffness: 120, mass: 0.5 },
  /** Screenshot enter: smooth, slight overshoot. */
  enter: { damping: 18, stiffness: 90, mass: 0.6 },
  /** Caption word emphasis: subtle. */
  emphasize: { damping: 20, stiffness: 200, mass: 0.4 },
} as const;

/** Time helpers (ms → frames at our fps). */
export const ms = (milliseconds: number): number =>
  Math.round((milliseconds / 1000) * VIDEO.fps);
