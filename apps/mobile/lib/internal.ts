import * as Updates from "expo-updates";

// Shared constant — single source of truth in packages/lib
export { INTERNAL_ORG_IDS } from "@project-flame/lib";

/**
 * True only in production App Store builds (channel: "production").
 * Use this flag to gate any content that should not be visible to public users.
 *
 * Visible in:
 *   - Metro dev  (__DEV__ = true)
 *   - Dev-client builds  (channel: "development")
 *   - Preview / TestFlight internal builds  (channel: "preview")
 *
 * Hidden in:
 *   - Production App Store builds  (channel: "production")
 */
export const isProductionBuild: boolean =
  !__DEV__ && Updates.channel === "production";
