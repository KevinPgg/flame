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

const st = vi.hoisted(() => ({ q: "", tickets: [] as unknown[], mutate: null as any }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true, userId: "u1" }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(st.q),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }));
vi.mock("../../app/lib/hooks/useRsvp", () => ({ useRsvpSubmission: () => ({ mutate: st.mutate ?? (st.mutate = vi.fn()), isPending: false }) }));
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

  it("tickets (3.3): Continue reserves right away with the quantity and the link's promoter → /purchase (no sheet)", async () => {
    st.q = "promoter=promo1";
    const user = userEvent.setup({ delay: null });
    const f = mockFetch([...PROMOTER, { match: (u: string) => u.includes("/api/holds/create"), body: { hold_session_id: "h1", ticket_tier: { price_cents: 1500 } } }]);
    open();
    // visible on the page before checkout (B10 indicator, 10-28)
    expect(await screen.findByTestId("promoter-chip")).toHaveTextContent("Promoter PROMO1");
    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getByRole("button", { name: "More tickets" }));
    await user.click(screen.getByRole("button", { name: "Continue to checkout" }));
    expect(screen.queryByRole("dialog", { name: "Checkout" })).not.toBeInTheDocument();
    await waitFor(() => expect(f.posts().some((c) => c.url === "/api/holds/create")).toBe(true));
    expect(f.posts().find((c) => c.url === "/api/holds/create")?.body).toMatchObject({ ticket_tier_id: "t1", quantity: 2, promoter_code: "PROMO1" });
    await waitFor(() => expect(window.location.href).toBe("/purchase?session=h1&promoter=PROMO1"));
  });

  it("RSVP (3.4): the request sheet with the link's promoter applied", async () => {
    st.q = "promoter=promo1";
    const user = userEvent.setup({ delay: null });
    mockFetch(PROMOTER);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderV2(
      <QueryClientProvider client={client}>
        <EventDetail event={{ ...EVENT, requires_rsvp: true } as never} header={<h1>header</h1>} footer={null} />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("promoter-chip")).toHaveTextContent("Promoter PROMO1");
    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getAllByRole("button", { name: "Request to join" })[0]!);
    const sheet = screen.getByRole("dialog", { name: "Request to join" });
    expect(within(sheet).getByText("Promoter PROMO1")).toBeInTheDocument();
    expect(within(sheet).getByText(/You won’t be charged now/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Request to join" })).not.toBeInTheDocument();
  });

  it("RSVP by default (Kevin 10-29): the questions once per request, whatever the number of guests", async () => {
    st.mutate = vi.fn();
    const user = userEvent.setup({ delay: null });
    mockFetch(PROMOTER);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const free = { ...EVENT.ticket_tiers[0], price_cents: 0 };
    renderV2(
      <QueryClientProvider client={client}>
        <EventDetail
          event={{ ...EVENT, requires_rsvp: true, ticket_tiers: [free], registration_form_config: [{ id: "name", label: "Full name", type: "text", required: true }] } as never}
          header={<h1>header</h1>}
          footer={null}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getAllByRole("button", { name: "Request to join" })[0]!);
    const sheet = screen.getByRole("dialog", { name: "Request to join" });
    await user.click(within(sheet).getByRole("button", { name: "More tickets" }));
    expect(within(sheet).queryByText("Guest 1 of 2")).not.toBeInTheDocument();
    const names = within(sheet).getAllByLabelText("Full name");
    expect(names).toHaveLength(1);
    await user.type(names[0]!, "Ana");
    await user.click(within(sheet).getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(st.mutate).toHaveBeenCalled());
    expect(st.mutate.mock.calls[0][0]).toMatchObject({ quantity: 2, registration_data: { name: "Ana" } });
    expect(st.mutate.mock.calls[0][0].registration_data._guests).toBeUndefined();
  });

  it("RSVP tier set to 'questions for every ticket': once per guest; required ones checked; guest 1 at the top + _guests", async () => {
    st.mutate = vi.fn();
    const user = userEvent.setup({ delay: null });
    mockFetch(PROMOTER);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const free = { ...EVENT.ticket_tiers[0], price_cents: 0, registration_per_ticket: true };
    renderV2(
      <QueryClientProvider client={client}>
        <EventDetail
          event={{ ...EVENT, requires_rsvp: true, ticket_tiers: [free], registration_form_config: [{ id: "name", label: "Full name", type: "text", required: true }, { id: "ig", label: "Instagram", type: "text", required: false }] } as never}
          header={<h1>header</h1>}
          footer={null}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getAllByRole("button", { name: "Request to join" })[0]!);
    const sheet = screen.getByRole("dialog", { name: "Request to join" });
    expect(within(sheet).getByText("This event is free.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "More tickets" }));
    expect(within(sheet).getByText("Guest 1 of 2")).toBeInTheDocument();
    expect(within(sheet).getByText("Guest 2 of 2")).toBeInTheDocument();
    const names = within(sheet).getAllByLabelText("Full name");
    expect(names).toHaveLength(2);
    await user.type(names[0]!, "Ana");
    await user.click(within(sheet).getByRole("button", { name: "Send request" }));
    expect(within(sheet).getByText("Required")).toBeInTheDocument(); // guest 2's name
    expect(st.mutate).not.toHaveBeenCalled();
    await user.type(names[1]!, "Beto");
    await user.type(within(sheet).getAllByLabelText("Instagram (optional)")[1]!, "@beto");
    await user.click(within(sheet).getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(st.mutate).toHaveBeenCalled());
    expect(st.mutate.mock.calls[0][0]).toMatchObject({ quantity: 2, registration_data: { name: "Ana", _guests: [{ name: "Beto", ig: "@beto" }] } });
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
  });

  it("Get tickets picks the cheapest tier on sale; the card's Checkout button reserves it", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch([...PROMOTER, { match: (u: string) => u.includes("/api/holds/create"), body: { hold_session_id: "h1", ticket_tier: { price_cents: 1500 } } }]);
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
    await waitFor(() => expect(f.posts().find((c) => c.url === "/api/holds/create")?.body).toMatchObject({ ticket_tier_id: "t1", quantity: 1 }));
  });

  it("a reservation of this tier already exists (this or another device): asks before replacing it", async () => {
    const user = userEvent.setup({ delay: null });
    const existing = { id: "old-hold", quantity: 3, expires_at: new Date(Date.now() + 12 * 60_000).toISOString() };
    const f = mockFetch([
      ...PROMOTER,
      {
        match: (u: string, init?: RequestInit) => u.includes("/api/holds/create") && !String(init?.body).includes("replace_existing"),
        status: 409,
        body: { error: "You already have a reservation for this ticket.", code: "HOLD_EXISTS", hold: existing, details: existing },
      },
      { match: (u: string) => u.includes("/api/holds/create"), body: { hold_session_id: "h2", ticket_tier: { price_cents: 1500 } } },
    ]);
    open();
    await user.click(screen.getByRole("button", { name: "Get tickets" }));
    await user.click(screen.getByRole("button", { name: "Checkout" }));
    expect(await screen.findByText(/You already have a reservation of 3 tickets for this tier \(1[12]:\d\d left\)/)).toBeInTheDocument();
    expect(f.posts().filter((c) => c.url === "/api/holds/create")[0]?.body).toMatchObject({ check_existing: true });
    expect(screen.getByRole("button", { name: "Go to my reservation" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Replace reservation" }));
    await waitFor(() => expect(f.posts().filter((c) => c.url === "/api/holds/create")).toHaveLength(2));
    expect(f.posts().filter((c) => c.url === "/api/holds/create")[1]?.body).toMatchObject({ check_existing: true, replace_existing: true });
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

  it("an invalid promoter link says so on the page", async () => {
    st.q = "promoter=nope1";
    mockFetch(PROMOTER);
    open();
    expect(await screen.findByTestId("promoter-chip")).toHaveTextContent("Promoter code NOPE1 isn’t valid for this event");
  });

  it("B2: nothing can be reserved while the promoter code is checked; a failed check says so, offers Retry and doesn't block", async () => {
    st.q = "promoter=promo1";
    const user = userEvent.setup({ delay: null });
    const gate = { release: () => {} };
    let fail = true;
    const posts: Array<{ url: string; body: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/promoter-validate")) {
          await new Promise<void>((r) => (gate.release = r));
          return fail ? new Response(JSON.stringify({ error: "Validation failed" }), { status: 500 }) : new Response(JSON.stringify({ valid: true, code: "PROMO1" }));
        }
        if (url === "/api/holds/create") {
          posts.push({ url, body: JSON.parse(String(init?.body)) });
          return new Response(JSON.stringify({ hold_session_id: "h1", ticket_tier: { price_cents: 1500 } }));
        }
        return new Response(JSON.stringify({ error: "unmocked" }), { status: 599 });
      }),
    );
    open();
    expect(await screen.findByText("Checking promoter code PROMO1…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /General/ }));
    // still checking → both ways to reserve are disabled
    expect(screen.getByRole("button", { name: "Checkout" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue to checkout" })).toBeDisabled();
    gate.release();
    expect(await screen.findByText(/We couldn’t check the code/)).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    gate.release();
    expect(await screen.findByText("Promoter PROMO1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Checkout" }));
    await waitFor(() => expect(posts[0]?.body).toMatchObject({ promoter_code: "PROMO1" }));
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
