/**
 * Every link the v2 organizer screens of the app use, in one place (same idea as
 * apps/web/app/v2/lib/routes.ts). Screens not rebuilt yet point to their v1 screen; when a screen
 * moves to v2 only this file changes. v1 screens read the organization from `orgId`.
 */
export type OrgRef = { id: string; slug: string };

const v1 = (path: string, org: OrgRef, extra: Record<string, string> = {}) => {
  const params = new URLSearchParams({ ...extra, orgId: org.id });
  return `${path}?${params.toString()}`;
};

export const routes = {
  // v2
  dashboard: (org: OrgRef) => `/v2/organizer?org=${encodeURIComponent(org.slug)}`,
  event: (eventId: string, org: OrgRef, tab?: string) =>
    `/v2/organizer/event/${encodeURIComponent(eventId)}?org=${encodeURIComponent(org.slug)}${tab ? `&tab=${tab}` : ""}`,
  /** Organization hub (prototype "Manage organization"): team, payouts, settings… */
  manage: (org: OrgRef) => `/v2/organizer/manage?org=${encodeURIComponent(org.slug)}`,
  /** Door scanner by account (members, co-hosts, people added to an event); `eventId` opens it directly. */
  scan: (org: OrgRef, eventId?: string) =>
    `/v2/scanner?org=${encodeURIComponent(org.slug)}${eventId ? `&event=${encodeURIComponent(eventId)}` : ""}`,
  /** RSVP events of the organization, and one event's requests (fase 1b.3). */
  rsvps: (org: OrgRef) => `/v2/organizer/rsvps?org=${encodeURIComponent(org.slug)}`,
  rsvpEvent: (eventId: string, org: OrgRef) =>
    `/v2/organizer/rsvps/${encodeURIComponent(eventId)}?org=${encodeURIComponent(org.slug)}`,
  // v1 until their entrega (1b.4–1b.5)
  editEvent: (eventId: string, org: OrgRef) => v1("/edit-event", org, { id: eventId }),
  /** Tier editor; v1 edits tiers inside "Edit event". */
  tier: (eventId: string, org: OrgRef, _tierId: string) => v1("/edit-event", org, { id: eventId }),
  team: (org: OrgRef) => v1("/org-members", org),
  createEvent: (org: OrgRef) => v1("/create-event", org),
  payouts: (org: OrgRef) => v1("/account", org, { tab: "payouts" }),
  settings: (org: OrgRef) => v1("/account", org, { tab: "organization" }),
  // outside the organizer
  myOrganizers: () => "/profile",
  discover: () => "/discover",
  myTickets: () => "/dashboard",
  account: () => "/settings",
} as const;
