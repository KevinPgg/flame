/**
 * Shared Flame Design System Tailwind Config
 *
 * Single source of truth for design tokens extracted from Figma.
 * Both apps/mobile and apps/web consume this via `presets` in their own tailwind configs.
 *
 * Figma: https://www.figma.com/design/XTTWqwDXeC8aPHG6RpEdQ2/Flame-Final
 */

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
      },
      fontFamily: {
        poppins: ["Poppins_400Regular"],
        "poppins-light": ["Poppins_300Light"],
        "poppins-medium": ["Poppins_500Medium"],
        "poppins-semibold": ["Poppins_600SemiBold"],
        "poppins-bold": ["Poppins_700Bold"],
      },
      borderRadius: {
        pill: "40px",
        card: "16px",
        badge: "12px",
        circle: "9999px",
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
