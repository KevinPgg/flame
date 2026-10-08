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
        // Flame 2.0 — on the web one CSS family covers every weight; pair with font-medium/semibold/bold.
        "v2-ui": ["Inter", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        "v2-ui-medium": ["Inter", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        "v2-ui-semibold": ["Inter", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        "v2-ui-bold": ["Inter", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        "v2-display": ["Inter Tight", "Inter", "-apple-system", "sans-serif"],
        "v2-display-bold": ["Inter Tight", "Inter", "-apple-system", "sans-serif"],
        "v2-display-extrabold": ["Inter Tight", "Inter", "-apple-system", "sans-serif"],
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
