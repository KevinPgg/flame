/** Purchases tab (2026-10-23): a bank-transfer order reports how many of its tickets are scanned. */
import { describe, expect, it } from "vitest";
import { transformBankTransferOrders } from "@/app/lib/utils/bank-transfer-data";

const order = (tickets: Array<{ checked_in_at: string | null }>) => ({
  id: "o1",
  user_id: null,
  customer_email: "a@x.com",
  customer_name: "Ana",
  quantity: tickets.length,
  total_amount_cents: 3000,
  created_at: "2026-10-01T10:00:00Z",
  status: "completed",
  payment_provider: "bank_transfer",
  users: null,
  ticket_tiers: { id: "t", name: "General", price_cents: 1500 },
  tickets: tickets.map((t, i) => ({ id: `tk${i}`, checked_in_at: t.checked_in_at, metadata: null })),
});

describe("transformBankTransferOrders", () => {
  it("counts every scanned ticket of the order, not only the first", () => {
    const [ev] = transformBankTransferOrders([
      { id: "e", bank_transfer_orders: [order([{ checked_in_at: null }, { checked_in_at: "x" }, { checked_in_at: "y" }])] } as never,
    ]);
    const row = (ev as { bank_transfer_orders: Array<{ checked_in_count: number; checked_in_at: string | null }> }).bank_transfer_orders[0]!;
    expect(row.checked_in_count).toBe(2);
    expect(row.checked_in_at).toBeNull(); // first ticket, unchanged for old readers
  });
});
