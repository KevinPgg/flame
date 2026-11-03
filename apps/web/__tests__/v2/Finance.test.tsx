/** Finance v2 (prototype ow:finance, 2026-11-02): organization totals + table by event. */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/v2/organizer/finance",
  useSearchParams: () => new URLSearchParams("org=kora"),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));
vi.mock("../../app/contexts/MemberRoleContext", () => ({ useMemberRoleContext: () => ({ setSelectedOrgId: vi.fn() }) }));

import FinanceView from "../../app/v2/organizer/finance/FinanceView";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const purchase = (quantity: number, basePrice: number) => ({ id: "p", userName: "A", email: "a@x.com", tierName: "T1", stageName: null, quantity, totalPrice: basePrice + 200, basePrice, scanned: false, createdAt: "2026-10-01T00:00:00Z" });
const ev = (id: string, name: string, starts: string, extra: object = {}) => ({
  id, name, starts_at: starts, ends_at: starts, timezone: "America/Guayaquil", currency: "USD", totalRevenue: 0, totalAttendees: 0, pending_rsvps: 0, ticket_tiers: [], purchases: [], bank_transfer_orders: [], promotional_tickets: [], promoter_links: [], ...extra,
});

function setup(routes: Route[] = []) {
  mockFetch([
    ...routes,
    {
      match: (u) => u.startsWith("/api/organizer/data"),
      body: {
        events: [
          ev("e1", "Salsa Night", "2026-09-10T03:00:00Z", { purchases: [purchase(2, 2000)], promoter_links: [{ id: "l", promoter_code: "x", total_tickets_sold: 2 }] }),
          ev("e2", "Luna", "2026-12-10T03:00:00Z", { purchases: [purchase(1, 1500)] }),
        ],
        cohost_events: [],
        owner_cohost_assignments: [],
      },
    },
    { match: (u) => u.startsWith("/api/organizer/payouts/summary"), body: { connected: true, defaultCurrency: "USD", balance: { available: [{ amount: 9_900, currency: "usd" }], pending: [] } } },
  ]);
  renderV2(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FinanceView organization={org} organizations={[org]} role="owner" />
    </QueryClientProvider>
  );
}

describe("Finance v2", () => {
  it("totals, ready to withdraw and one row per event (newest first) linking to Breakdown", async () => {
    setup();
    expect(await screen.findByText("$35.00")).toBeInTheDocument(); // 20 + 15
    expect(screen.getByText("2 events")).toBeInTheDocument();
    expect(screen.getByText("2 tickets from promoter links")).toBeInTheDocument();
    expect(await screen.findByText("$99.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ready to withdraw/ })).toHaveAttribute("href", "/v2/organizer/payouts?org=kora");
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Luna");
    expect(rows[1]).toHaveTextContent("Salsa Night");
    expect(within(rows[1]).getByRole("link")).toHaveAttribute("href", "/v2/organizer/event/e1?org=kora&tab=breakdown");
  });

  it("Stripe not connected → points to Payouts", async () => {
    setup([{ match: (u) => u.startsWith("/api/organizer/payouts/summary"), body: { connected: false } }]);
    expect(await screen.findByText("Connect Stripe in Payouts")).toBeInTheDocument();
  });

  it("no events → empty state", async () => {
    setup([{ match: (u) => u.startsWith("/api/organizer/data"), body: { events: [], cohost_events: [], owner_cohost_assignments: [] } }]);
    expect(await screen.findByText("No events yet.")).toBeInTheDocument();
  });
});
