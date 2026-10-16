import { describe, it, expect } from "vitest";
import {
  rsvpStatusKey,
  rsvpTabOf,
  rsvpTabCounts,
  filterRsvps,
  defaultRsvpTab,
  rsvpAmountCents,
  rsvpGuestName,
  rsvpTicketLabel,
  canDecideRsvp,
  approveAllPlan,
  registrationEntries,
  rsvpEventLists,
  type OrganizerRsvp,
} from "../src/organizer/rsvps";

const r = (over: Partial<OrganizerRsvp> = {}): OrganizerRsvp => ({
  id: Math.random().toString(36).slice(2),
  status: "pending",
  requested_quantity: 1,
  requested_at: "2026-10-01T00:00:00Z",
  base_price_cents: 2000,
  users: { first_name: "Ana", last_name: "Loor", email: "ana@x.com" },
  ticket_tiers: { name: "General", price_cents: 2000 },
  ...over,
});

describe("tabs (prototype: Approved includes already paid)", () => {
  const list = ["pending", "pending", "approved", "purchased", "rejected", "expired", "payment_failed"].map((status) => r({ status }));
  it("counts", () => {
    expect(rsvpTabCounts(list)).toEqual({ all: 7, pending: 2, approved: 2, rejected: 1 });
  });
  it("filters", () => {
    expect(filterRsvps(list, "approved").map((x) => x.status)).toEqual(["approved", "purchased"]);
    expect(filterRsvps(list, "all")).toHaveLength(7);
    expect(rsvpTabOf("expired")).toBeNull();
  });
  it("opens on Pending only when something waits", () => {
    expect(defaultRsvpTab(list)).toBe("pending");
    expect(defaultRsvpTab([r({ status: "approved" })])).toBe("all");
    expect(defaultRsvpTab([])).toBe("all");
  });
  it("status keys for labels", () => {
    expect(rsvpStatusKey("auto_cancelled")).toBe("auto_cancelled");
    expect(rsvpStatusKey("weird")).toBe("other");
  });
});

describe("amount = what the organizer receives (v1 rule)", () => {
  it("stored base price (already × quantity, discount applied)", () => {
    expect(rsvpAmountCents(r({ base_price_cents: 3600, requested_quantity: 2 }))).toBe(3600);
    expect(rsvpAmountCents(r({ base_price_cents: 0 }))).toBe(0);
  });
  it("legacy RSVP: stage price, fee removed, × quantity", () => {
    const legacy = r({
      base_price_cents: null,
      stage_price_cents: 2563,
      requested_at: "2025-10-01T00:00:00Z",
      requested_quantity: 2,
    });
    expect(rsvpAmountCents(legacy)).toBe(2300 * 2);
  });
  it("legacy without stage uses the tier price; post-migration prices are kept", () => {
    expect(rsvpAmountCents(r({ base_price_cents: null, requested_at: "2026-03-01T00:00:00Z", ticket_tiers: { name: "G", price_cents: 1500 } }))).toBe(1500);
  });
  it("a bad date never crashes the list", () => {
    expect(rsvpAmountCents(r({ base_price_cents: null, requested_at: "nope", requested_quantity: 3 }))).toBe(6000);
  });
});

describe("labels", () => {
  it("guest name falls back to email", () => {
    expect(rsvpGuestName({ first_name: "Ana", last_name: null, email: "a@x.com" })).toBe("Ana");
    expect(rsvpGuestName({ first_name: " ", last_name: "", email: "a@x.com" })).toBe("a@x.com");
  });
  it("ticket label with stage", () => {
    expect(rsvpTicketLabel(r({ stage_name: "Early" }))).toBe("General · Early");
    expect(rsvpTicketLabel(r())).toBe("General");
  });
});

describe("who can be decided", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it("pending of an event that hasn't ended", () => {
    expect(canDecideRsvp(r(), "2026-10-20T00:00:00Z", now)).toBe(true);
    expect(canDecideRsvp(r(), "2026-10-14T00:00:00Z", now)).toBe(false);
    expect(canDecideRsvp(r({ status: "approved" }), "2026-10-20T00:00:00Z", now)).toBe(false);
  });
});

describe("approve all", () => {
  it("only pending; total to the organizer; how many are paid", () => {
    const plan = approveAllPlan([r({ base_price_cents: 2000 }), r({ base_price_cents: 0 }), r({ status: "approved" })]);
    expect(plan).toMatchObject({ count: 2, totalCents: 2000, paidCount: 1 });
  });
});

describe("registration entries", () => {
  const config = [
    { id: "ig", label: "Instagram", type: "text", required: true },
    { id: "adult", label: "Over 18?", type: "checkbox" },
    { id: "old", label: "Old question", type: "text", archived: true },
  ];
  it("form order and labels, checkbox as yes/no, missing answers", () => {
    expect(registrationEntries(config, { ig: "@ana", adult: false })).toEqual({
      fromConfig: true,
      entries: [
        { key: "ig", label: "Instagram", required: true, archived: false, value: { kind: "text", text: "@ana" } },
        { key: "adult", label: "Over 18?", required: false, archived: false, value: { kind: "bool", value: false } },
        { key: "old", label: "Old question", required: false, archived: true, value: { kind: "missing" } },
      ],
    });
  });
  it("without a form: raw keys", () => {
    expect(registrationEntries(null, { a: 1, b: true, c: "" }).entries.map((e) => [e.label, e.value.kind])).toEqual([
      ["a", "text"],
      ["b", "bool"],
      ["c", "missing"],
    ]);
    expect(registrationEntries([], null)).toEqual({ fromConfig: false, entries: [] });
  });
});

describe("RSVP event lists", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const ev = (id: string, starts: string, rsvp = true, name = `Ev ${id}`) => ({
    id,
    name,
    starts_at: starts,
    ends_at: new Date(new Date(starts).getTime() + 6 * 3600_000).toISOString(),
    requires_rsvp: rsvp,
  });
  const events = [
    ev("a", "2026-10-30T02:00:00Z"),
    ev("b", "2026-10-20T02:00:00Z", true, "Fiésta"),
    ev("c", "2026-09-01T02:00:00Z"),
    ev("d", "2026-10-25T02:00:00Z", false),
  ];
  it("RSVP-only, current soonest first, past apart", () => {
    const { current, past } = rsvpEventLists(events, "", now);
    expect(current.map((e) => e.id)).toEqual(["b", "a"]);
    expect(past.map((e) => e.id)).toEqual(["c"]);
  });
  it("search ignores accents", () => {
    expect(rsvpEventLists(events, "fiesta", now).current.map((e) => e.id)).toEqual(["b"]);
  });
});
