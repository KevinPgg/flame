/**
 * Get the base URL for the application based on environment
 * This ensures consistent URL generation across the app
 */
export function getBaseUrl(): string {
  console.log("🔍 getBaseUrl() called");
  console.log("  - NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL);
  console.log("  - NEXT_PUBLIC_SITE_URL:", process.env.NEXT_PUBLIC_SITE_URL);
  console.log("  - NODE_ENV:", process.env.NODE_ENV);
  console.log("  - VERCEL_ENV:", process.env.VERCEL_ENV);

  let baseUrl: string;

  // If NEXT_PUBLIC_APP_URL is set, use it (highest priority)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    console.log(
      "  ✅ Using NEXT_PUBLIC_APP_URL:",
      process.env.NEXT_PUBLIC_APP_URL
    );
    baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  }
  // Legacy support for NEXT_PUBLIC_SITE_URL
  else if (process.env.NEXT_PUBLIC_SITE_URL) {
    console.log(
      "  ✅ Using NEXT_PUBLIC_SITE_URL:",
      process.env.NEXT_PUBLIC_SITE_URL
    );
    baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  }
  // Auto-detect based on environment
  else if (process.env.NODE_ENV === "development") {
    console.log("  ✅ Using localhost (development mode)");
    baseUrl = "http://localhost:3000";
  }
  // Try VERCEL_URL for automatic Vercel deployments
  else if (process.env.VERCEL_URL) {
    console.log("  ✅ Using VERCEL_URL:", process.env.VERCEL_URL);
    baseUrl = `https://${process.env.VERCEL_URL}`;
  }
  // Fallback to localhost with warning (prevents production crashes)
  else {
    console.warn(
      "  ⚠️  WARNING: No base URL configured! Falling back to localhost. Set NEXT_PUBLIC_APP_URL for production."
    );
    baseUrl = "http://localhost:3000";
  }

  // Remove all trailing slashes to ensure consistent URL construction
  const normalizedUrl = baseUrl.replace(/\/+$/, "");
  
  console.log("  🔧 Normalized URL (trailing slashes removed):", normalizedUrl);

  return normalizedUrl;
}
