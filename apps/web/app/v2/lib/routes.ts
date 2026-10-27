/**
 * Every link the v2 organizer UI uses, in one place.
 * Screens not rebuilt yet point to their v1 page; when a screen moves to v2, only this file changes.
 */
const q = (slug: string) => `org=${encodeURIComponent(slug)}`;

export const routes = {
  // v2
  organizers: () => "/v2/organizer",
  dashboard: (slug: string) => `/v2/organizer?${q(slug)}`,
  event: (eventId: string, slug: string, tab?: string) =>
    `/v2/organizer/event/${eventId}?${q(slug)}${tab ? `&tab=${tab}` : ""}`,
  rsvps: (slug: string) => `/v2/organizer/rsvps?${q(slug)}`,
  rsvpEvent: (eventId: string, slug: string) => `/v2/organizer/rsvps/${eventId}?${q(slug)}`,
  createEvent: (slug: string) => `/v2/organizer/create?${q(slug)}`,
  editEvent: (eventId: string, slug: string) => `/v2/organizer/event/${eventId}/edit?${q(slug)}`,
  /** Tier editor; `tierId` = "new" for a new tier. */
  tier: (eventId: string, slug: string, tierId: string) =>
    `/v2/organizer/event/${eventId}/tiers/${encodeURIComponent(tierId)}?${q(slug)}`,
  /** Organization hub (prototype "Manage organization"): team, payouts, settings. */
  manage: (slug: string) => `/v2/organizer/manage?${q(slug)}`,
  team: (slug: string) => `/v2/organizer/team?${q(slug)}`,
  payouts: (slug: string) => `/v2/organizer/payouts?${q(slug)}`,
  settings: (slug: string) => `/v2/organizer/settings?${q(slug)}`,
  /** The person's one Settings (account, language, notifications…); not tied to an organization. */
  account: () => "/v2/account",
  /** Organizer approvals for Flame support. */
  supportQueue: () => "/v2/support/organizations",
  // attendee side: public URLs (fase 2 rewrites them to v2 screens)
  attendeeHome: () => "/",
  inbox: () => "/notifications",
  discover: () => "/discover",
  myTickets: () => "/account",
  profile: () => "/profile",
} as const;
