import type { Config } from "tailwindcss";
const flamePreset = require("../../packages/ui/tailwind.config.js");

const config: Config = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "../../packages/ui/src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [flamePreset],
  theme: {
    extend: {
      fontFamily: {
        poppins: ["Poppins", "sans-serif"],
        "poppins-light": ["Poppins", "sans-serif"],
        "poppins-medium": ["Poppins", "sans-serif"],
        "poppins-semibold": ["Poppins", "sans-serif"],
        "poppins-bold": ["Poppins", "sans-serif"],
        // Flame 2.0 — fonts loaded by next/font in app/v2/layout.tsx (CSS variables).
        // On the web one family covers every weight, so each class also sets its weight below.
        "v2-ui": ["var(--font-v2-ui, Inter)", "Inter", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        "v2-ui-medium": ["var(--font-v2-ui, Inter)", "Inter", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        "v2-ui-semibold": ["var(--font-v2-ui, Inter)", "Inter", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        "v2-ui-bold": ["var(--font-v2-ui, Inter)", "Inter", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        "v2-display": ["var(--font-v2-display, \"Inter Tight\")", "Inter Tight", "Inter", "-apple-system", "sans-serif"],
        "v2-display-bold": ["var(--font-v2-display, \"Inter Tight\")", "Inter Tight", "Inter", "-apple-system", "sans-serif"],
        "v2-display-extrabold": ["var(--font-v2-display, \"Inter Tight\")", "Inter Tight", "Inter", "-apple-system", "sans-serif"],
      },
      zIndex: {
        "200": "200",
        "300": "300",
        "1000": "1000",
      },
    },
  },
  plugins: [],
};

export default config;
