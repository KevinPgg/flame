import { describe, it, expect } from "vitest";
import { parseTicketQr, scanResultKind, scanErrorKind, scannerEventList, isHappeningNow } from "../src";

describe("parseTicketQr", () => {
  it("regular ticket", () => {
    expect(parseTicketQr(JSON.stringify({ orderId: "o1", eventId: "e1", ticketNumber: 2, tierName: "VIP" }))).toEqual({ orderId: "o1", eventId: "e1", ticketNumber: 2, tierName: "VIP" });
    expect(parseTicketQr(JSON.stringify({ orderId: "o1", eventId: "e1", ticketNumber: "3" }))?.ticketNumber).toBe(3);
  });
  it("promotional ticket", () => {
    expect(parseTicketQr(JSON.stringify({ eventId: "e1", qrToken: "tok" }))).toEqual({ eventId: "e1", qrToken: "tok" });
  });
  it("ignores anything that isn't a Flame ticket", () => {
    for (const bad of ["https://flme.co", "", "null", "42", JSON.stringify({ orderId: "o1" }), JSON.stringify({ eventId: "e1" }), JSON.stringify({ orderId: "o1", eventId: "e1", ticketNumber: 0 }), JSON.stringify({ orderId: "o1", eventId: "e1", ticketNumber: 1.5 })]) {
      expect(parseTicketQr(bad)).toBeNull();
    }
  });
});

describe("scan results", () => {
  it("valid / already / invalid", () => {
    expect(scanResultKind({ id: "t", attendee_name: "A", status: "issued", checked_in_at: null })).toBe("valid");
    expect(scanResultKind({ id: "t", attendee_name: "A", status: "issued", checked_in_at: "2026-10-16T22:00:00Z" })).toBe("already");
    expect(scanResultKind({ id: "t", attendee_name: "A", status: "checked_in", checked_in_at: null })).toBe("already");
    expect(scanResultKind({ id: "t", attendee_name: "A", status: "refunded", checked_in_at: null })).toBe("invalid");
  });
  it("API errors", () => {
    expect(scanErrorKind(404)).toBe("invalid");
    expect(scanErrorKind(400)).toBe("invalid");
    expect(scanErrorKind(409)).toBe("already");
    expect(scanErrorKind(403)).toBe("error");
    expect(scanErrorKind(500)).toBe("error");
  });
});

describe("scanner events", () => {
  const now = new Date("2026-10-16T23:00:00Z");
  const ev = (id: string, start: string, end: string) => ({ id, name: id, starts_at: start, ends_at: end });
  it("upcoming and recent only, soonest first", () => {
    const list = scannerEventList(
      [
        ev("next-week", "2026-10-23T02:00:00Z", "2026-10-23T08:00:00Z"),
        ev("tonight", "2026-10-17T02:00:00Z", "2026-10-17T08:00:00Z"),
        ev("ended-this-morning", "2026-10-16T02:00:00Z", "2026-10-16T12:00:00Z"),
        ev("last-month", "2026-09-16T02:00:00Z", "2026-09-16T08:00:00Z"),
      ],
      now
    );
    expect(list.map((e) => e.id)).toEqual(["ended-this-morning", "tonight", "next-week"]);
  });
  it("happening now = from 3 h before start until the end", () => {
    expect(isHappeningNow(ev("a", "2026-10-17T01:30:00Z", "2026-10-17T08:00:00Z"), now)).toBe(true);
    expect(isHappeningNow(ev("b", "2026-10-17T03:00:00Z", "2026-10-17T08:00:00Z"), now)).toBe(false);
    expect(isHappeningNow(ev("c", "2026-10-16T12:00:00Z", "2026-10-16T22:00:00Z"), now)).toBe(false);
  });
});
