import { describe, it, expect } from "vitest";
import { mergeNotificationPreferences, notificationPreferencesUpdate, NOTIFICATION_PREFERENCE_ITEMS } from "../src";

describe("notification preferences", () => {
  it("missing = on; stored false = off; ticket_received always on", () => {
    const p = mergeNotificationPreferences({ ticket_sold: false, ticket_received: false, junk: 1 });
    expect(p.ticket_sold).toBe(false);
    expect(p.ticket_received).toBe(true);
    expect(p.event_reminder).toBe(true);
    expect(Object.keys(p)).toHaveLength(NOTIFICATION_PREFERENCE_ITEMS.length);
    expect(mergeNotificationPreferences(null).rsvp_pending).toBe(true);
  });

  it("update: only known types with booleans; non-dismissable ignored", () => {
    expect(notificationPreferencesUpdate({ ticket_sold: false })).toEqual({ ticket_sold: false });
    expect(notificationPreferencesUpdate({ ticket_received: false })).toEqual({});
    expect(notificationPreferencesUpdate({ nope: true })).toBeNull();
    expect(notificationPreferencesUpdate({ ticket_sold: "no" })).toBeNull();
    expect(notificationPreferencesUpdate({})).toBeNull();
    expect(notificationPreferencesUpdate([])).toBeNull();
  });
});
