import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Dynamic Expo config — supplements app.json at build time.
 *
 * EAS projectId: read from EAS_PROJECT_ID env var (set in your .env or EAS build
 * environment). If absent the value is undefined, which causes
 * registerForPushNotificationsAsync() to bail out with a clear warning rather
 * than sending a truthy placeholder to the Expo push service.
 *
 * Usage:
 *   - Local dev:      add EAS_PROJECT_ID=<your-id> to apps/mobile/.env
 *   - EAS builds:     set EAS_PROJECT_ID in eas.json env or EAS Secrets
 *   - After `eas init`: copy the projectId it prints into .env (and .env.example)
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  extra: {
    ...config.extra,
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "75f6c24d-da93-4297-8c2c-6ae0a0fa0f3c", // "5558474d-83a3-41fb-bb90-3c652ce37885",
    },
  },
});
