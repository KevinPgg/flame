/**
 * Internal org IDs that should be hidden from public-facing surfaces in production.
 * These are Flame team organizations used for testing and demos.
 *
 * Hidden from:
 *   - www.flme.co  (VERCEL_ENV = "production")
 *   - App Store builds  (EAS channel = "production")
 *
 * Visible in:
 *   - Local dev (Next.js dev server / Metro / dev-client)
 *   - Vercel preview deployments
 *   - TestFlight internal builds (EAS channel = "preview")
 */
export const INTERNAL_ORG_IDS: string[] = [
  "f21bf79f-30cf-41ec-8ee2-d0e08b4b920b", // FLAME
  "aff4e5f8-8b3c-432a-a317-8c2823db4c76", // MXFT
];
