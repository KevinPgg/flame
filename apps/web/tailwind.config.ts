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
