import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

vi.mock("../../app/contexts/MemberRoleContext", () => ({ useMemberRoleContext: () => ({ setSelectedOrgId: vi.fn() }) }));
import RsvpEvents from "../../app/v2/organizer/rsvps/RsvpEvents";
import RsvpEventDetail from "../../app/v2/organizer/rsvps/[eventId]/RsvpEventDetail";

// Many clicks per test: slower machines (Windows) need more than the default 5 s.
vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const day = 86_400_000;
const at = (d: number) => new Date(Date.now() + d * day).toISOString();
const ev = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Event ${id}`,
  slug: id,
  organization_id: "org1",
  starts_at: at(5),
  ends_at: at(5.3),
  venue: "Porto",
  city: "Guayaquil",
  image_url: null,
  currency: "USD",
  timezone: "America/Guayaquil",
  requires_rsvp: true,
  pending_rsvps: 0,
  ...over,
});
const orgData = (events: unknown[]) => ({ events, cohost_events: [], owner_cohost_assignments: [] });

const rsvp = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  status,
  requested_quantity: 1,
  requested_at: at(-1),
  base_price_cents: 2000,
  stage_name: null,
  registration_data: null,
  users: { first_name: `Guest`, last_name: id.toUpperCase(), email: `${id}@x.com`, document_id: "0912345678", date_of_birth: null },
  ticket_tiers: { name: "General", price_cents: 2000 },
  ...over,
});
const RSVPS = [
  rsvp("p1", "pending", { requested_quantity: 2, base_price_cents: 4000 }),
  rsvp("p2", "pending", { base_price_cents: 0 }),
  rsvp("p3", "pending"),
  rsvp("a1", "approved"),
  rsvp("a2", "purchased"),
  rsvp("x1", "rejected"),
  rsvp("e1", "expired"),
];
const FORM = [
  { id: "ig", label: "Instagram", type: "text", required: true },
  { id: "adult", label: "Over 18?", type: "checkbox" },
  { id: "old", label: "Old question", type: "text", archived: true },
];

function wrap(ui: React.ReactElement, language: "en" | "es" = "en") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderV2(<QueryClientProvider client={client}>{ui}</QueryClientProvider>, language);
}

function routesFor(opts: { event?: Record<string, unknown>; rsvps?: unknown[]; listStatus?: number; extra?: Route[] } = {}): Route[] {
  return [
    ...(opts.extra ?? []),
    { match: (u) => u.startsWith("/api/organizer/data"), body: orgData([ev("ev1", { pending_rsvps: 3, ...opts.event })]) },
    {
      match: (u, i) => u.startsWith("/api/organizer/rsvps?") && (i?.method ?? "GET") === "GET",
      status: opts.listStatus ?? 200,
      body: opts.listStatus && opts.listStatus >= 400 ? { error: "nope" } : { rsvps: opts.rsvps ?? RSVPS, registration_form_config: FORM },
    },
    { match: (u, i) => i?.method === "PATCH", body: { success: true } },
  ];
}

const detail = (language: "en" | "es" = "en") =>
  wrap(<RsvpEventDetail eventId="ev1" organization={org} organizations={[org]} role="owner" />, language);

describe("RSVP events list", () => {
  const events = [
    ev("soon", { starts_at: at(2), ends_at: at(2.3), pending_rsvps: 4 }),
    ev("later", { starts_at: at(9), ends_at: at(9.3), name: "Fiésta Grande" }),
    ev("done", { starts_at: at(-20), ends_at: at(-19.7), pending_rsvps: 1 }),
    ev("open", { requires_rsvp: false }),
  ];

  it("only RSVP events, current first by date, with pending counts and links", async () => {
    mockFetch([{ match: (u) => u.startsWith("/api/organizer/data"), body: orgData(events) }]);
    wrap(<RsvpEvents organization={org} organizations={[org]} role="owner" />);
    const cards = await screen.findAllByRole("listitem", {}, { timeout: 4000 });
    const links = cards.map((li) => within(li).getByRole("link"));
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/v2/organizer/rsvps/soon?org=kora",
      "/v2/organizer/rsvps/later?org=kora",
    ]);
    expect(within(links[0]).getByText("4")).toBeInTheDocument();
    // "Event open" doesn't take RSVPs: no card (the sidebar still lists it as a current event).
    expect(cards).toHaveLength(2);
  });

  it("past tab and accent-insensitive search", async () => {
    mockFetch([{ match: (u) => u.startsWith("/api/organizer/data"), body: orgData(events) }]);
    const user = userEvent.setup({ delay: null });
    wrap(<RsvpEvents organization={org} organizations={[org]} role="owner" />);
    const cardNames = () => screen.queryAllByRole("listitem").map((li) => within(li).getByRole("link").textContent);
    await screen.findAllByRole("listitem", {}, { timeout: 4000 });
    await user.type(screen.getByRole("searchbox", { name: "Search by event name" }), "fiesta");
    expect(cardNames()).toEqual([expect.stringContaining("Fiésta Grande")]);
    await user.clear(screen.getByRole("searchbox"));
    await user.click(screen.getByRole("tab", { name: /Past events/ }));
    expect(cardNames()).toEqual([expect.stringContaining("Event done")]);
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No events match “zzz”.")).toBeInTheDocument();
  });
});

describe("RSVP event detail", () => {
  it("opens on Pending; tabs count Approved + Paid together", async () => {
    mockFetch(routesFor());
    detail();
    await waitFor(() => expect(screen.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true"), { timeout: 4000 });
    const count = (name: RegExp) => within(screen.getByRole("tab", { name })).getAllByText(/\d+/).pop()!.textContent;
    await waitFor(() => expect(count(/^All/)).toBe("7"));
    expect(count(/Pending/)).toBe("3");
    expect(count(/Approved/)).toBe("2");
    expect(count(/Rejected/)).toBe("1");
    expect(screen.getByText("Guest P1")).toBeInTheDocument();
    expect(screen.queryByText("Guest A1")).not.toBeInTheDocument();
    expect(screen.getAllByText(/ID 091-2345-678/).length).toBeGreaterThan(0);
  });

  it("approve: the confirmation says the card is charged; cancel does nothing; confirm calls PATCH", async () => {
    const f = mockFetch(routesFor());
    const user = userEvent.setup({ delay: null });
    detail();
    const row = (await screen.findByText("Guest P1")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Approve" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Approve Guest P1’s request (2 tickets · General)?");
    expect(dialog).toHaveTextContent("Their card is charged now and the tickets are sent by email. You receive $40.00.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(f.posts()).toEqual([]);

    await user.click(within(row).getByRole("button", { name: "Approve" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Guest P1 approved");
    expect(f.posts()).toEqual([{ url: "/api/organizer/rsvps/p1/approve", method: "PATCH", body: undefined }]);
  });

  it("free request: the confirmation says tickets go out, no charge", async () => {
    mockFetch(routesFor());
    const user = userEvent.setup({ delay: null });
    detail();
    const row = (await screen.findByText("Guest P2")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("The tickets are sent by email right away.");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("charged");
  });

  it("reject: hold released message, PATCH reject", async () => {
    const f = mockFetch(routesFor());
    const user = userEvent.setup({ delay: null });
    detail();
    const row = (await screen.findByText("Guest P3")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("If their card was authorized, the hold is released.");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Guest P3’s request rejected");
    expect(f.posts()[0].url).toBe("/api/organizer/rsvps/p3/reject");
  });

  it("409: someone else already handled it — no error, list refreshed", async () => {
    mockFetch(routesFor({ extra: [{ match: (u, i) => i?.method === "PATCH", status: 409, body: { error: "RSVP has already been processed" } }] }));
    const user = userEvent.setup({ delay: null });
    detail();
    const row = (await screen.findByText("Guest P1")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Approve" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Someone else already handled this request.");
  });

  it("4xx shows the server's message; 5xx a generic one", async () => {
    mockFetch(routesFor({ extra: [{ match: (u, i) => i?.method === "PATCH" && u.includes("p1"), status: 400, body: { error: "Payment authorization expired" } }, { match: (u, i) => i?.method === "PATCH", status: 500, body: { error: "stripe: secret detail" } }] }));
    const user = userEvent.setup({ delay: null });
    detail();
    const approve = async (id: string) => {
      const row = (await screen.findByText(`Guest ${id}`)).closest("li")!;
      await user.click(within(row).getByRole("button", { name: "Approve" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
    };
    await approve("P1");
    expect(await screen.findByText("Payment authorization expired")).toBeInTheDocument();
    await approve("P3");
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/secret detail/)).not.toBeInTheDocument();
  });

  it("approve all: confirmation with paid count and total, one by one, summary of what happened", async () => {
    const f = mockFetch(
      routesFor({
        extra: [
          { match: (u, i) => i?.method === "PATCH" && u.includes("/p2/"), status: 409, body: { error: "done" } },
          { match: (u, i) => i?.method === "PATCH" && u.includes("/p3/"), status: 500, body: {} },
        ],
      })
    );
    const user = userEvent.setup({ delay: null });
    detail();
    expect(await screen.findByText("3 requests waiting")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve all" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Approve all 3 requests?");
    expect(dialog).toHaveTextContent("2 of them are paid: those cards are charged now (you receive $60.00 in total).");
    await user.click(within(dialog).getByRole("button", { name: "Approve all" }));
    expect(await screen.findByText(/1 request approved · 1 was already handled/)).toBeInTheDocument();
    expect(screen.getByText("Couldn’t approve: Guest P3")).toBeInTheDocument();
    expect(f.posts().map((c) => c.url)).toEqual([
      "/api/organizer/rsvps/p1/approve",
      "/api/organizer/rsvps/p2/approve",
      "/api/organizer/rsvps/p3/approve",
    ]);
  });

  it("approve all can be stopped between requests", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = mockFetch(routesFor());
    const base = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") await gate;
        return base(u, init);
      })
    );
    const user = userEvent.setup({ delay: null });
    detail();
    await user.click(await screen.findByRole("button", { name: "Approve all" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve all" }));
    expect(await screen.findByText("Approving 0 of 3…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    release();
    expect(await screen.findByText(/1 request approved/)).toBeInTheDocument();
    expect(f.posts()).toHaveLength(1);
  });

  it("a single pending request has no Approve all", async () => {
    mockFetch(routesFor({ rsvps: [rsvp("p1", "pending"), rsvp("a1", "approved")] }));
    detail();
    await screen.findByText("Guest P1");
    expect(screen.queryByRole("button", { name: "Approve all" })).not.toBeInTheDocument();
  });

  it("ended event: banner and no approve/reject", async () => {
    mockFetch(routesFor({ event: { starts_at: at(-3), ends_at: at(-2.7) } }));
    detail();
    expect(await screen.findByText(/This event has ended/)).toBeInTheDocument();
    await screen.findByText("Guest P1");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve all" })).not.toBeInTheDocument();
  });

  it("no access (403) says so", async () => {
    mockFetch(routesFor({ listStatus: 403 }));
    detail();
    expect(await screen.findByText("You don’t have access to this event’s requests.")).toBeInTheDocument();
  });

  it("registration details: form labels, yes/no, not provided, archived", async () => {
    mockFetch(routesFor({ rsvps: [rsvp("p1", "pending", { registration_data: { ig: "@guest", adult: true } })] }));
    const user = userEvent.setup({ delay: null });
    detail();
    const row = (await screen.findByText("Guest P1")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "View details" }));
    const dialog = screen.getByRole("dialog", { name: "Registration details" });
    expect(within(dialog).getByText("Instagram *")).toBeInTheDocument();
    expect(within(dialog).getByText("@guest")).toBeInTheDocument();
    expect(within(dialog).getByText("Yes")).toBeInTheDocument();
    expect(within(dialog).getByText("Old question (archived)")).toBeInTheDocument();
    expect(within(dialog).getByText("Not provided")).toBeInTheDocument();
    expect(within(dialog).getByText("$20.00")).toBeInTheDocument();
  });

  it("renders in Spanish", async () => {
    mockFetch(routesFor());
    detail("es");
    expect(await screen.findByRole("tab", { name: /Pendientes/ })).toBeInTheDocument();
    expect(await screen.findByText("3 solicitudes en espera")).toBeInTheDocument();
  });
});
