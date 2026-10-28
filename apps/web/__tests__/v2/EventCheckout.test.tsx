/**
 * Flame 2.0 event page purchase block (web, 2026-10-27): only the tiers on the page; access code
 * from "Have an access code?" in a sheet; promoter + discount in the checkout sheet, and they
 * really reach the purchase (promoter in the hold, discount on /purchase).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch } from "./helpers";

const st = vi.hoisted(() => ({ q: "", tickets: [] as unknown[] }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true, userId: "u1" }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(st.q),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }));
vi.mock("../../app/lib/hooks/useRsvp", () => ({ useRsvpSubmission: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("../../app/lib/hooks/useTicketAvailability", () => ({
  useMultipleTicketAvailability: () => ({ results: [], hasDataChanged: false, isLoading: false }),
}));
vi.mock("../../app/lib/hooks/useUserTickets", () => ({ useUserTickets: () => ({ data: { tickets: st.tickets }, isLoading: false }) }));
vi.mock("../../app/components/modals/RegistrationFormModal", () => ({ default: () => null }));
vi.mock("../../app/components/modals/RsvpPaymentModal", () => ({ default: () => null }));
vi.mock("../../app/components/modals/ConfirmationModal", () => ({ default: () => null }));
import EventDetail from "../../app/components/EventDetail";

// B10 (fase 3.1): the promoter code is checked by the server, /api/promoter-validate (no direct
// Supabase read from the browser). PROMO1 is a promoter of this event.
const PROMOTER = [
  { match: (u: string) => u.startsWith("/api/promoter-validate") && u.includes("code=PROMO1"), body: { valid: true, code: "PROMO1" } },
  { match: (u: string) => u.startsWith("/api/promoter-validate"), body: { valid: false } },
];

vi.setConfig({ testTimeout: 30_000 });

const D = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const EVENT = {
  id: "e1",
  name: "Hush · Red Room",
  slug: "hush",
  description: null,
  city: "Quito",
  venue: "Cantina",
  starts_at: iso(5 * D),
  ends_at: iso(5 * D + 5 * 3600_000),
  image_url: null,
  requires_rsvp: false,
  currency: "USD",
  timezone: "America/Guayaquil",
  organizations: { id: "o1", name: "Hush", slug: "hush-org" },
  ticket_tiers: [
    {
      id: "t1",
      name: "General",
      description: null,
      price_cents: 1500,
      quantity_total: 100,
      quantity_sold: 0,
      quantity_reserved: 0,
      per_user_limit: 6,
      sales_start: null,
      sales_end: null,
      ticket_stages: [],
    },
  ],
};

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderV2(
    <QueryClientProvider client={client}>
      <EventDetail event={EVENT as never} header={<h1>header</h1>} footer={null} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  st.q = "";
  st.tickets = [];
  (window.location as { href: string }).href = "http://localhost:3000/events/hush";
});

describe("event page purchase block, Flame 2.0 (web)", () => {
  it("the page shows only the tiers: no promoter or access-code inputs, no quantity row", () => {
    mockFetch(PROMOTER);
    open();
    expect(screen.getByRole("button", { name: /General/ })).toBeInTheDocument();
    expect(screen.queryByText(/Promoter Code/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/unlock a private ticket/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Subtotal:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Have an access code?" })).toBeInTheDocument();
  });

  it("access code: link → sheet → Unlock checks the code and closes; applied chip with remove", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch([
      ...PROMOTER,
      {
        match: (u) => u.includes("/api/ticket-tiers/unlock"),
        body: { tier: { ...EVENT.ticket_tiers[0], id: "vip", name: "VIP secret", price_cents: 3000 } },
      },
    ]);
    open();
    await user.click(screen.getByRole("button", { name: "Have an access code?" }));
    const sheet = screen.getByRole("dialog", { name: "Access code" });
    await user.type(within(sheet).getByRole("textbox", { name: "Access code" }), "whitevip");
    await user.click(within(sheet).getByRole("button", { name: "Unlock" }));
    expect(f.posts()[0]).toMatchObject({ url: "/api/ticket-tiers/unlock", body: { event_id: "e1", code: "whitevip" } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Access code" })).not.toBeInTheDocument());
    expect(screen.getByText("WHITEVIP")).toBeInTheDocument();
  });

  it("checkout sheet: quantity, promoter (checked) and discount (checked) → the hold carries the promoter, /purchase gets the discount", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch([
      ...PROMOTER,
      { match: (u) => u.includes("/api/purchase/validate-promo-code"), body: { valid: true, promotional_code: { code: "SAVE10" }, discount_amount_cents: 300 } },
      { match: (u) => u.includes("/api/holds/create"), body: { hold_session_id: "h1", ticket_tier: { price_cents: 1500 } } },
    ]);
    open();
    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getByRole("button", { name: "Continue to checkout" }));
    const sheet = screen.getByRole("dialog", { name: "Checkout" });
    expect(within(sheet).getByText("Hush · Red Room")).toBeInTheDocument();
    expect(within(sheet).getByText(/limit 6 per person/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "More tickets" }));
    expect(within(sheet).getByText("2 × General · before fees")).toBeInTheDocument();
    expect(within(sheet).getByText("$30.00")).toBeInTheDocument();

    await user.type(within(sheet).getByRole("textbox", { name: "Promoter code (optional)" }), "nope");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await within(sheet).findByText("That promoter code isn’t valid for this event.")).toBeInTheDocument();
    await user.clear(within(sheet).getByRole("textbox", { name: "Promoter code (optional)" }));
    await user.type(within(sheet).getByRole("textbox", { name: "Promoter code (optional)" }), "promo1");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await within(sheet).findByText("Promoter PROMO1")).toBeInTheDocument();

    await user.type(within(sheet).getByRole("textbox", { name: "Discount code" }), "save10");
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));
    expect(await within(sheet).findByText("SAVE10 · −$3.00")).toBeInTheDocument();
    expect(f.posts().find((c) => c.url.includes("validate-promo-code"))?.body).toEqual({ code: "save10", event_id: "e1", subtotal_cents: 3000 });
    expect(within(sheet).getByText("$27.00")).toBeInTheDocument();
    expect(within(sheet).getByText("We hold your tickets for 30 minutes while you check out.")).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(f.posts().some((c) => c.url === "/api/holds/create")).toBe(true));
    expect(f.posts().find((c) => c.url === "/api/holds/create")?.body).toMatchObject({ ticket_tier_id: "t1", quantity: 2, promoter_code: "PROMO1" });
    await waitFor(() => expect(window.location.href).toBe("/purchase?session=h1&promoter=PROMO1&promo=SAVE10"));
  });

  it("a ?promoter= link arrives already applied in the sheet; an invalid discount says so", async () => {
    st.q = "promoter=promo1";
    const user = userEvent.setup({ delay: null });
    mockFetch([...PROMOTER, { match: (u) => u.includes("validate-promo-code"), status: 404, body: { error: "Invalid promotional code" } }]);
    open();
    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getByRole("button", { name: "Continue to checkout" }));
    const sheet = screen.getByRole("dialog", { name: "Checkout" });
    expect(await within(sheet).findByText("Promoter PROMO1")).toBeInTheDocument();
    await user.type(within(sheet).getByRole("textbox", { name: "Discount code" }), "bad");
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));
    expect(await within(sheet).findByText("Invalid promotional code")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Checkout" })).not.toBeInTheDocument();
  });

  it("picking a tier: the quantity is chosen in the card (no jump) and the bottom bar follows it", async () => {
    const user = userEvent.setup({ delay: null });
    mockFetch(PROMOTER);
    open();
    // nothing picked yet: "From" + Get tickets
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get tickets" })).toBeInTheDocument();
    expect(screen.getByText("On sale · max 6")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /General/ }));
    expect(screen.queryByRole("dialog", { name: "Checkout" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More tickets" }));
    await user.click(screen.getByRole("button", { name: "More tickets" }));
    expect(screen.getByText("3 × General · before fees")).toBeInTheDocument();
    expect(screen.getByText("$45.00")).toBeInTheDocument();
    // the old inline "Continue" under the tiers and the floating pill are gone in v2
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buy Tickets" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to checkout" }));
    expect(within(screen.getByRole("dialog", { name: "Checkout" })).getByText("3 × General · before fees")).toBeInTheDocument();
  });

  it("Get tickets picks the cheapest tier on sale; the card's Checkout button opens the sheet", async () => {
    const user = userEvent.setup({ delay: null });
    mockFetch(PROMOTER);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const vip = { ...EVENT.ticket_tiers[0], id: "t2", name: "VIP", price_cents: 4000 };
    renderV2(
      <QueryClientProvider client={client}>
        <EventDetail event={{ ...EVENT, ticket_tiers: [vip, EVENT.ticket_tiers[0]] } as never} header={<h1>header</h1>} footer={null} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("button", { name: "Checkout" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Get tickets" }));
    expect(screen.getByText("1 × General · before fees")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Checkout" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Checkout" }));
    expect(within(screen.getByRole("dialog", { name: "Checkout" })).getByText("1 × General · before fees")).toBeInTheDocument();
  });

  it("with tickets for this event the bar says You're going · View N tickets", () => {
    st.tickets = [
      { id: "tk1", type: "ticket", status: "issued", created_at: "2026-10-01T00:00:00Z", ticket_tier: { id: "t1", name: "General", event: { ...EVENT, organization: { name: "Hush" } } } },
      { id: "tk2", type: "ticket", status: "issued", created_at: "2026-10-02T00:00:00Z", ticket_tier: { id: "t1", name: "General", event: { ...EVENT, organization: { name: "Hush" } } } },
    ];
    mockFetch(PROMOTER);
    open();
    expect(screen.getByText("You’re going")).toBeInTheDocument();
    expect(screen.getByText("2 tickets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View 2 tickets" })).toHaveAttribute("href", "/account/ticket/tk1");
  });

  it("B2: Continue waits while the promoter code is checked; a failed check says so, offers Retry and doesn't block", async () => {
    st.q = "promoter=promo1";
    const user = userEvent.setup({ delay: null });
    const gate = { release: () => {} };
    let fail = true;
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.startsWith("/api/promoter-validate")) {
          await new Promise<void>((r) => (gate.release = r));
          return fail ? new Response(JSON.stringify({ error: "Validation failed" }), { status: 500 }) : new Response(JSON.stringify({ valid: true, code: "PROMO1" }));
        }
        return new Response(JSON.stringify({ error: "unmocked" }), { status: 599 });
      }),
    );
    open();
    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getByRole("button", { name: "Continue to checkout" }));
    const sheet = screen.getByRole("dialog", { name: "Checkout" });
    // still checking → the sheet's Continue is disabled (no hold can be created without the promoter)
    // (the promoter's Add and the sheet's Continue both show "…" and are disabled)
    const busy = within(sheet).getAllByRole("button", { name: "…" });
    expect(busy).toHaveLength(2);
    busy.forEach((b) => expect(b).toBeDisabled());
    expect(calls.some((u) => u.includes("/api/promoter-validate?event_id=e1&code=PROMO1"))).toBe(true);
    gate.release();
    expect(await within(sheet).findByText(/We couldn’t check the code/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Continue" })).toBeEnabled();
    fail = false;
    await user.click(within(sheet).getByRole("button", { name: "Retry" }));
    gate.release();
    expect(await within(sheet).findByText("Promoter PROMO1")).toBeInTheDocument();
  });

  it("v1 (no header) keeps the inline promoter and access-code inputs", () => {
    mockFetch(PROMOTER);
    const client = new QueryClient();
    renderV2(
      <QueryClientProvider client={client}>
        <EventDetail event={EVENT as never} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/Promoter Code/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/unlock a private ticket/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Have an access code?" })).not.toBeInTheDocument();
  });
});
