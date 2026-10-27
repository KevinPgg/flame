/** Fase 2.2: Home rules shared by web and app. */
import { describe, it, expect } from "vitest";
import { cityCounts, groupEventsByDay, priceSummary, getLowestPrice, feedWhen, feedDayTitle } from "../src";

const GYE = "America/Guayaquil"; // UTC-5
const ev = (id: string, starts: string, ends: string, extra: Record<string, unknown> = {}) => ({ id, starts_at: starts, ends_at: ends, timezone: GYE, ...extra });
// "now" = Tue 2026-10-27 15:00 in Guayaquil
const NOW = new Date("2026-10-27T20:00:00Z");

describe("groupEventsByDay", () => {
  it("running first, then today, tomorrow and later dates — each in the event's own zone", () => {
    const days = groupEventsByDay(
      [
        ev("later", "2026-10-31T03:00:00Z", "2026-10-31T08:00:00Z"), // Oct 30 22:00 local
        ev("tomorrow", "2026-10-29T02:00:00Z", "2026-10-29T06:00:00Z"), // Oct 28 21:00 local
        ev("tonight", "2026-10-28T03:00:00Z", "2026-10-28T08:00:00Z"), // Oct 27 22:00 local (UTC date is the 28th)
        ev("running", "2026-10-27T18:00:00Z", "2026-10-27T23:00:00Z"),
        ev("over", "2026-10-27T10:00:00Z", "2026-10-27T12:00:00Z"),
      ],
      NOW
    );
    expect(days.map((d) => [d.key, d.when, d.events.map((e) => e.id)])).toEqual([
      ["now", "now", ["running"]],
      ["2026-10-27", "today", ["tonight"]],
      ["2026-10-28", "tomorrow", ["tomorrow"]],
      ["2026-10-30", "later", ["later"]],
    ]);
  });

  it("same day groups together in start order; a bad zone falls back to Guayaquil", () => {
    const days = groupEventsByDay(
      [ev("b", "2026-10-31T04:00:00Z", "2026-10-31T09:00:00Z"), ev("a", "2026-10-31T01:00:00Z", "2026-10-31T05:00:00Z", { timezone: "Nope/Zone" })],
      NOW
    );
    expect(days).toHaveLength(1);
    expect(days[0]!.events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(days[0]!.timezone).toBe(GYE);
  });
});

describe("cityCounts", () => {
  it("cities with events, most first, then by name; empty cities ignored", () => {
    expect(cityCounts([{ city: "Quito" }, { city: "Guayaquil" }, { city: "Quito" }, { city: "Cuenca" }, { city: null }, { city: "" }])).toEqual([
      { city: "Quito", count: 2 },
      { city: "Cuenca", count: 1 },
      { city: "Guayaquil", count: 1 },
    ]);
  });
});

describe("priceSummary", () => {
  const tier = (price_cents: number, extra: Record<string, unknown> = {}) => ({ id: String(price_cents), price_cents, quantity_total: 100, quantity_sold: 0, ...extra });
  it("free, one price, from the lowest", () => {
    expect(priceSummary([tier(0)])).toEqual({ kind: "free" });
    expect(priceSummary([tier(0), tier(1500)])).toEqual({ kind: "free" });
    expect(priceSummary([tier(1500)])).toEqual({ kind: "price", cents: 1500 });
    expect(priceSummary([tier(2500), tier(1500)])).toEqual({ kind: "from", cents: 1500 });
  });
  it("sold out, not on sale yet, no tiers", () => {
    expect(priceSummary([tier(1500, { quantity_sold: 100 })])).toEqual({ kind: "soldOut" });
    expect(priceSummary([tier(1500, { sales_start: "2999-01-01T00:00:00Z" })])).toEqual({ kind: "notYet" });
    expect(priceSummary([])).toBeNull();
  });
  it("the v1 English line is unchanged", () => {
    expect(getLowestPrice([tier(2500), tier(1500)])).toBe("$15.00 - $25.00");
    expect(getLowestPrice([tier(1500, { quantity_sold: 100 })])).toBe("Sold Out");
    expect(getLowestPrice([])).toBeNull();
  });
});

describe("dates", () => {
  it("card line and day heading in the event's zone and the reader's language", () => {
    expect(feedWhen("2026-10-31T03:00:00Z", GYE, "en-US")).toBe("Fri, Oct 30 · 10:00 PM");
    expect(feedDayTitle({ sample: "2026-10-31T03:00:00Z", timezone: GYE }, "en-US")).toBe("Friday, October 30");
    expect(feedDayTitle({ sample: "2026-10-31T03:00:00Z", timezone: GYE }, "es-EC")).toMatch(/viernes, 30 de octubre/);
  });
});
