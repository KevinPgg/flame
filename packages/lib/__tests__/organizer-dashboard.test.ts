import { describe, it, expect } from "vitest";
import {
  buildOrganizerEventList,
  revenueByCurrency,
  searchEventsByName,
  splitEventsByTime,
  totalPendingRsvps,
  formatEventDateTime,
  type DashboardEvent,
} from "../src/organizer/dashboard";

const NOW = new Date("2026-10-08T12:00:00Z");
const ev = (id: string, over: Partial<DashboardEvent> = {}): DashboardEvent => ({
  id,
  name: `Event ${id}`,
  starts_at: "2026-10-20T02:00:00Z",
  ends_at: "2026-10-20T08:00:00Z",
  currency: "usd",
  totalRevenue: 1000,
  ...over,
});

describe("buildOrganizerEventList", () => {
  const owned = [ev("a"), ev("b")];
  const cohosted = [{ event: ev("c", { totalRevenue: 99999 }), owner_org_name: "Kora" }];
  const assignments = [
    { event_id: "a", cohost_org_name: "Hush" },
    { event_id: "a", cohost_org_name: "Hush" },
    { event_id: "a", cohost_org_name: "Zulu" },
  ];

  it("full access: owned + co-hosted, deduped", () => {
    const r = buildOrganizerEventList({
      events: owned,
      cohostEvents: [...cohosted, { event: ev("a"), owner_org_name: "Dup" }],
      ownerCohostAssignments: assignments,
    });
    expect(r.owned.map((e) => e.id)).toEqual(["a", "b"]);
    expect(r.all.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(r.cohostPartners).toEqual({ a: ["Hush", "Zulu", "Dup"], c: ["Kora"] });
  });

  it("organizer role: only assigned events, owned and co-hosted", () => {
    const r = buildOrganizerEventList({ events: owned, cohostEvents: cohosted, assignedEventIds: ["b", "c"] });
    expect(r.owned.map((e) => e.id)).toEqual(["b"]);
    expect(r.all.map((e) => e.id)).toEqual(["b", "c"]);
  });

  it("organizer with no assignments sees nothing", () => {
    const r = buildOrganizerEventList({ events: owned, cohostEvents: cohosted, assignedEventIds: [] });
    expect(r.all).toEqual([]);
  });
});

describe("revenueByCurrency", () => {
  it("sums owned revenue per currency, defaulting to USD", () => {
    expect(
      revenueByCurrency([
        ev("a", { currency: "usd", totalRevenue: 1500 }),
        ev("b", { currency: null, totalRevenue: 500 }),
        ev("c", { currency: "eur", totalRevenue: 700 }),
        ev("d", { currency: "USD", totalRevenue: null }),
      ])
    ).toEqual([
      { currency: "USD", cents: 2000 },
      { currency: "EUR", cents: 700 },
    ]);
  });

  it("is empty with no events", () => {
    expect(revenueByCurrency([])).toEqual([]);
  });
});

describe("searchEventsByName", () => {
  const list = [ev("a", { name: "Fiésta Blanca" }), ev("b", { name: "Luna Rooftop" })];
  it("ignores case and accents", () => {
    expect(searchEventsByName(list, "FIESTA").map((e) => e.id)).toEqual(["a"]);
    expect(searchEventsByName(list, "rooftop").map((e) => e.id)).toEqual(["b"]);
  });
  it("blank query returns everything", () => {
    expect(searchEventsByName(list, "  ")).toHaveLength(2);
  });
});

describe("splitEventsByTime", () => {
  it("current = not ended yet (soonest first); past = most recent first", () => {
    const r = splitEventsByTime(
      [
        ev("later", { starts_at: "2026-11-01T00:00:00Z", ends_at: "2026-11-01T06:00:00Z" }),
        ev("live", { starts_at: "2026-10-08T10:00:00Z", ends_at: "2026-10-08T14:00:00Z" }),
        ev("old", { starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-01-01T06:00:00Z" }),
        ev("recent", { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-01T06:00:00Z" }),
      ],
      NOW
    );
    expect(r.current.map((e) => e.id)).toEqual(["live", "later"]);
    expect(r.past.map((e) => e.id)).toEqual(["recent", "old"]);
  });
});

describe("totalPendingRsvps", () => {
  it("adds pending requests", () => {
    expect(totalPendingRsvps([ev("a", { pending_rsvps: 3 }), ev("b"), ev("c", { pending_rsvps: 2 })])).toBe(5);
  });
});

describe("formatEventDateTime", () => {
  // 2026-10-25 03:00 UTC = Sat Oct 24, 22:00 in Guayaquil (UTC-5)
  const iso = "2026-10-25T03:00:00Z";
  it("uses the event timezone, not UTC", () => {
    const en = formatEventDateTime(iso, "America/Guayaquil", "en-US");
    expect(en.date).toBe("Sat, Oct 24");
    expect(en.time).toBe("10:00 PM");
  });
  it("localizes to Spanish", () => {
    const es = formatEventDateTime(iso, "America/Guayaquil", "es-EC");
    expect(es.date.toLowerCase()).toContain("24");
    expect(es.date.toLowerCase()).toContain("oct");
    // es-EC uses a 12-hour clock ("10:00 p. m."), per CLDR.
    expect(es.time).toMatch(/^10:00\s?p/);
  });
  it("falls back to Guayaquil on a bad timezone and to empty strings on a bad date", () => {
    expect(formatEventDateTime(iso, "Not/AZone", "en-US").time).toBe("10:00 PM");
    expect(formatEventDateTime("nope", "America/Guayaquil", "en-US")).toEqual({ date: "", time: "" });
  });
  it("no timezone (null / blank) → Guayaquil", () => {
    expect(formatEventDateTime(iso, null, "en-US").time).toBe("10:00 PM");
    expect(formatEventDateTime(iso, "  ", "en-US").time).toBe("10:00 PM");
  });
});
