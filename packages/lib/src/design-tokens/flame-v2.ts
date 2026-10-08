/**
 * Flame 2.0 design tokens — extracted from the `flame-2.0/` prototype
 * ("FLAME 2.0 · design system v2": pure black · real flyers · one sans · white pills).
 *
 * Source of truth for raw values. `packages/ui/tailwind.config.js` exposes the same values
 * under the `v2-*` namespace; `__tests__/design-tokens-v2.test.ts` fails if they drift.
 *
 * The v1 tokens (`flame-colors.ts`, Poppins, #000B12) stay untouched until every screen
 * has moved to v2. Do not mix v1 and v2 tokens on the same screen.
 */

export const flameV2Colors = {
  /** App background — pure black. */
  ink: "#000000",
  /** Raised surfaces (cards, sheets) in increasing elevation. */
  ink2: "#0F0F0F",
  ink3: "#171717",
  ink4: "#222222",
  /** Primary text / white pills. */
  cream: "#FFFFFF",
  /** Light paper surface (QR full-screen, logo tiles). */
  paper: "#F2EEE6",
  /** Text and hairlines on black, by opacity. */
  c90: "rgba(255,255,255,0.9)",
  c70: "rgba(255,255,255,0.66)",
  c50: "rgba(255,255,255,0.46)",
  c30: "rgba(255,255,255,0.26)",
  c16: "rgba(255,255,255,0.14)",
  c10: "rgba(255,255,255,0.09)",
  c06: "rgba(255,255,255,0.055)",
  /**
   * Flame red as rendered on brand slides. Use as a FILL (tags, badges, active states,
   * bars) — never as small text on black (insufficient contrast).
   */
  flame: "#880517",
  /** Warmer red used for accents/glows. */
  accent: "#8A281C",
  /** Notification dot. */
  dot: "#E0312B",
  /** Semantic. */
  good: "#4CD787",
  warn: "#FFB443",
  /** Error text on black (readable, unlike `flame`). */
  errorText: "#FF8A7A",
} as const;

export const flameV2Fonts = {
  /** UI text. */
  ui: "Inter",
  /** Headlines, numbers, display. */
  display: "Inter Tight",
} as const;

/** Font weights actually used by the prototype. */
export const flameV2FontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const;

/** Type scale in px (most used sizes in the prototype). */
export const flameV2FontSizes = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 15,
  xl: 16,
  "2xl": 20,
  "3xl": 26,
  "4xl": 30,
} as const;

/** Letter spacing for display text (prototype uses negative tracking on Inter Tight). */
export const flameV2Tracking = {
  ui: "-0.005em",
  display: "-0.02em",
  displayTight: "-0.03em",
} as const;

/** Corner radii in px. */
export const flameV2Radii = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 14,
  /** Flyer images in the feed. */
  flyer: 16,
  /** Cards. */
  card: 18,
  sheet: 20,
  pill: 999,
} as const;

/** Layout constants from the app shell. */
export const flameV2Layout = {
  /** Feed flyer aspect ratio (width / height) — "Full flyer" mode. */
  flyerAspect: 4 / 5,
  /** Circular icon buttons in headers (back, search, bell, save). */
  circleButton: 40,
  /** Horizontal screen padding. */
  screenPadding: 16,
} as const;

export type FlameV2Color = keyof typeof flameV2Colors;
