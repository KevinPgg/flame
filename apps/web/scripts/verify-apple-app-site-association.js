#!/usr/bin/env node
/**
 * Fails the build if apple-app-site-association still contains the placeholder
 * REPLACE_WITH_TEAM_ID. Prevents production deployment with broken Universal Links.
 * Only runs for production (VERCEL_ENV=production); previews and local dev skip.
 * Bypass: SKIP_AASA_VERIFY=1.
 * See MARCH_2026_FIXES.md #189, IOS_MIGRATION.md Section 8.
 */
const fs = require("fs");
const path = require("path");

if (process.env.SKIP_AASA_VERIFY === "1") {
  console.log("[verify-apple-app-site-association] Skipped (SKIP_AASA_VERIFY=1)");
  process.exit(0);
}
if (process.env.VERCEL_ENV !== "production") {
  console.log("[verify-apple-app-site-association] Skipped (preview/local)");
  process.exit(0);
}

const filePath = path.join(
  __dirname,
  "../public/.well-known/apple-app-site-association"
);
const content = fs.readFileSync(filePath, "utf8");

if (content.includes("REPLACE_WITH_TEAM_ID")) {
  console.error(
    "[verify-apple-app-site-association] FAILED: apple-app-site-association still contains REPLACE_WITH_TEAM_ID."
  );
  console.error(
    "Replace it with your 10-character Apple Developer Team ID before deployment."
  );
  console.error("See docs/historico/project-migrations/IOS_MIGRATION.md Section 8.");
  process.exit(1);
}
