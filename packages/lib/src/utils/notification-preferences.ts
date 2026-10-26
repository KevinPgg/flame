/**
 * Notification preferences (users.notification_preferences JSON) — one set of rules for the
 * API (GET/PUT /api/me/notification-preferences) and the Settings screens (Flame 2.0, 1b.5b).
 * Missing keys mean "on"; types in NON_DISMISSABLE_NOTIFICATION_TYPES are always on.
 */
import { NON_DISMISSABLE_NOTIFICATION_TYPES, type NotificationType } from "../types/notification";

/** Order shown in Settings; `organizer` ones only for members of an organization. */
export const NOTIFICATION_PREFERENCE_ITEMS: ReadonlyArray<{ type: NotificationType; organizer: boolean }> = [
  { type: "rsvp_pending", organizer: false },
  { type: "rsvp_approved", organizer: false },
  { type: "rsvp_rejected", organizer: false },
  { type: "ticket_received", organizer: false },
  { type: "event_date_changed", organizer: false },
  { type: "event_reminder", organizer: false },
  { type: "new_rsvp_request", organizer: true },
  { type: "ticket_sold", organizer: true },
  { type: "auth_expiry_warning", organizer: true },
];

export type NotificationPreferences = Record<NotificationType, boolean>;

const TYPES = NOTIFICATION_PREFERENCE_ITEMS.map((i) => i.type);

/** Stored JSON (anything) → full preferences: defaults on, non-dismissable forced on. */
export function mergeNotificationPreferences(stored: unknown): NotificationPreferences {
  const raw = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const out = {} as NotificationPreferences;
  for (const type of TYPES) out[type] = NON_DISMISSABLE_NOTIFICATION_TYPES.has(type) ? true : raw[type] !== false;
  return out;
}

/**
 * Body of PUT → the changes to apply, or null if invalid. Only known types with boolean
 * values; turning off a non-dismissable type is ignored (stays on).
 */
export function notificationPreferencesUpdate(body: unknown): Partial<NotificationPreferences> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return null;
  const out: Partial<NotificationPreferences> = {};
  for (const [k, v] of entries) {
    if (!TYPES.includes(k as NotificationType) || typeof v !== "boolean") return null;
    if (NON_DISMISSABLE_NOTIFICATION_TYPES.has(k as NotificationType)) continue;
    out[k as NotificationType] = v;
  }
  return out;
}
