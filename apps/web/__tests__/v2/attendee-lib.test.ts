/** Fase 2.1: where notifications open on the web, and which public URLs show v2. */
import { describe, it, expect } from "vitest";
import { notificationWebHref } from "../../app/lib/notifications/web-link";
import { attendeeV2Route } from "../../app/lib/utils/attendee-v2-rewrite";

describe("notificationWebHref", () => {
  const org = { org: "kora", event: null };
  it("organizer notifications open the v2 organizer screens", () => {
    expect(notificationWebHref("ticket_sold", { eventId: "e1", orgId: "o1" }, org)).toBe("/v2/organizer/event/e1?org=kora&tab=purchases");
    expect(notificationWebHref("ticket_sold", { orgId: "o1" }, org)).toBe("/v2/organizer?org=kora");
    expect(notificationWebHref("new_rsvp_request", { eventId: "e1" }, org)).toBe("/v2/organizer/rsvps/e1?org=kora");
    expect(notificationWebHref("auth_expiry_warning", {}, org)).toBe("/v2/organizer/rsvps?org=kora");
    expect(notificationWebHref("organization_approved", { orgId: "o1" }, org)).toBe("/v2/organizer?org=kora");
  });
  it("without the organization's slug an organizer link can't be built", () => {
    expect(notificationWebHref("ticket_sold", { eventId: "e1" }, {})).toBeNull();
  });
  it("attendee notifications open My tickets or the event", () => {
    expect(notificationWebHref("rsvp_approved", {}, {})).toBe("/account");
    expect(notificationWebHref("ticket_received", null, {})).toBe("/account");
    expect(notificationWebHref("event_reminder", { eventId: "e1" }, { event: "luna fest" })).toBe("/events/luna%20fest");
    expect(notificationWebHref("event_date_changed", { eventId: "e1" }, {})).toBe("/account");
  });
  it("a rejection and unknown types open nothing", () => {
    expect(notificationWebHref("organization_rejected", { orgId: "o1" }, org)).toBeNull();
    expect(notificationWebHref("whatever", {}, {})).toBeNull();
  });
});

describe("attendeeV2Route", () => {
  it("rewrites the public paths that have a v2 screen (same URL in the browser)", () => {
    expect(attendeeV2Route("/notifications", false)).toEqual({ rewrite: "/v2/attendee/notifications" });
    expect(attendeeV2Route("/notifications/", false)).toEqual({ rewrite: "/v2/attendee/notifications" });
  });
  it("Home (2.2) is served by v2 at /", () => {
    expect(attendeeV2Route("/", false)).toEqual({ rewrite: "/v2/attendee/home" });
    expect(attendeeV2Route("/", true)).toBeNull();
  });
  it("leaves the rest alone (until their delivery adds them)", () => {
    expect(attendeeV2Route("/events/luna", false)).toBeNull();
  });
  it("ATTENDEE_V1: v2-only pages go home, the rest untouched", () => {
    expect(attendeeV2Route("/notifications", true)).toEqual({ redirect: "/" });
    expect(attendeeV2Route("/discover", true)).toBeNull();
  });
});
