import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/v2/organizer/manage",
  useSearchParams: () => new URLSearchParams("org=kora"),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));
const ctx = vi.hoisted(() => ({ role: "owner" as string }));
vi.mock("../../app/v2/lib/organizer-context", () => ({
  loadOrganizerContext: vi.fn(async () => ({
    organization: { id: "org1", name: "Kora", slug: "kora", logo_url: null },
    organizations: [],
    role: ctx.role,
    me: null,
  })),
}));
vi.mock("../../app/contexts/MemberRoleContext", () => ({ useMemberRoleContext: () => ({ setSelectedOrgId: vi.fn() }) }));

import ManageView from "../../app/v2/organizer/manage/ManageView";
import ManagePage from "../../app/v2/organizer/manage/page";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => {
  ctx.role = "owner";
});
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };

function setup(routes: Route[] = [], language: "en" | "es" = "en") {
  const f = mockFetch([
    ...routes,
    { match: (u) => u === "/api/organizations/org1/members", body: { members: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] } },
    {
      match: (u) => u.startsWith("/api/organizer/payouts/summary"),
      body: { connected: true, defaultCurrency: "USD", balance: { available: [{ amount: 125_050, currency: "usd" }], pending: [] } },
    },
    { match: (u) => u.startsWith("/api/organizer/data"), body: { events: [], cohost_events: [], owner_cohost_assignments: [] } },
    { match: (u) => u.startsWith("/api/stripe/connect/status"), body: { connected: true, chargesEnabled: true, payoutsEnabled: true } },
  ]);
  renderV2(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ManageView organization={org} organizations={[org]} role="owner" />
    </QueryClientProvider>,
    language
  );
  return f;
}

describe("Manage hub v2", () => {
  it("rows for Team, Payouts and Settings with live summaries", async () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "Manage organization" })).toBeInTheDocument();
    const main = screen.getByRole("main");
    const team = within(main).getByRole("link", { name: /Team/ });
    expect(team).toHaveAttribute("href", "/v2/organizer/team?org=kora");
    expect(await within(team).findByText("3 members")).toBeInTheDocument();
    const payouts = within(main).getByRole("link", { name: /Payouts/ });
    expect(payouts).toHaveAttribute("href", "/v2/organizer/payouts?org=kora");
    expect(await within(payouts).findByText("$1,250.50 available")).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/v2/organizer/settings?org=kora");
  });

  it("Stripe not connected → asks to connect", async () => {
    setup([{ match: (u) => u.startsWith("/api/organizer/payouts/summary"), body: { connected: false } }]);
    expect(await screen.findByText("Connect Stripe to get paid")).toBeInTheDocument();
  });

  it("a failed summary does not break the hub", async () => {
    setup([{ match: (u) => u === "/api/organizations/org1/members", status: 500, body: {} }]);
    expect(await screen.findByText("$1,250.50 available")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Team");
  });

  it("Spanish", async () => {
    setup([], "es");
    expect(screen.getByRole("heading", { level: 1, name: "Gestionar organización" })).toBeInTheDocument();
    expect(await screen.findByText("3 miembros")).toBeInTheDocument();
  });

  it("page: only owner / admin; others go back to events", async () => {
    ctx.role = "organizer";
    await expect(ManagePage({ searchParams: Promise.resolve({ org: "kora" }) })).rejects.toThrow("REDIRECT /v2/organizer?org=kora");
    ctx.role = "admin";
    await expect(ManagePage({ searchParams: Promise.resolve({ org: "kora" }) })).resolves.toBeTruthy();
  });
});
