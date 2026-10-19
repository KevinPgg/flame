import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/v2/organizer/payouts",
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
import PayoutsView from "../../app/v2/organizer/payouts/PayoutsView";
import PayoutsPage from "../../app/v2/organizer/payouts/page";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => {
  ctx.role = "owner";
});
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const READY = { connected: true, chargesEnabled: true, payoutsEnabled: true };
const SUMMARY = {
  connected: true,
  defaultCurrency: "USD",
  schedule: "manual",
  balance: { available: [{ amount: 125_050, currency: "usd" }], pending: [{ amount: 30_000, currency: "usd" }] },
  payouts: [
    { id: "po_1", amount: 50_000, currency: "usd", status: "paid", arrival_date: 1_760_000_000, created: 1_759_900_000, automatic: false },
    { id: "po_2", amount: 20_000, currency: "usd", status: "in_transit", arrival_date: 1_760_400_000, created: 1_760_300_000, automatic: false },
  ],
  bank: { bankName: "Banco Pichincha", last4: "6721", currency: "USD" },
};

function setup(opts: { status?: unknown; statusCode?: number; summary?: unknown; summaryStatus?: number; routes?: Route[]; justConnected?: boolean; language?: "en" | "es" } = {}) {
  const f = mockFetch([
    ...(opts.routes ?? []),
    { match: (u) => u.startsWith("/api/stripe/connect/status"), status: opts.statusCode ?? 200, body: opts.status ?? READY },
    { match: (u) => u.startsWith("/api/organizer/payouts/summary"), status: opts.summaryStatus ?? 200, body: opts.summary ?? SUMMARY },
    { match: (u) => u.startsWith("/api/organizer/data"), body: { events: [], cohost_events: [], owner_cohost_assignments: [] } },
    { match: (u) => u === "/api/stripe/connect/onboard", body: { url: "https://connect.stripe.com/setup/x" } },
  ]);
  const openUrl = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup({ delay: null });
  renderV2(
    <QueryClientProvider client={qc}>
      <PayoutsView organization={org} organizations={[org]} role="owner" justConnected={opts.justConnected} openUrl={openUrl} />
    </QueryClientProvider>,
    opts.language ?? "en"
  );
  return { f, user, openUrl };
}

describe("Payouts v2 — connected", () => {
  it("shows available and soon from Stripe, history with status and arrival, and the bank on file", async () => {
    setup();
    const usd = await screen.findByTestId("balance-USD");
    expect(within(usd).getByText("$1,250.50")).toBeInTheDocument();
    expect(within(usd).getByText("$300.00")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("On its way")).toBeInTheDocument();
    expect(screen.getByText(/Arrived Oct 9, 2025/)).toBeInTheDocument();
    expect(screen.getByText(/Banco Pichincha •• 6721/)).toBeInTheDocument();
  });

  it("request payout: confirms with amount and bank, sends currency and one idempotency key, shows the result", async () => {
    const { f, user } = setup({
      routes: [{ match: (u, i) => u === "/api/organizer/payouts/create" && i?.method === "POST", body: { payout: { id: "po_3", amount: 125_050, currency: "usd" } } }],
    });
    await user.click(await screen.findByRole("button", { name: "Request payout" }));
    expect(screen.getByText("Pay out $1,250.50?")).toBeInTheDocument();
    expect(screen.getByText(/goes to Banco Pichincha •• 6721/)).toBeInTheDocument();
    expect(f.posts().filter((p) => p.url === "/api/organizer/payouts/create")).toHaveLength(0);
    await user.click(screen.getAllByRole("button", { name: "Request payout" }).at(-1)!);
    expect(await screen.findByRole("status")).toHaveTextContent("$1,250.50 requested");
    const post = f.posts().find((p) => p.url === "/api/organizer/payouts/create")!;
    expect(post.body).toMatchObject({ organizationId: "org1", currency: "USD" });
    expect(post.body.clientIdempotencyKey).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("payout already on its way (409) and API reasons (400) are explained", async () => {
    let status = 409;
    const { user } = setup({
      routes: [{ match: (u) => u === "/api/organizer/payouts/create", get status() { return status; }, body: { error: "Minimum payout amount is $1.00" } } as Route],
    });
    await user.click(await screen.findByRole("button", { name: "Request payout" }));
    await user.click(screen.getAllByRole("button", { name: "Request payout" }).at(-1)!);
    expect(await screen.findByRole("alert")).toHaveTextContent("A payout is already on its way");
    status = 400;
    await user.click(screen.getAllByRole("button", { name: "Request payout" })[0]!);
    await user.click(screen.getAllByRole("button", { name: "Request payout" }).at(-1)!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Minimum payout amount is $1.00"));
  });

  it("below the minimum the button is disabled and says why; empty history", async () => {
    setup({ summary: { ...SUMMARY, balance: { available: [{ amount: 50, currency: "usd" }], pending: [] }, payouts: [], bank: null } });
    expect(await screen.findByRole("button", { name: "Request payout" })).toBeDisabled();
    expect(screen.getByText("Minimum payout is $1.00")).toBeInTheDocument();
    expect(screen.getByText(/No payouts yet/)).toBeInTheDocument();
    expect(screen.getByText(/No bank account yet/)).toBeInTheDocument();
  });

  it("Manage in Stripe opens the link the onboarding API returns", async () => {
    const { f, user, openUrl } = setup();
    await user.click(await screen.findByRole("button", { name: "Manage in Stripe" }));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith("https://connect.stripe.com/setup/x"));
    expect(f.posts().find((p) => p.url === "/api/stripe/connect/onboard")!.body).toEqual({ organizationId: "org1" });
  });

  it("Stripe balance can't be loaded → message and retry", async () => {
    setup({ summaryStatus: 502, summary: { error: "x" } });
    expect(await screen.findByText("We couldn’t load your Stripe balance.")).toBeInTheDocument();
  });
});

describe("Payouts v2 — setup", () => {
  it("not connected: pick the country and connect (country sent only when creating the account)", async () => {
    const { f, user, openUrl } = setup({ status: { connected: false, chargesEnabled: false, payoutsEnabled: false } });
    expect(await screen.findByText("Connect Stripe to sell tickets")).toBeInTheDocument();
    const select = screen.getByLabelText("Country of operation") as HTMLSelectElement;
    const other = Array.from(select.options).find((o) => o.value !== select.value)!.value;
    await user.selectOptions(select, other);
    await user.click(screen.getByRole("button", { name: "Connect with Stripe" }));
    await waitFor(() => expect(openUrl).toHaveBeenCalled());
    expect(f.posts().find((p) => p.url === "/api/stripe/connect/onboard")!.body).toEqual({ organizationId: "org1", country: other });
    expect(f.calls.some((c) => c.url.startsWith("/api/organizer/payouts/summary"))).toBe(false);
  });

  it("incomplete: checklist and finish setup; onboarding error is shown", async () => {
    const { user } = setup({
      status: { connected: true, chargesEnabled: true, payoutsEnabled: false },
      routes: [{ match: (u) => u === "/api/stripe/connect/onboard", status: 500, body: { error: "x" } }],
      language: "es",
    });
    expect(await screen.findByText("Termina la configuración de Stripe")).toBeInTheDocument();
    expect(screen.getByText("Aceptar pagos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Terminar configuración" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos abrir Stripe");
  });

  it("back from Stripe: notice", async () => {
    setup({ justConnected: true });
    expect(await screen.findByText(/Stripe is connected/)).toBeInTheDocument();
  });

  it("page: organizers and viewers are sent to the dashboard", async () => {
    ctx.role = "organizer";
    await expect(PayoutsPage({ searchParams: Promise.resolve({ org: "kora" }) })).rejects.toThrow("REDIRECT /v2/organizer?org=kora");
  });
});
