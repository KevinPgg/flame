/**
 * Unit tests of the app (fase 1b, jest-expo). Logic shared with the web lives in packages/lib and
 * is tested there (vitest); here: v2 screens (permissions, flows) with @testing-library/react-native.
 * Run: pnpm --filter @project-flame/mobile test
 */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts?(x)"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@project-flame/.*|nativewind|react-native-css-interop|@clerk/.*)",
  ],
};
