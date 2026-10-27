/** Fase 2.3: My tickets and the QR ticket, shared by web and app. */
import { describe, it, expect } from "vitest";
import { buildWallet, walletWhen, eventTicketSlides, ticketPrice, ticketQr, ticketStage, walletOrganizer, directionsUrl, type UserTicket } from "../src";

const GYE = "America/Guayaquil";
const NOW = new Date("2026-10-27T20:00:00Z"); // Tue 15:00 in Guayaquil

const event = (id: string, starts: string, ends: string) => ({
  id,
  name: `Event ${id}`,
  slug: `ev-${id}`,
  description: "",
  image_url: "",
  starts_at: starts,
  ends_at: ends,
  venue: "Club",
  city: "Quito",
  timezone: GYE,
  currency: "USD",
  organization: { name: `Org ${id}` },
});
const SOON = event("soon", "2026-10-30T03:00:00Z", "2026-10-30T08:00:00Z");
const LATER = event("later", "2026-12-01T03:00:00Z", "2026-12-01T08:00:00Z");
const OLD = event("old", "2026-09-01T03:00:00Z", "2026-09-01T08:00:00Z");
type Ev = ReturnType<typeof event>;

const tk = (id: string, e: Ev, tier: string, created: string, extra: Partial<UserTicket> = {}): UserTicket => ({
  id,
  type: "ticket",
  status: "issued",
  created_at: created,
  qr_code: `https://qr/${id}.png`,
  ticket_tier: { id: `${e.id}-${tier}`, name: tier, price_cents: 1500, event: e },
  order: { id: `o-${id}`, quantity: 1, total_cents: 1749, created_at: created },
  ...extra,
});
const rsvp = (id: string, e: Ev, status: UserTicket["status"], qty = 2, tier = "GA"): UserTicket => ({
  id,
  type: "rsvp",
  status,
  created_at: "2026-10-20T00:00:00Z",
  requested_quantity: qty,
  ticket_tier: { id: `${e.id}-${tier}`, name: tier, price_cents: 0, event: e },
});

describe("buildWallet", () => {
  const rows: UserTicket[] = [
    tk("b", SOON, "VIP", "2026-10-21T00:00:00Z"),
    tk("a", SOON, "GA", "2026-10-20T00:00:00Z"),
    tk("refunded", SOON, "GA", "2026-10-19T00:00:00Z", { status: "refunded" }),
    tk("c", LATER, "GA", "2026-10-22T00:00:00Z", { status: "checked_in" }),
    tk("p", OLD, "GA", "2026-08-01T00:00:00Z", { status: "checked_in" }),
    rsvp("r-pending", LATER, "pending", 3),
    rsvp("r-approved-superseded", SOON, "approved", 1, "GA"),
    rsvp("r-rejected", LATER, "rejected", 1, "VIP"),
    rsvp("r-old", OLD, "pending"),
    rsvp("r-purchased", LATER, "purchased"),
  ];

  it("one card per event with all its door tickets (every tier) in purchase order", () => {
    const w = buildWallet(rows, NOW);
    expect(w.upcoming.map((x) => x.event.id)).toEqual(["soon", "later"]);
    expect(w.upcoming[0]!.tickets.map((t) => t.id)).toEqual(["a", "b"]);
    expect(w.upcoming[0]!.tiers).toEqual(["GA", "VIP"]);
    expect(w.upcoming[1]!.checkedIn).toBe(1);
    expect(w.past.map((x) => x.event.id)).toEqual(["old"]);
  });

  it("requests: upcoming only, approved ones superseded by tickets hidden, purchased ones out", () => {
    const w = buildWallet(rows, NOW);
    expect(w.requests.map((r) => [r.rsvp.id, r.state, r.quantity])).toEqual([
      ["r-pending", "pending", 3],
      ["r-rejected", "rejected", 1],
    ]);
  });

  it("counters as v1: purchased = upcoming tickets, pending = requested quantity", () => {
    expect(buildWallet(rows, NOW).stats).toEqual({ total: 6, purchased: 3, pending: 3 });
    expect(buildWallet([], NOW)).toEqual({ upcoming: [], requests: [], past: [], stats: { total: 0, purchased: 0, pending: 0 } });
  });
});

describe("walletWhen", () => {
  const at = (starts: string) => walletWhen({ starts_at: starts, timezone: GYE }, NOW);
  it("now, today (local), tomorrow, in N days, a date", () => {
    expect(at("2026-10-27T19:00:00Z")).toEqual({ kind: "now" });
    expect(at("2026-10-28T03:00:00Z")).toEqual({ kind: "today" }); // 22:00 local, 28th in UTC
    expect(at("2026-10-29T03:00:00Z")).toEqual({ kind: "tomorrow" });
    expect(at("2026-10-30T03:00:00Z")).toEqual({ kind: "days", days: 2 });
    expect(at("2026-11-04T03:00:00Z")).toEqual({ kind: "days", days: 7 });
    expect(at("2026-11-05T03:00:00Z")).toEqual({ kind: "date" });
  });
});

describe("eventTicketSlides", () => {
  const rows = [tk("b", SOON, "VIP", "2026-10-21T00:00:00Z"), tk("a", SOON, "GA", "2026-10-20T00:00:00Z"), tk("x", LATER, "GA", "2026-10-22T00:00:00Z"), tk("void", SOON, "GA", "2026-10-18T00:00:00Z", { status: "void" })];
  it("all door tickets of the event, opened one located", () => {
    expect(eventTicketSlides(rows, "b")).toEqual({ slides: [rows[1], rows[0]], index: 1 });
  });
  it("a ticket without QR still opens, first; unknown id → null", () => {
    const r = eventTicketSlides(rows, "void")!;
    expect(r.slides.map((t) => t.id)).toEqual(["void", "a", "b"]);
    expect(r.index).toBe(0);
    expect(eventTicketSlides(rows, "nope")).toBeNull();
  });
});

describe("ticket details", () => {
  it("price: courtesy, free, per ticket from the order, tier fallback", () => {
    expect(ticketPrice(tk("p", SOON, "GA", "x", { type: "promotional" }))).toEqual({ kind: "complimentary" });
    expect(ticketPrice(tk("f", SOON, "GA", "x", { order: { id: "o", quantity: 1, total_cents: 0, created_at: "x" } }))).toEqual({ kind: "free" });
    expect(ticketPrice(tk("q", SOON, "GA", "2026-10-20T00:00:00Z", { order: { id: "o", quantity: 2, total_cents: 3001, created_at: "2026-10-20T00:00:00Z" } }))).toEqual({ kind: "amount", cents: 1501 });
    expect(ticketPrice(tk("t", SOON, "GA", "x", { order: undefined }))).toEqual({ kind: "amount", cents: 1500 });
  });

  it("QR: purchased → its image; courtesy → v1 payload with its number within event + tier; none when not valid", () => {
    const promo = (id: string, created: string) =>
      tk(id, SOON, "GA", created, { type: "promotional", qr_code: undefined, qr_token: `tok-${id}`, attendee_email: "ana@x.com", order: undefined });
    const rows = [promo("p2", "2026-10-21T00:00:00Z"), promo("p1", "2026-10-20T00:00:00Z"), tk("a", SOON, "VIP", "2026-10-20T00:00:00Z")];
    expect(ticketQr(rows[2]!, rows)).toEqual({ kind: "image", uri: "https://qr/a.png" });
    const q = ticketQr(rows[1]!, rows);
    expect(q?.kind).toBe("value");
    expect(JSON.parse((q as { value: string }).value)).toEqual({
      orderId: "",
      eventId: "soon",
      userId: "ana@x.com",
      tierName: "GA",
      eventName: "Event soon",
      ticketNumber: 2,
      qrToken: "tok-p1",
      timestamp: "2026-10-20T00:00:00Z",
    });
    expect(ticketQr(tk("r", SOON, "GA", "x", { status: "refunded" }), rows)).toBeNull();
  });

  it("stage, organizer, directions", () => {
    expect(ticketStage(tk("s", SOON, "GA", "x", { metadata: { stage_name: "Early bird" } }))).toBe("Early bird");
    expect(ticketStage(tk("s", SOON, "GA", "x"))).toBeNull();
    expect(walletOrganizer(SOON)).toBe("Org soon");
    expect(walletOrganizer({ ...SOON, organization: undefined, organizations: [{ name: "Multi" }] })).toBe("Multi");
    expect(directionsUrl({ venue: "Club Uno", city: "Quito" })).toBe("https://www.google.com/maps/search/?api=1&query=Club%20Uno%2C%20Quito");
    expect(directionsUrl({ venue: "", city: null })).toBeNull();
  });
});
