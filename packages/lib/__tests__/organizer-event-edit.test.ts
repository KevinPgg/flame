import { describe, it, expect } from "vitest";
import {
  editFormFromEvent,
  datesLocked,
  changedDates,
  tiersSellingPastEnd,
  validateEditEventForm,
  buildUpdateEventPayload,
  type EditableEvent,
} from "../src";

const NOW = new Date("2026-11-01T17:00:00.000Z"); // 12:00 Guayaquil

const EVENT: EditableEvent = {
  id: "ev1",
  starts_at: "2026-12-01T02:00:00.000Z", // 30 Nov 21:00 local
  ends_at: "2026-12-01T07:00:00.000Z", // 1 Dec 02:00 local
  venue: "Porto",
  city: "Guayaquil",
  description: "Line-up TBA",
  timezone: "America/Guayaquil",
  ticket_tiers: [
    { id: "t1", name: "General", sales_end: "2026-12-01T07:00:00.000Z" },
    { id: "t2", name: "VIP", sales_end: "2026-12-01T03:00:00.000Z" },
    { id: "t3", name: "Libre", sales_end: null },
  ],
};

describe("editFormFromEvent", () => {
  it("shows dates in the event timezone, not the browser's", () => {
    expect(editFormFromEvent(EVENT)).toEqual({
      startsAt: "2026-11-30T21:00",
      endsAt: "2026-12-01T02:00",
      venue: "Porto",
      city: "Guayaquil",
      description: "Line-up TBA",
    });
    expect(editFormFromEvent({ ...EVENT, timezone: "Europe/Madrid" }).startsAt).toBe("2026-12-01T03:00");
  });
  it("tolerates nulls and a missing timezone (Guayaquil default, like the DB)", () => {
    const f = editFormFromEvent({ ...EVENT, venue: null, city: null, description: null, timezone: null });
    expect(f).toMatchObject({ venue: "", city: "", description: "", startsAt: "2026-11-30T21:00" });
  });
});

describe("datesLocked / changedDates / tiersSellingPastEnd", () => {
  it("locks dates when the start is less than 2 hours away or past", () => {
    expect(datesLocked(EVENT, NOW)).toBe(false);
    expect(datesLocked({ starts_at: "2026-11-01T18:59:00.000Z" }, NOW)).toBe(true);
    expect(datesLocked({ starts_at: "2026-10-01T00:00:00.000Z" }, NOW)).toBe(true);
  });
  it("compares instants, so an untouched form is unchanged", () => {
    const f = editFormFromEvent(EVENT);
    expect(changedDates(f, EVENT)).toEqual({ starts: false, ends: false });
    expect(changedDates({ ...f, endsAt: "2026-12-01T03:00" }, EVENT)).toEqual({ starts: false, ends: true });
    // Stored with seconds (e.g. created by another client): the form shows minutes → still unchanged.
    const withSeconds = { ...EVENT, starts_at: "2026-12-01T02:00:42.123Z" };
    expect(changedDates(editFormFromEvent(withSeconds), withSeconds)).toEqual({ starts: false, ends: false });
  });
  it("lists tiers whose sales end after the given end", () => {
    expect(tiersSellingPastEnd(EVENT, "2026-12-01T04:00:00.000Z")).toEqual([{ id: "t1", name: "General" }]);
    expect(tiersSellingPastEnd(EVENT, "2026-12-01T02:30:00.000Z").map((t) => t.name)).toEqual(["General", "VIP"]);
    expect(tiersSellingPastEnd(EVENT, "bad")).toEqual([]);
  });
});

describe("validateEditEventForm", () => {
  const base = editFormFromEvent(EVENT);

  it("an untouched event is valid", () => {
    expect(validateEditEventForm(base, EVENT, NOW)).toEqual({});
  });

  it("venue and city stay required; description ≤ 520", () => {
    expect(validateEditEventForm({ ...base, venue: " ", city: "", description: "x".repeat(521) }, EVENT, NOW)).toEqual({
      venue: "venueRequired",
      city: "cityRequired",
      description: "descriptionTooLong",
    });
  });

  it("dates are not re-validated when untouched — an event starting soon can still fix its venue", () => {
    const soon = { ...EVENT, starts_at: "2026-11-01T18:00:00.000Z", ends_at: "2026-11-01T23:00:00.000Z" };
    const f = { ...editFormFromEvent(soon), venue: "New place" };
    expect(validateEditEventForm(f, soon, NOW)).toEqual({});
  });

  it("moving a date of a locked event is refused (the API would reject it)", () => {
    const soon = { ...EVENT, starts_at: "2026-11-01T18:00:00.000Z", ends_at: "2026-11-01T23:00:00.000Z" };
    const f = { ...editFormFromEvent(soon), endsAt: "2026-11-01T20:00" };
    expect(validateEditEventForm(f, soon, NOW)).toEqual({ startsAt: "datesLocked" });
  });

  it("new dates follow the create rules", () => {
    expect(validateEditEventForm({ ...base, startsAt: "2026-11-01T13:00" }, EVENT, NOW).startsAt).toBe("startTooSoon");
    expect(validateEditEventForm({ ...base, endsAt: "2026-11-30T20:00" }, EVENT, NOW).endsAt).toBe("endBeforeStart");
    expect(validateEditEventForm({ ...base, endsAt: "" }, EVENT, NOW).endsAt).toBe("endRequired");
  });

  it("ending before a tier stops selling is blocked until the tier is fixed", () => {
    expect(validateEditEventForm({ ...base, endsAt: "2026-11-30T23:00" }, EVENT, NOW).endsAt).toBe("tierSalesAfterEnd");
    expect(validateEditEventForm({ ...base, endsAt: "2026-12-01T05:00" }, EVENT, NOW)).toEqual({});
  });
});

describe("buildUpdateEventPayload", () => {
  const base = editFormFromEvent(EVENT);

  it("nothing changed → only the id", () => {
    expect(buildUpdateEventPayload(base, EVENT)).toEqual({ payload: { id: "ev1" }, datesChanged: false, changed: false });
  });

  it("sends only the fields that changed, trimmed; empty description clears it", () => {
    const r = buildUpdateEventPayload({ ...base, venue: " Luna Rooftop ", description: "" }, EVENT);
    expect(r).toEqual({ payload: { id: "ev1", venue: "Luna Rooftop", description: "" }, datesChanged: false, changed: true });
  });

  it("moving one date sends both (in UTC from the event timezone) and flags the notification", () => {
    const r = buildUpdateEventPayload({ ...base, endsAt: "2026-12-01T04:00" }, EVENT);
    expect(r.payload).toEqual({ id: "ev1", starts_at: "2026-12-01T02:00:00.000Z", ends_at: "2026-12-01T09:00:00.000Z" });
    expect(r.datesChanged).toBe(true);
  });

  it("flyer: undefined keeps it, '' removes it, a URL replaces it", () => {
    expect(buildUpdateEventPayload(base, EVENT).payload.image_url).toBeUndefined();
    expect(buildUpdateEventPayload(base, EVENT, "").payload).toEqual({ id: "ev1", image_url: "" });
    expect(buildUpdateEventPayload(base, EVENT, "https://cdn/x.jpg")).toMatchObject({ changed: true, payload: { image_url: "https://cdn/x.jpg" } });
  });
});
