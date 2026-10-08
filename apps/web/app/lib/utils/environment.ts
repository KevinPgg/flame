/**
 * Environment detection utilities
 *
 * Centralized logic for detecting production, preview, and development environments.
 * Uses Vercel's standard VERCEL_ENV variable when available.
 */

/**
 * Check if the current environment is production
 *
 * Uses VERCEL_ENV === 'production' (Vercel's standard) with fallback to
 * NODE_ENV === 'production' for non-Vercel deployments.
 *
 * IMPORTANT: On Vercel, this function relies solely on VERCEL_ENV and does not use NODE_ENV,
 * as Vercel can set NODE_ENV=production on preview deployments, making NODE_ENV unreliable.
 *
 * @returns true if running in production environment
 */
export function isProduction(): boolean {
  // Vercel provides VERCEL_ENV: 'production' | 'preview' | 'development'
  // If VERCEL_ENV is explicitly set, trust it exclusively (even if it's not "production")
  // This prevents false positives when VERCEL_ENV="preview" but NODE_ENV="production"
  if (process.env.VERCEL_ENV !== undefined) {
    return process.env.VERCEL_ENV === "production";
  }

  // Fallback for non-Vercel deployments (when VERCEL_ENV is not set)
  // Only use NODE_ENV when we're not on Vercel
  if (process.env.NODE_ENV === "production") {
    return true;
  }

  return false;
}

/**
 * Check if the current environment is a preview deployment
 *
 * Preview deployments are non-production deployments (e.g., PR previews, branch deployments).
 * Uses Vercel's standard VERCEL_ENV variable for reliable detection.
 *
 * IMPORTANT: On Vercel, this function relies solely on VERCEL_ENV and does not use NODE_ENV,
 * as Vercel can set NODE_ENV=production on preview deployments, making NODE_ENV unreliable.
 *
 * @returns true if running in preview environment
 */
export function isPreviewDeployment(): boolean {
  // Vercel provides VERCEL_ENV: 'preview' for preview deployments
  // This is the canonical and reliable way to detect preview deployments on Vercel
  // We do NOT use NODE_ENV because Vercel can set NODE_ENV=production on preview deployments
  return process.env.VERCEL_ENV === "preview";
}

/**
 * Check if the current environment is development
 *
 * @returns true if running in development environment
 */
export function isDevelopment(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "development"
  );
}
