/**
 * Flame Design System - color tokens as hex values for runtime use.
 * Use these for props that require hex (e.g. ActivityIndicator color, icon color)
 * when className cannot be applied. Mirrors packages/ui/tailwind.config.js.
 */
export const colors = {
  primary: "#FF0000",
  "primary-900": "#CB0000",
  accent: "#59B2FF",
  "white-100": "#F9FBFE",
  "white-80": "rgba(255,255,255,0.8)",
  "white-50": "rgba(255,255,255,0.5)",
  "white-30": "rgba(255,255,255,0.3)",
  "white-10": "rgba(255,255,255,0.1)",
  background: "#000B12",
  surface: "#08131A",
  dark: "#041C2B",
  error: "#EA3370",
} as const;
