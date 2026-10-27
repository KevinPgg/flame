/** Fase 2.1: where notifications open on the web, and which public URLs show v2. */
import { describe, it, expect } from "vitest";
import { notificationWebHref } from "../../app/lib/notifications/web-link";
import { attendeeV2Route, attendeeNeedsSignIn } from "../../app/lib/utils/attendee-v2-rewrite";

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
  it("My tickets and the QR ticket (2.3) at /account and /account/ticket/[id], signed in", () => {
    expect(attendeeV2Route("/account", false)).toEqual({ rewrite: "/v2/attendee/tickets" });
    expect(attendeeV2Route("/account/ticket/abc-123", false)).toEqual({ rewrite: "/v2/attendee/tickets/abc-123" });
    expect(attendeeV2Route("/account/ticket/abc/extra", false)).toBeNull();
    expect(attendeeV2Route("/account/ticket/abc-123", true)).toBeNull();
    expect(attendeeNeedsSignIn("/account")).toBe(true);
    expect(attendeeNeedsSignIn("/account/ticket/x")).toBe(true);
    expect(attendeeNeedsSignIn("/notifications/")).toBe(true);
    expect(attendeeNeedsSignIn("/")).toBe(false);
  });
  it("event page and public organizer profile (2.4); the organizer's own screens stay out", () => {
    expect(attendeeV2Route("/events/luna", false)).toEqual({ rewrite: "/v2/attendee/events/luna" });
    expect(attendeeV2Route("/events/luna", true)).toBeNull();
    expect(attendeeV2Route("/organizer/club-uno", false)).toEqual({ rewrite: "/v2/attendee/organizer/club-uno" });
    for (const own of ["/organizer", "/organizer/settings", "/organizer/team", "/organizer/rsvps", "/organizer/event", "/organizer/event/abc", "/organizer/rsvps/abc"]) {
      expect(attendeeV2Route(own, false)).toBeNull();
    }
    expect(attendeeNeedsSignIn("/events/luna")).toBe(false);
    expect(attendeeNeedsSignIn("/organizer/club-uno")).toBe(false);
  });
  it("leaves the rest alone (until their delivery adds them)", () => {
    expect(attendeeV2Route("/events/luna/extra", false)).toBeNull();
  });
  it("ATTENDEE_V1: v2-only pages go home, the rest untouched", () => {
    expect(attendeeV2Route("/notifications", true)).toEqual({ redirect: "/" });
    expect(attendeeV2Route("/discover", true)).toBeNull();
    expect(attendeeV2Route("/discover", false)).toEqual({ rewrite: "/v2/attendee/explore" });
    expect(attendeeV2Route("/profile", false)).toEqual({ rewrite: "/v2/attendee/you" });
    expect(attendeeNeedsSignIn("/profile")).toBe(true);
    expect(attendeeNeedsSignIn("/discover")).toBe(false);
  });
});
