import { describe, it, expect } from "vitest";
import {
  summarizeEventSales,
  tierStats,
  eventBreakdown,
  salesByTier,
  promoterLeaderboard,
  promoterLinkUrl,
  validatePromoterCode,
  validatePromoCode,
  promoCodeStatus,
  PROMO_DISCOUNT_OPTIONS,
  bankOrderNetCents,
  type PurchaseRow,
  type TierRow,
} from "../src/organizer/event-detail";

const p = (over: Partial<PurchaseRow>): PurchaseRow => ({
  id: Math.random().toString(36),
  userName: "Ana",
  email: "a@x.com",
  tierName: "General",
  stageName: null,
  quantity: 1,
  totalPrice: 2300,
  basePrice: 2000,
  scanned: false,
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});
const tiers: TierRow[] = [
  { id: "t1", name: "General", price_cents: 2000, quantity_total: 100, quantity_sold: 3, quantity_reserved: 2 },
  { id: "t2", name: "VIP", price_cents: 5000, quantity_total: 10, quantity_sold: 10 },
  { id: "t3", name: "Late", price_cents: 3000, quantity_total: 50, quantity_sold: 0, is_manually_sold_out: true },
];
const purchases = [p({ quantity: 2 }), p({}), p({ tierName: "VIP", quantity: 10, totalPrice: 57000, basePrice: 50000 })];

describe("summarizeEventSales (v1 formulas)", () => {
  it("capacity, requested, sold and net revenue", () => {
    expect(summarizeEventSales({ tiers, purchases, pendingRsvps: 4 })).toEqual({
      ticketQuantity: 160,
      requested: 4,
      sold: 13,
      revenueCents: 54000,
    });
  });
});

describe("tierStats", () => {
  it("sold/remaining/revenue per tier and sold-out flags", () => {
    const [g, vip, late] = tierStats(tiers, purchases);
    expect(g).toMatchObject({ sold: 3, total: 100, reserved: 2, remaining: 95, revenueCents: 4000, soldOut: false });
    expect(g.soldRatio).toBeCloseTo(0.03);
    expect(vip).toMatchObject({ remaining: 0, revenueCents: 50000, soldOut: true, soldRatio: 1 });
    expect(late).toMatchObject({ remaining: 50, soldOut: true });
  });
});

describe("eventBreakdown", () => {
  it("splits card, bank transfer and comps", () => {
    const b = eventBreakdown({
      purchases,
      bankTransfers: [{ order_quantity: 3, order_total_cents: 6000 }, { order_quantity: 1, order_total_cents: null }],
      comps: [{}, {}, { quantity: 2 }],
    });
    expect(b.card).toEqual({ orders: 3, tickets: 13, grossCents: 61600, netCents: 54000, feesCents: 7600 });
    expect(b.bankTransfer).toEqual({ orders: 2, tickets: 4, collectedCents: 6000 });
    expect(b.comps).toEqual({ tickets: 4 });
    expect(b.totalTickets).toBe(21);
    expect(b.organizerTotalCents).toBe(60000);
  });
});

describe("salesByTier", () => {
  it("adds card and bank transfer per tier, most tickets first", () => {
    expect(
      salesByTier(purchases, [{ order_quantity: 2, order_total_cents: 4000, ticket_tiers: { name: "General" } }])
    ).toEqual([
      { tierName: "VIP", tickets: 10, netCents: 50000 },
      { tierName: "General", tickets: 5, netCents: 8000 },
    ]);
  });
});

describe("promoters", () => {
  it("leaderboard by tickets, then revenue, then code", () => {
    const out = promoterLeaderboard([
      { id: "1", promoter_code: "BBB", total_tickets_sold: 5, total_revenue_cents: 100 },
      { id: "2", promoter_code: "AAA", total_tickets_sold: 5, total_revenue_cents: 100 },
      { id: "3", promoter_code: "CCC", total_tickets_sold: 9 },
      { id: "4", promoter_code: "DDD", total_tickets_sold: 5, total_revenue_cents: 900 },
    ]);
    expect(out.map((l) => l.promoter_code)).toEqual(["CCC", "DDD", "AAA", "BBB"]);
  });
  it("builds the same link as v1", () => {
    expect(promoterLinkUrl("https://www.flme.co/", "kora-luna", "VALE10")).toBe(
      "https://www.flme.co/events/kora-luna?promoter=VALE10"
    );
  });
});

describe("code validation mirrors the API", () => {
  it("promoter codes: 3–50 alphanumeric, unique", () => {
    expect(validatePromoterCode(" vale10 ", [])).toEqual({ code: "VALE10", error: null });
    expect(validatePromoterCode("ab", []).error).toBe("tooShort");
    expect(validatePromoterCode("a".repeat(51), []).error).toBe("tooLong");
    expect(validatePromoterCode("VALE-10", []).error).toBe("notAlphanumeric");
    expect(validatePromoterCode("vale10", ["VALE10"]).error).toBe("duplicate");
  });
  it("promo codes: max 20", () => {
    expect(validatePromoCode("a".repeat(20), []).error).toBeNull();
    expect(validatePromoCode("a".repeat(21), []).error).toBe("tooLong");
  });
  it("discount options are 5..100 step 5", () => {
    expect(PROMO_DISCOUNT_OPTIONS[0]).toBe(5);
    expect(PROMO_DISCOUNT_OPTIONS.at(-1)).toBe(100);
    expect(PROMO_DISCOUNT_OPTIONS).toHaveLength(20);
  });
  it("promo status", () => {
    expect(promoCodeStatus({ id: "1", code: "X", discount_percentage: 10, usage_limit: 15, usage_count: 15 })).toEqual({
      used: 15, limit: 15, ratio: 1, active: false,
    });
    expect(promoCodeStatus({ id: "1", code: "X", discount_percentage: 10, usage_limit: 4, usage_count: 1 }).active).toBe(true);
  });
});

describe("bank transfer amounts (legacy orders stored the fee inside the total)", () => {
  // 2026-01-15 = Stripe Connect migration: newer orders store the subtotal as-is.
  it("keeps the stored total for orders after the migration", () => {
    expect(bankOrderNetCents({ order_total_cents: 6000, created_at: "2026-03-01T00:00:00Z" })).toBe(6000);
  });
  it("strips the fee from legacy orders, like v1", () => {
    // Value computed by the production helper (getBasePriceFromTicket), not by hand.
    expect(bankOrderNetCents({ order_total_cents: 2563, created_at: "2025-10-01T00:00:00Z" })).toBe(2300);
  });
  it("no total, no date or a bad date → the stored total (never throws)", () => {
    expect(bankOrderNetCents({ order_total_cents: null, created_at: "2025-10-01T00:00:00Z" })).toBe(0);
    expect(bankOrderNetCents({ order_total_cents: 5000 })).toBe(5000);
    expect(bankOrderNetCents({ order_total_cents: 5000, created_at: "not a date" })).toBe(5000);
  });
  it("breakdown and sales by tier use the organizer amount, not the stored legacy total", () => {
    const bank = [
      { order_quantity: 1, order_total_cents: 2563, created_at: "2025-10-01T00:00:00Z", ticket_tiers: { name: "General" } },
      { order_quantity: 2, order_total_cents: 4000, created_at: "2026-05-01T00:00:00Z", ticket_tiers: null },
    ];
    expect(eventBreakdown({ purchases: [], bankTransfers: bank, comps: [] }).bankTransfer.collectedCents).toBe(6300);
    expect(salesByTier([], bank)).toEqual([
      { tierName: "—", tickets: 2, netCents: 4000 },
      { tierName: "General", tickets: 1, netCents: 2300 },
    ]);
  });
});

describe("edge cases", () => {
  it("summary with no pending RSVPs and rows with missing numbers", () => {
    expect(
      summarizeEventSales({
        tiers: [{ id: "x", name: "X", price_cents: 0, quantity_total: 0, quantity_sold: 0 }],
        purchases: [p({ quantity: 0, basePrice: 0 })],
        pendingRsvps: null,
      })
    ).toEqual({ ticketQuantity: 0, requested: 0, sold: 0, revenueCents: 0 });
  });
  it("tier with zero capacity: ratio 0, sold out; null counters read as 0", () => {
    const [s] = tierStats(
      [{ id: "z", name: "Z", price_cents: 0, quantity_total: 0, quantity_sold: null as unknown as number }],
      []
    );
    expect(s).toMatchObject({ sold: 0, total: 0, reserved: 0, remaining: 0, soldRatio: 0, soldOut: true, revenueCents: 0 });
  });
  it("oversold tier caps the ratio at 1 and remaining at 0", () => {
    const [s] = tierStats([{ id: "o", name: "O", price_cents: 0, quantity_total: 10, quantity_sold: 12 }], []);
    expect(s.soldRatio).toBe(1);
    expect(s.remaining).toBe(0);
  });
  it("sales by tier tolerates missing quantities / amounts", () => {
    expect(
      salesByTier([p({ quantity: undefined as unknown as number, basePrice: undefined as unknown as number })], [
        { order_quantity: undefined as unknown as number, order_total_cents: null, ticket_tiers: { name: "General" } },
      ])
    ).toEqual([{ tierName: "General", tickets: 0, netCents: 0 }]);
  });
  it("leaderboard treats missing totals as 0 and does not mutate the input", () => {
    const links = [
      { id: "1", promoter_code: "B" },
      { id: "2", promoter_code: "A", total_tickets_sold: null, total_revenue_cents: 50 },
    ];
    expect(promoterLeaderboard(links).map((l) => l.promoter_code)).toEqual(["A", "B"]);
    expect(links[0].promoter_code).toBe("B");
  });
  it("promoter link encodes the code and works without a trailing slash", () => {
    expect(promoterLinkUrl("http://localhost:3000", "ev", "A B")).toBe("http://localhost:3000/events/ev?promoter=A%20B");
  });
  it("promo status with no limit is not active; negative counters clamp to 0", () => {
    expect(promoCodeStatus({ id: "1", code: "X", discount_percentage: 5, usage_limit: 0, usage_count: 0 })).toEqual({
      used: 0, limit: 0, ratio: 1, active: false,
    });
    expect(promoCodeStatus({ id: "1", code: "X", discount_percentage: 5, usage_limit: -3, usage_count: -1 })).toMatchObject({
      used: 0, limit: 0,
    });
  });
  it("duplicate check ignores case of existing codes", () => {
    expect(validatePromoCode("abc", ["Abc"]).error).toBe("duplicate");
  });
});
