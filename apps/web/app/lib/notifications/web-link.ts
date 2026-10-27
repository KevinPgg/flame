/**
 * Where a notification opens on the web (fase 2.1, bell). The app has its own resolver
 * (apps/mobile/lib/notification-deep-links.ts); the web links straight to v2 screens. Organizer
 * screens need the organization's slug and the public event page its slug, so the API looks
 * them up (one query each) and passes them here.
 */
export type NotificationLinkData = Record<string, unknown> | null | undefined;

export function notificationWebHref(
  type: string,
  data: NotificationLinkData,
  slugs: { org?: string | null; event?: string | null },
): string | null {
  const d = data ?? {};
  const eventId = typeof d.eventId === "string" ? d.eventId : null;
  const org = slugs.org ? `org=${encodeURIComponent(slugs.org)}` : null;

  switch (type) {
    case "ticket_sold":
      if (eventId && org) return `/v2/organizer/event/${encodeURIComponent(eventId)}?${org}&tab=purchases`;
      return org ? `/v2/organizer?${org}` : null;
    case "new_rsvp_request":
    case "auth_expiry_warning":
      if (eventId && org) return `/v2/organizer/rsvps/${encodeURIComponent(eventId)}?${org}`;
      return org ? `/v2/organizer/rsvps?${org}` : null;
    case "organization_approved":
      return org ? `/v2/organizer?${org}` : "/v2/organizer";
    case "organization_rejected":
      return null; // the text carries the reason; the organization is no longer listed
    case "rsvp_pending":
    case "rsvp_approved":
    case "ticket_received":
      return "/account";
    case "rsvp_rejected":
    case "event_date_changed":
    case "event_reminder":
      return slugs.event ? `/events/${encodeURIComponent(slugs.event)}` : "/account";
    default:
      return null;
  }
}
