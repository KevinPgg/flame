/**
 * Push notification types shared between web and mobile.
 * Used for notification preferences and push dispatch.
 */
export type NotificationType =
  | "rsvp_pending"
  | "rsvp_approved"
  | "rsvp_rejected"
  | "event_date_changed"
  | "event_reminder"
  | "new_rsvp_request"
  | "ticket_sold"
  | "ticket_received"
  | "auth_expiry_warning"
  | "organization_approved"
  | "organization_rejected"
  | "team_invitation"
  // Fase 4.2 (decision of Kevin 2026-11-02): an organization you follow published an event.
  | "followed_org_event";

/** Notification types that cannot be disabled by the user in preferences. */
export const NON_DISMISSABLE_NOTIFICATION_TYPES: ReadonlySet<NotificationType> =
  // Organization review (2026-10-27): the answer to your own request — always delivered.
  // Team invitation (fase 4.5): needs an answer, always delivered.
  new Set(["ticket_received", "organization_approved", "organization_rejected", "team_invitation"]);
