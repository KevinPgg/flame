import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
        pathname: "/**",
      },
      // Local Supabase storage (dev/testing only — `supabase start` serves
      // storage over plain HTTP on 127.0.0.1). Never matches in production
      // since prod image URLs are always https://*.supabase.co.
      ...(process.env.NODE_ENV !== "production"
        ? [
            {
              protocol: "http" as const,
              hostname: "192.168.100.57",
              port: "54321",
              pathname: "/storage/v1/object/**",
            },
            {
              protocol: "http" as const,
              hostname: "localhost",
              port: "54321",
              pathname: "/storage/v1/object/**",
            },
          ]
        : []),
    ],
  },
  async headers() {
    return [
      {
        // Ensure iOS/macOS can validate Universal Links.
        // Without an explicit Content-Type some CDNs serve this as octet-stream,
        // which causes Apple's CDN to reject the AASA silently.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Suppresses source map uploading logs during build
    silent: !process.env.CI,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: process.env.NODE_ENV === "production",

    // Note: tunnelRoute is disabled because it can be incompatible with Next.js Middleware
    // and we are using Clerk middleware. It also bypasses ad-blockers which requires careful security configuration.
    // tunnelRoute: "/monitoring",

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
  }
);
