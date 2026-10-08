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
  | "auth_expiry_warning";

/** Notification types that cannot be disabled by the user in preferences. */
export const NON_DISMISSABLE_NOTIFICATION_TYPES: ReadonlySet<NotificationType> =
  new Set(["ticket_received"]);
