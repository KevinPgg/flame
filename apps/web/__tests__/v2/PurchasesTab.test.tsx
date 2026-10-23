/**
 * Purchases tab (2026-10-23): card sales, bank transfers and free tickets together, with origin,
 * "scanned / quantity" per row and the event total.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import PurchasesTab from "../../app/v2/organizer/event/[id]/tabs/PurchasesTab";
import { renderV2 } from "./helpers";

const event = {
  id: "ev",
  name: "Night",
  currency: "USD",
  timezone: "America/Guayaquil",
  bank_transfer_orders: [
    { id: "b1", email: "bea@x.com", customer_name: "Bea", created_at: "2026-10-02T10:00:00Z", order_quantity: 2, order_total_cents: 2000, checked_in_count: 0, ticket_tiers: { name: "VIP" } },
  ],
  promotional_tickets: [
    { id: "c1", email: "cris@x.com", customer_name: "Cris", created_at: "2026-10-03T10:00:00Z", checked_in_at: "2026-10-04T01:00:00Z", ticket_tiers: { name: "General" } },
  ],
};
const purchases = [
  { id: "p1", userName: "Ana Ruiz", email: "ana@x.com", tierName: "General", stageName: null, quantity: 3, pricePerTicket: 1000, totalPrice: 3450, basePrice: 3000, scanned: true, scannedCount: 2, rsvpStatus: "purchased", createdAt: "2026-10-01T10:00:00Z" },
];

describe("PurchasesTab", () => {
  it("everyone with tickets, origin, scanned per row and total", () => {
    renderV2(<PurchasesTab event={event as never} purchases={purchases as never} slug="kora" />);
    expect(screen.getAllByText("Ana Ruiz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2/3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0/2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1/1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Transfer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sent free").length).toBeGreaterThan(0);
    expect(screen.getByText("3 of 6 tickets scanned")).toBeTruthy();
  });
});
