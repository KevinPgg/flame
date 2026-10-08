const flamePreset = require("../../packages/ui/tailwind.config.js");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "../../packages/ui/src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset"), flamePreset],
  theme: {
    extend: {},
  },
  plugins: [],
};
