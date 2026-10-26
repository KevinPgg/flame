/** Fase 1b.7: organizer notifications open the v2 screens (directly or through the v1 redirects). */
import { resolveNotificationDeepLink } from "../../lib/notification-deep-links";

describe("organizer notification links", () => {
  it("ticket sold → that event's Purchases (v2)", () => {
    expect(resolveNotificationDeepLink("ticket_sold", "/(tabs)/events-management", { eventId: "ev-1", orgId: "org-1" })).toBe(
      "/v2/organizer/event/ev-1?orgId=org-1&tab=purchases",
    );
  });
  it("old ticket-sold notifications (no event/org) → panel or My organizers, never the v1 list", () => {
    expect(resolveNotificationDeepLink("ticket_sold", "/(tabs)/events-management", { orgId: "org-1" })).toBe("/organizer-admin?orgId=org-1");
    expect(resolveNotificationDeepLink("ticket_sold", "/(tabs)/events-management", {})).toBe("/profile");
    expect(resolveNotificationDeepLink("other", "/(tabs)/events-management", {})).toBe("/profile");
  });
  it("new RSVP request → v1 path that redirects to v2 with the organization", () => {
    expect(resolveNotificationDeepLink("new_rsvp_request", "/(tabs)/rsvp", { eventId: "ev-1", orgId: "org-1" })).toBe("/rsvp-detail?eventId=ev-1&orgId=org-1");
  });
});
