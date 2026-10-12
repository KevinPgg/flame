import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define protected routes that require authentication.
// NOTE: /organizer/[slug] (public org page) is intentionally NOT matched here
// so that anonymous visitors can view an organization's public profile.
const isPublicOrgRoute = createRouteMatcher(["/organizer-agreement"]);

const isProtectedRoute = createRouteMatcher([
  "/organizer",
  "/organizer/settings(.*)",
  "/organizer/event/(.*)",
  "/organizer/rsvps/(.*)",
  "/organizer/team(.*)",
  "/v2(.*)", // Flame 2.0 screens under construction — signed-in only
  "/scanner(.*)",
  "/api/organizer(.*)",
]);

// Define routes that should be accessible during maintenance mode
const isMaintenanceExempt = createRouteMatcher([
  "/maintenance",
  "/organizer(.*)",
  "/scanner(.*)",
  "/account(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api(.*)",
  "/_next(.*)",
  "/favicon.ico",
  "/file.svg",
  "/vercel.svg",
  "/window.svg",
  // Allow public assets
  "/images/(.*)",
  "/fonts/(.*)",
  // Apple AASA + well-known files (Universal Links, OAuth callbacks)
  "/.well-known/(.*)",
  // OAuth callback for native app redirect
  "/oauth-callback",
]);

export default clerkMiddleware(async (auth, req) => {
  // Check if maintenance mode is enabled
  const maintenanceMode = process.env.MAINTENANCE_MODE === "true";

  if (maintenanceMode) {
    // Check for user testing access cookie
    const hasTestingAccess = req.cookies.get("user_testing_access")?.value === "true";

    // If maintenance mode is on AND user doesn't have testing access
    if (!hasTestingAccess) {
      // If not on an exempt route and not already on maintenance page, redirect
      if (!isMaintenanceExempt(req)) {
        const maintenanceUrl = new URL("/maintenance", req.url);
        return NextResponse.redirect(maintenanceUrl);
      }
    }
  }

  // Protect organizer and scanner routes (except public legal pages)
  if (isProtectedRoute(req) && !isPublicOrgRoute(req)) {
    // For API routes, check auth without redirecting
    if (req.nextUrl.pathname.startsWith("/api/")) {
      const { userId } = await auth();
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      await auth.protect();
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|json)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
