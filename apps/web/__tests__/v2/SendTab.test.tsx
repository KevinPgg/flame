import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SendTab from "../../app/v2/organizer/event/[id]/tabs/SendTab";
import { renderV2, mockFetch, type Route } from "./helpers";

const event = {
  id: "ev1",
  name: "Biblos",
  currency: "USD",
  timezone: "America/Guayaquil",
  ticket_tiers: [
    { id: "ga", name: "General", price_cents: 2000, quantity_total: 300, quantity_sold: 180, quantity_reserved: 12 },
    {
      id: "vip",
      name: "VIP",
      price_cents: 5000,
      quantity_total: 80,
      quantity_sold: 30,
      ticket_stages: [
        { id: "s1", name: "Early bird", price_cents: 4000, quantity: 30, sold_quantity: 30, order_index: 0 },
        { id: "s2", name: "Regular", price_cents: 5500, quantity: 50, sold_quantity: 0, order_index: 1 },
      ],
    },
    { id: "tb", name: "Table x6", price_cents: 30000, quantity_total: 10, quantity_sold: 8, is_manually_sold_out: true },
  ],
  promotional_tickets: [1, 2, 3].map((i) => ({
    id: `c${i}`,
    email: "camila@x.com",
    customer_name: "Camila Loor",
    created_at: "2026-10-12T21:10:05.120Z",
    ticket_tiers: { name: "General" },
  })),
  bank_transfer_orders: [
    {
      id: "b1",
      email: "gaby@x.com",
      customer_name: "Gabriela Mora",
      created_at: "2026-10-10T18:00:00Z",
      order_quantity: 2,
      order_total_cents: 11000,
      ticket_tiers: { name: "VIP" },
      metadata: { stage_name: "Regular" },
      is_bank_transfer: true,
    },
  ],
} as never;

const ana = { id: "u1", email: "ana@flame.ec", first_name: "Ana", last_name: "Pinto" };
// Restricted people search (10-23): GET /api/organizer/people?organizationId=&q=
const searchRoute: Route = {
  match: (u) => u.includes("/api/organizer/people"),
  body: { people: [] },
};
const routesWith = (extra: Route[] = []) => [
  ...extra,
  { match: (u: string) => u.includes("/api/organizer/people") && /q=ana/i.test(u), body: { people: [{ ...ana, related: true }] } },
  searchRoute,
  { match: (u: string) => u.endsWith("/promotional-tickets"), body: { success: true } },
  { match: (u: string) => u.endsWith("/bank-transfer-tickets"), body: { success: true } },
];

function setup(props: Partial<React.ComponentProps<typeof SendTab>> = {}, language: "en" | "es" = "en") {
  const onChanged = vi.fn();
  const user = userEvent.setup({ delay: null });
  renderV2(<SendTab event={event} organization={{ id: "org1", name: "Kora" }} canEdit onChanged={onChanged} {...props} />, language);
  return { user, onChanged };
}

async function findPerson(user: ReturnType<typeof userEvent.setup>, text: string) {
  const input = screen.getByPlaceholderText("Name or name@email.com");
  await user.clear(input);
  await user.type(input, text);
}

// Many clicks per test: slower machines (Windows) needed > 5 s with the default per-key delay.
vi.setConfig({ testTimeout: 20_000 });

afterEach(() => vi.unstubAllGlobals());

describe("SendTab · permissions and empty states", () => {
  it("read-only roles see the history but no form", () => {
    mockFetch(routesWith());
    setup({ canEdit: false });
    expect(screen.getByText("Your role can see what was sent, but not send tickets.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Name or name@email.com")).not.toBeInTheDocument();
    expect(screen.getByText("Camila Loor")).toBeInTheDocument();
    expect(screen.getByText("3 × General")).toBeInTheDocument();
  });

  it("an event without tiers says so instead of showing an empty picker", () => {
    mockFetch(routesWith());
    setup({ event: { ...(event as object), ticket_tiers: [] } as never });
    expect(screen.getByText("This event has no ticket tiers yet.")).toBeInTheDocument();
  });

  it("empty history", async () => {
    mockFetch(routesWith());
    setup({ event: { ...(event as object), promotional_tickets: [], bank_transfer_orders: [] } as never });
    expect(screen.getByText("Nothing sent yet.")).toBeInTheDocument();
  });

  it("renders in Spanish", () => {
    mockFetch(routesWith());
    setup({}, "es");
    expect(screen.getByRole("tab", { name: "Tickets gratis" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Transferencias" })).toBeInTheDocument();
  });
});

describe("SendTab · step 1 (find person)", () => {
  it("one character doesn't search", async () => {
    const f = mockFetch(routesWith());
    const { user } = setup();
    await findPerson(user, "a");
    await new Promise((r) => setTimeout(r, 400));
    expect(f.fn).not.toHaveBeenCalled();
  });

  it("restricted search for this organization; suggestions as you type", async () => {
    const f = mockFetch(routesWith());
    const { user } = setup();
    await findPerson(user, "ana");
    expect(await screen.findByText("Ana Pinto")).toBeInTheDocument();
    expect(f.calls.at(-1)!.url).toBe("/api/organizer/people?organizationId=org1&q=ana");
  });

  it("no account: offers sending by email to that address (lowercased)", async () => {
    mockFetch(routesWith());
    const { user } = setup();
    await findPerson(user, "Nobody@X.com");
    expect(await screen.findByText(/No Flame account uses nobody@x.com/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send without a Flame account" }));
    expect(screen.getByText("nobody@x.com")).toBeInTheDocument();
    expect(screen.getByText("No Flame account · by email")).toBeInTheDocument();
  });

  it("search failure shows the error", async () => {
    mockFetch([{ match: () => true, status: 403, body: { error: "Unauthorized - organizer access required" } }]);
    const { user } = setup();
    await findPerson(user, "ana");
    expect(await screen.findByText("Unauthorized - organizer access required")).toBeInTheDocument();
  });
});

describe("SendTab · free tickets", () => {
  it("full flow: pick person, tier and quantity, confirm, send", async () => {
    const f = mockFetch(routesWith());
    const { user, onChanged } = setup();
    await findPerson(user, "ana");
    await user.click(await screen.findByText("Ana Pinto"));

    // Default = first available, visible tier
    expect(screen.getByRole("radio", { name: /General/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: /Table x6/ }));
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "More" }));
    // Allowed, but the organizer is warned (APIs don't block on inventory).
    expect(screen.getByText(/Only 2 left — sending 5 goes over capacity/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("5 × Table x6")).toBeInTheDocument();
    expect(screen.getByText("Complimentary")).toBeInTheDocument();
    expect(screen.getByText(/appear in Ana’s Flame account/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send 5 tickets" }));
    expect(await screen.findByRole("status")).toHaveTextContent("5 tickets sent to Ana Pinto");
    expect(f.posts()).toEqual([
      {
        url: "/api/organizer/promotional-tickets",
        method: "POST",
        body: { event_id: "ev1", ticket_tier_id: "tb", quantity: 5, user_id: "u1" },
      },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    // Back to step 1, ready for the next person
    expect(screen.getByPlaceholderText("Name or name@email.com")).toHaveValue("");
  });

  it("free mode lists tiers, not stages", async () => {
    mockFetch(routesWith());
    const { user } = setup();
    await findPerson(user, "ana");
    await user.click(await screen.findByText("Ana Pinto"));
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([
      expect.stringContaining("General"),
      expect.stringContaining("VIP"),
      expect.stringContaining("Table x6"),
    ]);
    expect(screen.queryByText(/Early bird/)).not.toBeInTheDocument();
  });

  it("quantity stays within 1–10 (API limit)", async () => {
    mockFetch(routesWith());
    const { user } = setup();
    await findPerson(user, "ana");
    await user.click(await screen.findByText("Ana Pinto"));
    expect(screen.getByRole("button", { name: "Less" })).toBeDisabled();
    for (let i = 0; i < 9; i++) await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "More" })).toBeDisabled();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("back from confirm keeps the choices; change goes back to the search", async () => {
    mockFetch(routesWith());
    const { user } = setup();
    await findPerson(user, "ana");
    await user.click(await screen.findByText("Ana Pinto"));
    await user.click(screen.getByRole("radio", { name: /VIP/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radio", { name: /VIP/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByPlaceholderText("Name or name@email.com")).toBeInTheDocument();
  });
});

describe("SendTab · bank transfers", () => {
  async function toStep2(user: ReturnType<typeof userEvent.setup>, email = "nobody@x.com") {
    await user.click(screen.getByRole("tab", { name: "Bank transfers" }));
    await findPerson(user, email === "ana@flame.ec" ? "ana" : email);
    if (email === "ana@flame.ec") await user.click(await screen.findByText("Ana Pinto"));
    else await user.click(await screen.findByRole("button", { name: "Create order without a Flame account" }));
  }

  it("history switches to bank orders with stage and amount", async () => {
    mockFetch(routesWith());
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: "Bank transfers" }));
    expect(screen.getByText("Gabriela Mora")).toBeInTheDocument();
    expect(screen.getByText("2 × VIP · Regular")).toBeInTheDocument();
    expect(screen.getByText(/\$110\.00/)).toBeInTheDocument();
    expect(screen.queryByText("Camila Loor")).not.toBeInTheDocument();
  });

  it("stages are separate options with price; the current one is marked", async () => {
    mockFetch(routesWith());
    const { user } = setup();
    await toStep2(user);
    const early = screen.getByRole("radio", { name: /VIP · Early bird/ });
    const regular = screen.getByRole("radio", { name: /VIP · Regular/ });
    expect(within(early).getByText("Sold out")).toBeInTheDocument();
    expect(within(regular).getByText("Current")).toBeInTheDocument();
    expect(within(regular).getByText(/\$55\.00/)).toBeInTheDocument();
  });

  it("no-account order with stage and custom price sends exactly what the API expects", async () => {
    const f = mockFetch(routesWith());
    const { user, onChanged } = setup();
    await toStep2(user);
    await user.click(screen.getByRole("radio", { name: /VIP · Regular/ }));
    await user.click(screen.getByRole("checkbox", { name: "Set a custom price" }));
    const price = screen.getByRole("textbox");
    expect(price).toHaveValue("55.00"); // pre-filled with the selected price

    await user.clear(price);
    await user.type(price, "abc");
    expect(screen.getByText(/Enter a price greater than 0/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await user.clear(price);
    await user.type(price, "10.000"); // thousands separator → refused, not guessed
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await user.clear(price);
    await user.type(price, "45,5");
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("$91.00 · paid by bank transfer")).toBeInTheDocument();
    expect(screen.getByText(/email the tickets as a PDF .* to nobody@x.com/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create order" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Bank transfer order created for nobody@x.com");
    expect(f.posts()[0]).toEqual({
      url: "/api/organizer/bank-transfer-tickets",
      method: "POST",
      body: {
        event_id: "ev1",
        ticket_tier_id: "vip",
        stage_id: "s2",
        quantity: 2,
        recipient_email: "nobody@x.com",
        unit_price_cents: 4550,
      },
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("without custom price or stage, neither field is sent", async () => {
    const f = mockFetch(routesWith());
    const { user } = setup();
    await toStep2(user, "ana@flame.ec");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("$20.00 · paid by bank transfer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create order" }));
    await screen.findByRole("status");
    expect(f.posts()[0].body).toEqual({ event_id: "ev1", ticket_tier_id: "ga", quantity: 1, user_id: "u1" });
  });

  it("a typed custom price is kept when the tier changes (like v1)", async () => {
    mockFetch(routesWith());
    const { user } = setup();
    await toStep2(user);
    await user.click(screen.getByRole("checkbox", { name: "Set a custom price" }));
    const price = screen.getByRole("textbox");
    await user.clear(price);
    await user.type(price, "33");
    await user.click(screen.getByRole("radio", { name: /Table x6/ }));
    expect(screen.getByRole("textbox")).toHaveValue("33");
    // Turning it off and on again pre-fills from the tier now selected.
    await user.click(screen.getByRole("checkbox", { name: "Set a custom price" }));
    await user.click(screen.getByRole("checkbox", { name: "Set a custom price" }));
    expect(screen.getByRole("textbox")).toHaveValue("300.00");
  });

  it("switching mode starts over", async () => {
    mockFetch(routesWith());
    const { user } = setup();
    await findPerson(user, "ana");
    await user.click(await screen.findByText("Ana Pinto"));
    await user.click(screen.getByRole("tab", { name: "Bank transfers" }));
    expect(screen.getByPlaceholderText("Name or name@email.com")).toHaveValue("");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("SendTab · errors on send", () => {
  async function toConfirm(user: ReturnType<typeof userEvent.setup>) {
    await findPerson(user, "ana");
    await user.click(await screen.findByText("Ana Pinto"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
  }

  it("4xx: shows the server's message, stays on confirm, can retry", async () => {
    mockFetch(
      routesWith([{ match: (u) => u.endsWith("/promotional-tickets"), status: 409, body: { error: "Ticket tier not found for this event" } }])
    );
    const { user, onChanged } = setup();
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send 1 ticket" }));
    expect(await screen.findByText("Ticket tier not found for this event")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send 1 ticket" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("5xx: generic message, no server internals", async () => {
    mockFetch(routesWith([{ match: (u) => u.endsWith("/promotional-tickets"), status: 500, body: { error: "duplicate key value" } }]));
    const { user } = setup();
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send 1 ticket" }));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("duplicate key value")).not.toBeInTheDocument();
  });

  it("the send button is disabled while sending (no double orders)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockFetch(routesWith());
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      if (String(u).endsWith("/promotional-tickets")) await gate;
      return original(u, init);
    }));
    const { user } = setup();
    await toConfirm(user);
    await user.click(screen.getByRole("button", { name: "Send 1 ticket" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });
});
