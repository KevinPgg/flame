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
  // still v1
  /** v1 event page: the edit event / tiers form still lives there. */
  eventV1: (eventId: string, slug: string) => `/organizer/event/${eventId}?${q(slug)}`,
  team: (slug: string) => `/organizer/team?${q(slug)}`,
  settings: (slug: string) => `/organizer/settings?${q(slug)}&tab=organization`,
  payouts: (slug: string) => `/organizer/settings?${q(slug)}&tab=payouts`,
  scanner: () => "/qr-scanner",
  attendeeHome: () => "/",
} as const;
