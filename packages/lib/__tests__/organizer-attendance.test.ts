import { describe, expect, it } from "vitest";
import { attendance } from "../src/organizer/attendance";

const sale = (id: string, quantity: number, scannedCount: number | undefined, scanned = false, createdAt = "2026-10-01T10:00:00Z") => ({
  id, userName: `Buyer ${id}`, email: `${id}@x.com`, tierName: "General", stageName: null, quantity, basePrice: 1000 * quantity, scanned, scannedCount, createdAt,
});

describe("attendance", () => {
  it("sales, transfers and free tickets in one list, newest first, with scanned / quantity and totals", () => {
    const { rows, totals } = attendance({
      sales: [sale("s1", 3, 2, true, "2026-10-01T10:00:00Z")],
      transfers: [
        {
          id: "b1", email: "b@x.com", customer_name: "Bea", created_at: "2026-10-03T10:00:00Z",
          order_quantity: 2, order_total_cents: 4000, checked_in_count: 1, ticket_tiers: { name: "VIP" }, metadata: { stage_name: "Early" },
        },
      ],
      comps: [
        { id: "c1", email: "c@x.com", customer_name: "Cris", created_at: "2026-10-02T10:00:00Z", checked_in_at: "2026-10-05T01:00:00Z", ticket_tiers: { name: "General" } },
        { id: "c2", email: "C@x.com", customer_name: "Cris", created_at: "2026-10-02T10:00:00Z", checked_in_at: null, ticket_tiers: { name: "General" } },
      ],
    });
    expect(rows.map((r) => [r.origin, r.name, r.scanned, r.quantity, r.amountCents])).toEqual([
      ["transfer", "Bea", 1, 2, 4000],
      ["comp", "Cris", 1, 2, null],
      ["sale", "Buyer s1", 2, 3, 3000],
    ]);
    expect(rows[0]!.stageName).toBe("Early");
    expect(totals).toEqual({ tickets: 7, scanned: 4 });
  });

  it("older API responses: only a boolean (sale) or the first ticket (transfer) → at most 1 scanned", () => {
    const { rows } = attendance({
      sales: [sale("s1", 4, undefined, true)],
      transfers: [{ id: "b1", email: "b@x.com", customer_name: null, created_at: "2026-10-01T10:00:00Z", order_quantity: 3, checked_in_at: "x" }],
      comps: [],
    });
    expect(rows.map((r) => r.scanned)).toEqual([1, 1]);
    expect(rows.find((r) => r.origin === "transfer")!.name).toBe("b@x.com");
  });

  it("scanned never exceeds the quantity", () => {
    expect(attendance({ sales: [sale("s1", 1, 5)], transfers: [], comps: [] }).rows[0]!.scanned).toBe(1);
  });
});
