/**
 * Every link the v2 organizer screens of the app use, in one place (same idea as
 * apps/web/app/v2/lib/routes.ts). Since fase 1b.5 every organizer screen is v2; v1 screens
 * stay only behind EXPO_PUBLIC_ORGANIZER_V1 (they read the organization from `orgId`).
 */
export type OrgRef = { id: string; slug: string };

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
  /** Edit event (fase 1b.4). */
  editEvent: (eventId: string, org: OrgRef) =>
    `/v2/organizer/event/${encodeURIComponent(eventId)}/edit?org=${encodeURIComponent(org.slug)}`,
  /** Tier editor; `tierId` "new" creates one (fase 1b.4). */
  tier: (eventId: string, org: OrgRef, tierId: string) =>
    `/v2/organizer/event/${encodeURIComponent(eventId)}/tiers/${encodeURIComponent(tierId)}?org=${encodeURIComponent(org.slug)}`,
  createEvent: (org: OrgRef) => `/v2/organizer/create?org=${encodeURIComponent(org.slug)}`,
  /** Manage → Team, Payouts, Organization settings (fase 1b.5). */
  team: (org: OrgRef) => `/v2/organizer/team?org=${encodeURIComponent(org.slug)}`,
  payouts: (org: OrgRef) => `/v2/organizer/payouts?org=${encodeURIComponent(org.slug)}`,
  finance: (org: OrgRef) => `/v2/organizer/finance?org=${encodeURIComponent(org.slug)}`,
  settings: (org: OrgRef) => `/v2/organizer/settings?org=${encodeURIComponent(org.slug)}`,
  // outside the organizer
  myOrganizers: () => "/profile",
  discover: () => "/discover",
  myTickets: () => "/dashboard",
  account: () => "/settings",
} as const;
