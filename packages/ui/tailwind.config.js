/**
 * Shared Flame Design System Tailwind Config
 *
 * Single source of truth for design tokens extracted from Figma.
 * Both apps/mobile and apps/web consume this via `presets` in their own tailwind configs.
 *
 * Figma: https://www.figma.com/design/XTTWqwDXeC8aPHG6RpEdQ2/Flame-Final
 *
 * Flame 2.0 (`v2-*` namespace): tokens from the `flame-2.0/` prototype. Raw values live in
 * `packages/lib/src/design-tokens/flame-v2.ts`; a test in packages/lib fails if they drift.
 * The v1 tokens below stay as-is until every screen is migrated. Don't mix v1 and v2 on one screen.
 */

/** Flame 2.0 tokens — keep identical to packages/lib/src/design-tokens/flame-v2.ts */
const v2 = {
  colors: {
    ink: "#000000",
    ink2: "#0F0F0F",
    ink3: "#171717",
    ink4: "#222222",
    cream: "#FFFFFF",
    paper: "#F2EEE6",
    c90: "rgba(255,255,255,0.9)",
    c70: "rgba(255,255,255,0.66)",
    c50: "rgba(255,255,255,0.46)",
    c30: "rgba(255,255,255,0.26)",
    c16: "rgba(255,255,255,0.14)",
    c10: "rgba(255,255,255,0.09)",
    c06: "rgba(255,255,255,0.055)",
    flame: "#880517",
    accent: "#8A281C",
    dot: "#E0312B",
    good: "#4CD787",
    warn: "#FFB443",
    errorText: "#FF8A7A",
  },
  radii: { xs: 6, sm: 10, md: 12, lg: 14, flyer: 16, card: 18, sheet: 20, pill: 999 },
};

const prefix = (obj, fn) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [`v2-${k}`, fn ? fn(v) : v]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      colors: {
        background: "#000B12",
        surface: "#08131A",
        card: "rgba(255,255,255,0.06)",
        "card-border": "rgba(255,255,255,0.3)",
        "white-100": "#F9FBFE",
        "white-80": "rgba(255,255,255,0.8)",
        "white-70": "rgba(255,255,255,0.7)",
        "white-60": "rgba(255,255,255,0.6)",
        "white-50": "rgba(255,255,255,0.5)",
        "white-30": "rgba(255,255,255,0.3)",
        "white-20": "rgba(255,255,255,0.2)",
        "white-10": "rgba(255,255,255,0.1)",
        "white-5": "rgba(255,255,255,0.05)",
        primary: "#FF0000",
        "primary-900": "#CB0000",
        accent: "#59B2FF",
        dark: "#041C2B",
        error: "#EA3370",
        ...prefix(v2.colors),
      },
      fontFamily: {
        poppins: ["Poppins_400Regular"],
        "poppins-light": ["Poppins_300Light"],
        "poppins-medium": ["Poppins_500Medium"],
        "poppins-semibold": ["Poppins_600SemiBold"],
        "poppins-bold": ["Poppins_700Bold"],
        // Flame 2.0 — React Native needs one family per weight (@expo-google-fonts names).
        // apps/web overrides these with the CSS families "Inter" / "Inter Tight".
        "v2-ui": ["Inter_400Regular"],
        "v2-ui-medium": ["Inter_500Medium"],
        "v2-ui-semibold": ["Inter_600SemiBold"],
        "v2-ui-bold": ["Inter_700Bold"],
        "v2-display": ["InterTight_600SemiBold"],
        "v2-display-bold": ["InterTight_700Bold"],
        "v2-display-extrabold": ["InterTight_800ExtraBold"],
      },
      borderRadius: {
        pill: "40px",
        card: "16px",
        badge: "12px",
        circle: "9999px",
        ...prefix(v2.radii, (n) => `${n}px`),
      },
      boxShadow: {
        card: "0 8px 30px rgba(80,85,136,0.06)",
      },
      lineHeight: {
        22: "22px",
      },
    },
  },
  plugins: [],
};
