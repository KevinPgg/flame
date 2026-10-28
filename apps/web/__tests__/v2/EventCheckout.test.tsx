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

const st = vi.hoisted(() => ({ q: "", promoters: ["PROMO1"] as string[] }));
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
vi.mock("../../app/lib/hooks/useUserTickets", () => ({ useUserTickets: () => ({ data: { tickets: [] }, isLoading: false }) }));
vi.mock("../../app/lib/supabase/client", () => {
  const q = { code: "" };
  const chain = {
    select: () => chain,
    eq: (col: string, v: string) => {
      if (col === "promoter_code") q.code = v;
      return chain;
    },
    maybeSingle: async () => ({ data: st.promoters.includes(q.code) ? { id: "pl1" } : null, error: null }),
  };
  return { supabase: { from: () => chain } };
});
vi.mock("../../app/components/modals/RegistrationFormModal", () => ({ default: () => null }));
vi.mock("../../app/components/modals/RsvpPaymentModal", () => ({ default: () => null }));
vi.mock("../../app/components/modals/ConfirmationModal", () => ({ default: () => null }));
import EventDetail from "../../app/components/EventDetail";

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
  (window.location as { href: string }).href = "http://localhost:3000/events/hush";
});

describe("event page purchase block, Flame 2.0 (web)", () => {
  it("the page shows only the tiers: no promoter or access-code inputs, no quantity row", () => {
    mockFetch([]);
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
      { match: (u) => u.includes("/api/purchase/validate-promo-code"), body: { valid: true, promotional_code: { code: "SAVE10" }, discount_amount_cents: 300 } },
      { match: (u) => u.includes("/api/holds/create"), body: { hold_session_id: "h1", ticket_tier: { price_cents: 1500 } } },
    ]);
    open();
    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
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
    mockFetch([{ match: (u) => u.includes("validate-promo-code"), status: 404, body: { error: "Invalid promotional code" } }]);
    open();
    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const sheet = screen.getByRole("dialog", { name: "Checkout" });
    expect(await within(sheet).findByText("Promoter PROMO1")).toBeInTheDocument();
    await user.type(within(sheet).getByRole("textbox", { name: "Discount code" }), "bad");
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));
    expect(await within(sheet).findByText("Invalid promotional code")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Checkout" })).not.toBeInTheDocument();
  });

  it("v1 (no header) keeps the inline promoter and access-code inputs", () => {
    mockFetch([]);
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
