/**
 * Attendee web → Flame 2.0 at the SAME public URLs (decision 2026-10-27: no /v2 prefix for the
 * attendee side — search engines and shared links keep working). The middleware *rewrites*
 * (the address bar doesn't change) each public path that already has a v2 screen to it under
 * /v2/attendee. Each fase-2 delivery adds its paths here. Escape hatch: ATTENDEE_V1=true.
 */
const V2_SCREENS: Record<string, string> = {
  "/notifications": "/v2/attendee/notifications", // 2.1 (new: the web had no notifications page)
  "/": "/v2/attendee/home", // 2.2 (public, indexable)
  "/account": "/v2/attendee/tickets", // 2.3 My tickets
  "/discover": "/v2/attendee/explore", // 2.5 Explore (public, indexable)
  "/profile": "/v2/attendee/you", // 2.6 You
  "/purchase": "/v2/attendee/purchase", // 3.3 payment screen (same logic, v2 view)
  "/purchase/success": "/v2/attendee/purchase/success", // 3.3 "You're in" (B5)
};

/** Paths with a parameter: [pattern, target builder]. */
const V2_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/account\/ticket\/([^/]+)$/, (m) => `/v2/attendee/tickets/${m[1]}`], // 2.3 QR ticket
  [/^\/events\/([^/]+)$/, (m) => `/v2/attendee/events/${m[1]}`], // 2.4 event page (public, indexable)
  // 2.4 public organizer profile — not the organizer's own screens that live under /organizer/.
  [/^\/organizer\/(?!(?:settings|team|rsvps|event)$)([^/]+)$/, (m) => `/v2/attendee/organizer/${m[1]}`],
  [/^\/invite\/([A-Za-z0-9_-]{8,100})$/, (m) => `/v2/attendee/invite/${m[1]}`], // 4.5 team invitation link (public)
];

/** Paths that only exist in v2: with ATTENDEE_V1=true they go home instead of a 404. */
const V2_ONLY = new Set(["/notifications"]);

export type AttendeeRoute = { rewrite: string } | { redirect: string } | null;

const clean = (pathname: string) => pathname.replace(/\/+$/, "") || "/";

export function attendeeV2Route(pathname: string, v1: boolean): AttendeeRoute {
  const path = clean(pathname);
  if (v1) return V2_ONLY.has(path) ? { redirect: "/" } : null;
  const target = V2_SCREENS[path];
  if (target) return { rewrite: target };
  for (const [re, to] of V2_PATTERNS) {
    const m = path.match(re);
    if (m) return { rewrite: to(m) };
  }
  return null;
}

/** Public paths whose v2 screen needs a signed-in person (checked before rewriting). */
export const ATTENDEE_SIGNED_IN = new Set(["/notifications", "/account", "/profile", "/purchase", "/purchase/success"]);

export function attendeeNeedsSignIn(pathname: string): boolean {
  const path = clean(pathname);
  return ATTENDEE_SIGNED_IN.has(path) || path.startsWith("/account/");
}
