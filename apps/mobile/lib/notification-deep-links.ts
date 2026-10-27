/**
 * Maps web notification deep links to mobile Expo Router paths.
 *
 * Web sends Next.js-style paths (e.g. "/(tabs)/my-tickets", "/event/xyz").
 * Mobile needs Expo Router paths (e.g. "/dashboard", "/event/[id]").
 *
 * When data includes eventId, we prefer it for event/RSVP routes so slug→UUID
 * resolution works (get_event_with_tiers requires UUID).
 *
 * When data includes orgId (organizer-scoped pushes), we forward it on org-admin
 * routes (/organizer-admin, /rsvp-management, /rsvp-detail) so those screens
 * sync MemberRoleContext.selectedOrgId to the org the notification came from.
 *
 * ─── Full routing table ──────────────────────────────────────────────────────
 * Type                  │ Recipient      │ Route
 * ──────────────────────┼────────────────┼─────────────────────────────────────
 * new_rsvp_request      │ Org members    │ /rsvp-detail?eventId=X&orgId=Y
 * auth_expiry_warning   │ Organizer      │ /rsvp-detail?eventId=X&orgId=Y
 * rsvp_pending          │ User           │ /dashboard
 * rsvp_approved         │ User           │ /dashboard
 * rsvp_rejected         │ User           │ /event/[id]
 * event_date_changed    │ Ticket holders │ /event/[id]
 * event_reminder        │ Ticket holders │ /event/[id]
 * (org-admin targeting) │ Org members    │ /organizer-admin?orgId=Y  (via deepLink "/organizer-admin" + orgId)
 * ticket_sold           │ Owner/admin    │ v2 event → Purchases (or the org panel)
 * organization_approved │ Org owner      │ /organizer-admin?orgId=Y (→ v2 panel)
 * organization_rejected │ Org owner      │ — (reason in the text; the org is hidden)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Expo Router route groups (e.g. (tabs)) are invisible in paths, so
 * app/(tabs)/dashboard.tsx is reachable at /dashboard. All resolver outputs
 * below are verified against the file tree in apps/mobile/app/.
 */
import { organizerV2Enabled } from "./v2/flags";

export interface NotificationData {
  deepLink?: string;
  eventId?: string;
  orgId?: string;
  [key: string]: string | undefined;
}

function withOrgId(path: string, orgId: string | undefined): string {
  if (!orgId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}orgId=${encodeURIComponent(orgId)}`;
}

/** Web path → mobile path mapping for generic tab routes */
const TAB_PATH_MAP: Record<string, string> = {
  "/(tabs)/my-tickets": "/dashboard",
  "/(tabs)/rsvp": "/rsvp-management",
  "/(tabs)/events-management": "/events-management",
};

/**
 * Resolve notification payload to a valid mobile route.
 * Returns the path to navigate, or null if no valid route.
 */
export function resolveNotificationDeepLink(
  type: string,
  deepLink: string | undefined,
  data: NotificationData | undefined
): string | null {
  const dataObj = data ?? {};
  const link = deepLink ?? dataObj.deepLink;
  const eventId = dataObj.eventId;
  const orgId = dataObj.orgId;

  // ── Type-specific handlers (run first: can resolve without deepLink) ──────
  // Organizer: new RSVP request
  if (type === "new_rsvp_request") {
    return eventId
      ? withOrgId(`/rsvp-detail?eventId=${encodeURIComponent(eventId)}`, orgId)
      : withOrgId("/rsvp-management", orgId);
  }

  // Organizer: payment authorization expiring
  if (type === "auth_expiry_warning") {
    return eventId
      ? withOrgId(`/rsvp-detail?eventId=${encodeURIComponent(eventId)}`, orgId)
      : withOrgId("/rsvp-management", orgId);
  }

  // Organizer: ticket sold (fase 1b.7) — that event's Purchases in the v2 organizer when the
  // notification says which event and organization; otherwise the organization's panel.
  if (type === "ticket_sold" && organizerV2Enabled()) {
    if (eventId && orgId) return `/v2/organizer/event/${encodeURIComponent(eventId)}?orgId=${encodeURIComponent(orgId)}&tab=purchases`;
    return orgId ? withOrgId("/organizer-admin", orgId) : "/profile";
  }

  // Answer to the organizer request (2026-10-27): approved → that organization's panel.
  // Not approved: the text carries the reason and the organization is no longer listed
  // (the API hides rejected ones), so there is nowhere to go.
  if (type === "organization_approved") return orgId ? withOrgId("/organizer-admin", orgId) : "/profile";
  if (type === "organization_rejected") return null;

  // User: RSVP rejected — send back to event page so they can retry
  if (type === "rsvp_rejected" && eventId) {
    return `/event/${encodeURIComponent(eventId)}`;
  }

  // ── Remaining handlers require a valid link ───────────────────────────────
  if (!link || typeof link !== "string" || !link.startsWith("/")) {
    return null;
  }

  // ── Event routes: prefer UUID from eventId over slug in path ─────────────
  if (link.startsWith("/event/") && eventId) {
    return `/event/${encodeURIComponent(eventId)}`;
  }

  // ── Org-admin deep link: takes the user to Screen 3 for that org ─────────
  // Fail closed when orgId is missing — landing on /organizer-admin without
  // an orgId would fall through to the context's selectedOrgId, which may
  // resolve to a stale or first-membership org (wrong-org silent routing).
  if (link === "/organizer-admin") {
    return orgId ? withOrgId("/organizer-admin", orgId) : "/profile";
  }

  // ── Tab paths: map web format to mobile ──────────────────────────────────
  // Covers: rsvp_pending → /dashboard, rsvp_approved → /dashboard, etc.
  const mapped = TAB_PATH_MAP[link];
  if (mapped) {
    // Org-scoped tab targets (like /(tabs)/rsvp → /rsvp-management) carry orgId forward.
    if (mapped === "/rsvp-management") return withOrgId(mapped, orgId);
    // The v1 events list has no v2 twin: v2 opens the organization's panel (or My organizers).
    if (mapped === "/events-management" && organizerV2Enabled()) return orgId ? withOrgId("/organizer-admin", orgId) : "/profile";
    return mapped;
  }

  // ── Event path without eventId in data ───────────────────────────────────
  // Works when the path already contains a UUID (not a slug).
  if (link.startsWith("/event/")) {
    const segment = link.slice(7).replace(/\/$/, "");
    return segment ? `/event/${encodeURIComponent(segment)}` : null;
  }

  // ── Unknown internal path ─────────────────────────────────────────────────
  return link;
}
