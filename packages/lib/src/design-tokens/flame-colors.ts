/**
 * Canonical Flame color strings — keep in sync with `packages/ui/tailwind.config.js` (`theme.extend.colors`).
 * Use for APIs that require raw CSS color values (e.g. Stripe Elements `appearance`), not Tailwind class names.
 */
export const flameColors = {
  background: "#000B12",
  surface: "#08131A",
  card: "rgba(255,255,255,0.06)",
  cardBorder: "rgba(255,255,255,0.3)",
  white100: "#F9FBFE",
  white80: "rgba(255,255,255,0.8)",
  white70: "rgba(255,255,255,0.7)",
  /** Matches Tailwind `white-60` (focus rings, strong borders). */
  white60: "rgba(255,255,255,0.6)",
  white50: "rgba(255,255,255,0.5)",
  white30: "rgba(255,255,255,0.3)",
  white20: "rgba(255,255,255,0.2)",
  white10: "rgba(255,255,255,0.1)",
  white5: "rgba(255,255,255,0.05)",
  primary: "#FF0000",
  primary900: "#CB0000",
  accent: "#59B2FF",
  dark: "#041C2B",
  error: "#EA3370",
} as const;

/** Primary light text / “white” on dark UI (`white-100` in Tailwind). */
export const flameColorWhite = flameColors.white100;
