/**
 * Organizer purchases: characterization of the current per-event calculation (values recorded
 * from the code before batching, 2026-10-15) + the batch version must give the same result,
 * with a fixed number of queries and no 1000-row truncation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "./fake-supabase";
import { orders, ticketStages, rsvps, EV_A, EV_B, TIER_A } from "./purchases-fixture";
import { fetchEventPurchases, fetchEventPurchasesForEvents } from "@/app/lib/utils/purchase-data";

const base = { scanned: false, scannedCount: 0, rsvpStatus: "purchased", createdAt: "2026-05-01T10:00:00Z", registrationData: null };
const EXPECTED_A = [
  { ...base, id: "o-01", userName: "Ana1 Loor", email: "buyer1@x.com", tierName: "General", stageName: null, quantity: 2, pricePerTicket: 2000, totalPrice: 4598, basePrice: 4000 },
  // Legacy order: base price extracted from the historical total, then the discount applied.
  { ...base, id: "o-02", userName: "Luis", email: "buyer2@x.com", tierName: "General", stageName: null, quantity: 1, pricePerTicket: 2000, totalPrice: 2050, basePrice: 1840, createdAt: "2025-10-01T00:00:00Z" },
  { ...base, id: "o-03", userName: "buyer3@x.com", email: "buyer3@x.com", tierName: "VIP", stageName: "Early bird", quantity: 1, pricePerTicket: 4000, totalPrice: 4599, basePrice: 4000, scanned: true, scannedCount: 1, registrationData: { instagram: "@ana" } },
  { ...base, id: "o-04", userName: "Ana1 Loor", email: "buyer1@x.com", tierName: "VIP", stageName: "Regular", quantity: 1, pricePerTicket: 5500, totalPrice: 6324, basePrice: 5500, registrationData: { instagram: "@old" } },
];
const EXPECTED_B = [
  { ...base, id: "o-09", userName: "Ana9 Loor", email: "buyer9@x.com", tierName: "General", stageName: null, quantity: 1, pricePerTicket: 1000, totalPrice: 1150, basePrice: 1000 },
];
const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
const db = (extra: Record<string, unknown[]> = {}, opts = {}) =>
  fakeSupabase({ orders, ticket_stages: ticketStages, rsvps, ...extra } as never, opts) as any;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("fetchEventPurchases (per event) — current behavior", () => {
  it("event with a registration form: net prices, stages, scans, registration answers", async () => {
    expect(byId(await fetchEventPurchases(db(), EV_A, { includeRegistrationData: true }))).toEqual(EXPECTED_A);
  });
  it("without registration data requested, answers are not loaded", async () => {
    const got = await fetchEventPurchases(db(), EV_A);
    expect(got.every((p) => p.registrationData === null)).toBe(true);
  });
  it("other event", async () => {
    expect(await fetchEventPurchases(db(), EV_B)).toEqual(EXPECTED_B);
  });
  it("excludes bank transfers, unpaid orders, NULL provider, and skips invalid rows", async () => {
    const ids = (await fetchEventPurchases(db(), EV_A)).map((p) => p.id);
    for (const id of ["o-05", "o-06", "o-07", "o-08"]) expect(ids).not.toContain(id);
  });
  it("an orders query error gives [] instead of throwing", async () => {
    expect(await fetchEventPurchases(db({}, { failTables: ["orders"] }), EV_A)).toEqual([]);
  });
});

describe("fetchEventPurchasesForEvents (batch)", () => {
  it("same purchases as the per-event version, for every event", async () => {
    const map = await fetchEventPurchasesForEvents(db(), [EV_A, EV_B], { registrationEventIds: [EV_A] });
    expect(byId(map.get(EV_A)!)).toEqual(EXPECTED_A);
    expect(map.get(EV_B)).toEqual(EXPECTED_B);
  });

  it("events without orders get an empty list; duplicate ids are fine", async () => {
    const map = await fetchEventPurchasesForEvents(db(), [EV_B, "no-orders", EV_B]);
    expect(map.get("no-orders")).toEqual([]);
    expect(map.get(EV_B)).toHaveLength(1);
  });

  it("a fixed number of queries, whatever the number of events", async () => {
    const many = Array.from({ length: 40 }, (_, i) => `ev-${i}`);
    const d = db();
    await fetchEventPurchasesForEvents(d, [EV_A, EV_B, ...many], { registrationEventIds: [EV_A] });
    const perTable = d.calls.reduce((acc: Record<string, number>, c: { table: string }) => ((acc[c.table] = (acc[c.table] ?? 0) + 1), acc), {});
    expect(perTable).toEqual({ orders: 1, ticket_stages: 1, rsvps: 1 });
  });

  it("pages past the 1000-row cap (no silent revenue truncation)", async () => {
    const big = Array.from({ length: 2500 }, (_, i) => ({
      ...orders[0],
      id: `big-${String(i).padStart(5, "0")}`,
      event_id: EV_B,
      base_price_cents: 100,
      ticket_tiers: { id: TIER_A, name: "General", price_cents: 100 },
      tickets: [{ id: `big-${i}-t`, checked_in_at: null, metadata: { stage_name: "x" } }],
    }));
    const d = db({ orders: [...orders, ...big] });
    const map = await fetchEventPurchasesForEvents(d, [EV_B]);
    expect(map.get(EV_B)).toHaveLength(2501);
    expect(map.get(EV_B)!.reduce((s, p) => s + p.basePrice, 0)).toBe(2500 * 100 + 1000);
  });

  it("an orders error leaves those events empty and does not throw", async () => {
    const map = await fetchEventPurchasesForEvents(db({}, { failTables: ["orders"] }), [EV_A, EV_B]);
    expect(map.get(EV_A)).toEqual([]);
    expect(map.get(EV_B)).toEqual([]);
  });

  it("a stage lookup error keeps purchases with the metadata stage only", async () => {
    const map = await fetchEventPurchasesForEvents(db({}, { failTables: ["ticket_stages"] }), [EV_A]);
    const got = byId(map.get(EV_A)!);
    expect(got.find((p) => p.id === "o-03")!.stageName).toBe("Early bird");
    expect(got.find((p) => p.id === "o-04")!.stageName).toBeNull();
  });
});
