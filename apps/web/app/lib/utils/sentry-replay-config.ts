/**
 * Sentry Session Replay Configuration
 *
 * Exported for use in sentry.client.config.ts and testing.
 *
 * SPEC-SENTRY-002: Session Replay Privacy
 * - maskAllText: true - All text is masked in replays
 * - blockAllMedia: true - All media (images, video) is blocked
 */

export const SENTRY_REPLAY_CONFIG = {
  /**
   * Mask all text content in session replays.
   * This ensures no sensitive text (names, emails, etc.) appears in recordings.
   */
  maskAllText: true,

  /**
   * Block all media in session replays.
   * This ensures no images, videos, or other media appears in recordings.
   */
  blockAllMedia: true,
} as const;

