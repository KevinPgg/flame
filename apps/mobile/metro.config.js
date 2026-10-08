const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const appNodeModules = path.resolve(projectRoot, "node_modules");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo (for packages/ui, packages/lib changes)
config.watchFolders = [monorepoRoot];

// 2. Let Metro resolve packages from these directories
config.resolver.nodeModulesPaths = [
  appNodeModules, // apps/mobile/node_modules (pinned React + react-dom for Metro)
  path.resolve(monorepoRoot, "node_modules"), // root hoisted packages
];

// 3. Map singleton packages to the app's exact copies.
//    This is a belt-and-suspenders measure — the primary fix is removing
//    duplicate react/react-native symlinks from packages/*/node_modules.
config.resolver.extraNodeModules = {
  // Expo itself — needed for "expo/virtual/env" virtual module resolution
  expo: path.resolve(appNodeModules, "expo"),
  react: path.resolve(appNodeModules, "react"),
  // @clerk/expo v3 pulls react-dom; `react` and `react-dom` must be the same version (avoid root hoisting a mismatch).
  "react-dom": path.resolve(appNodeModules, "react-dom"),
  "react-native": path.resolve(appNodeModules, "react-native"),
  "react-native-css-interop": path.resolve(
    appNodeModules,
    "react-native-css-interop"
  ),
  nativewind: path.resolve(appNodeModules, "nativewind"),
  "expo-router": path.resolve(appNodeModules, "expo-router"),
  "react-native-safe-area-context": path.resolve(
    appNodeModules,
    "react-native-safe-area-context"
  ),
  "react-native-reanimated": path.resolve(
    appNodeModules,
    "react-native-reanimated"
  ),
  "expo-font": path.resolve(appNodeModules, "expo-font"),
  "expo-constants": path.resolve(appNodeModules, "expo-constants"),
  "@tanstack/react-query": path.resolve(
    appNodeModules,
    "@tanstack/react-query"
  ),
  // Clerk auth (needs single React context)
  "@clerk/expo": path.resolve(appNodeModules, "@clerk/expo"),
  // Stripe payments (native module — requires dev build)
  "@stripe/stripe-react-native": path.resolve(
    appNodeModules,
    "@stripe/stripe-react-native"
  ),
  // Secure Store for Clerk token cache
  "expo-secure-store": path.resolve(appNodeModules, "expo-secure-store"),
  // OAuth flow dependencies
  "expo-web-browser": path.resolve(appNodeModules, "expo-web-browser"),
  "expo-auth-session": path.resolve(appNodeModules, "expo-auth-session"),
  // Vector icons — also in singletonPkgsToClean, pin for deterministic resolution
  "@expo/vector-icons": path.resolve(appNodeModules, "@expo/vector-icons"),
  // expo-image (FlameImage) — peerDep of packages/ui; same singleton-clean pattern
  "expo-image": path.resolve(appNodeModules, "expo-image"),
  "react-native-svg": path.resolve(appNodeModules, "react-native-svg"),
  // Camera (QR scanner)
  "expo-camera": path.resolve(appNodeModules, "expo-camera"),
  "expo-notifications": path.resolve(appNodeModules, "expo-notifications"),
  "expo-device": path.resolve(appNodeModules, "expo-device"),
  "@react-native-community/datetimepicker": path.resolve(
    appNodeModules,
    "@react-native-community/datetimepicker"
  ),
  "@shopify/react-native-skia": path.resolve(
    appNodeModules,
    "@shopify/react-native-skia"
  ),
  "expo-linear-gradient": path.resolve(
    appNodeModules,
    "expo-linear-gradient"
  ),
  xlsx: path.resolve(appNodeModules, "xlsx"),
  "expo-file-system": path.resolve(appNodeModules, "expo-file-system"),
  "expo-sharing": path.resolve(appNodeModules, "expo-sharing"),
  // Version-gating feature (May 2026): native version reads via expo-application,
  // semver comparison via the `semver` package. Both used by lib/version-check.ts.
  "expo-application": path.resolve(appNodeModules, "expo-application"),
  semver: path.resolve(appNodeModules, "semver"),
};

// 4. CRITICAL: Remove duplicate singleton packages that pnpm auto-installs
//    as peer dependencies in packages/*/node_modules.
//
//    Web uses React 19.1.4; mobile MUST stay on Expo's React (19.1.0) for RN 0.81 — bumping React breaks Hermes
//    ("main has not been registered", "property is not writable"). Clerk needs react-dom@same as react — pin both 19.1.0.
//    pnpm's auto-install-peers resolves the highest available version (19.1.4)
//    for packages/ui's peerDependencies, creating packages/ui/node_modules/react
//    as a symlink to .pnpm/react@19.1.4. Metro's hierarchical lookup then finds
//    this WRONG React before reaching nodeModulesPaths/extraNodeModules, causing
//    "Invalid hook call" / "Cannot read property 'useContext' of null" errors.
//
//    Fix: delete these symlinks at Metro startup so hierarchical lookup skips them.
const singletonPkgsToClean = [
  "react",
  "react-dom",
  "react-native",
  "nativewind",
  "react-native-css-interop",
  "@expo/vector-icons",
  "expo-image",
  "react-native-svg",
  "@shopify/react-native-skia",
];

const packagesDir = path.resolve(monorepoRoot, "packages");
const packageNames = ["ui"]; // Add other shared packages here if needed

for (const pkgDir of packageNames) {
  for (const dep of singletonPkgsToClean) {
    const symlinkPath = path.resolve(packagesDir, pkgDir, "node_modules", dep);
    try {
      const stat = fs.lstatSync(symlinkPath);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(symlinkPath);
        console.log(`[metro] Removed duplicate ${dep} from packages/${pkgDir}/node_modules`);
      }
    } catch (error) {
      const err = /** @type {NodeJS.ErrnoException} */ (error);
      if (err?.code !== "ENOENT") {
        console.warn(
          `[metro] Failed to remove ${dep} from packages/${pkgDir}/node_modules`,
          err
        );
      }
    }
  }
}

module.exports = withNativeWind(config, { input: "./global.css" });
