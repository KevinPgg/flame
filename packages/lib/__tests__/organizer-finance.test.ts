import { describe, it, expect } from "vitest";
import { organizationFinance, type FinanceEvent } from "../src";

const p = (quantity: number, basePrice: number) => ({ id: "p", userName: "", email: "", tierName: "T1", stageName: null, quantity, totalPrice: basePrice + 100, basePrice, scanned: false, createdAt: "" });

describe("organizationFinance", () => {
  const events: FinanceEvent[] = [
    { id: "a", name: "Old", starts_at: "2026-09-01T00:00:00Z", currency: "usd", purchases: [p(2, 2000)], bank_transfer_orders: [{ order_quantity: 1, order_total_cents: 1150, created_at: "2026-08-20T00:00:00Z" }], promotional_tickets: [{ quantity: 5 }], promoter_links: [{ total_tickets_sold: 2 }] },
    { id: "b", name: "New", starts_at: "2026-12-01T00:00:00Z", currency: "USD", purchases: [p(1, 1500)], promoter_links: [{ total_tickets_sold: 1 }, { total_tickets_sold: null }] },
    { id: "c", name: "Madrid", starts_at: "2026-11-01T00:00:00Z", currency: "EUR", purchases: [p(3, 900)] },
  ];

  it("adds up every event like the Breakdown tab (comps are not sold)", () => {
    const f = organizationFinance(events);
    expect(f.events).toBe(3);
    expect(f.sold).toBe(2 + 1 + 1 + 3);
    expect(f.viaPromoters).toBe(3);
    const a = f.rows.find((r) => r.id === "a")!;
    expect(a.sold).toBe(3);
    expect(a.revenueCents).toBeGreaterThan(2000); // card net + bank transfer
  });

  it("revenue per currency, rows newest first", () => {
    const f = organizationFinance(events);
    expect(f.revenue.map((r) => r.currency)).toEqual(["USD", "EUR"]);
    expect(f.revenue[1].cents).toBe(900);
    expect(f.rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("no events → zero in USD", () => {
    expect(organizationFinance([])).toEqual({ events: 0, revenue: [{ currency: "USD", cents: 0 }], sold: 0, viaPromoters: 0, rows: [] });
  });
});
