import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: vi.fn(),
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
  })),
}));
vi.mock("../../app/contexts/MemberRoleContext", () => ({ useMemberRoleContext: () => ({ setSelectedOrgId: vi.fn() }) }));
import TierEditor from "../../app/v2/organizer/event/[id]/tiers/[tierId]/TierEditor";
import TierEditorPage from "../../app/v2/organizer/event/[id]/tiers/[tierId]/page";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => push.mockReset());
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const ENDS = "2030-06-16T07:00:00.000Z";
const GENERAL = {
  id: "t1",
  name: "General",
  price_cents: 2500,
  quantity_total: 100,
  quantity_sold: 40,
  quantity_reserved: 8,
  per_user_limit: 4,
  sales_start: null,
  sales_end: ENDS,
  secret_code: null,
  description: null,
  is_hidden: false,
  is_manually_sold_out: false,
  registration_form_fields: null,
  ticket_stages: [],
};
const VIP = {
  ...GENERAL,
  id: "t2",
  name: "VIP",
  price_cents: 6000,
  quantity_total: 50,
  quantity_sold: 12,
  registration_form_fields: ["mesa"],
  ticket_stages: [
    { id: "s1", name: "Early", price_cents: 6000, quantity: 20, sold_quantity: 12, order_index: 0, description: null },
    { id: "s2", name: "Regular", price_cents: 7000, quantity: 30, sold_quantity: 0, order_index: 1, description: null },
  ],
};
const FREE = { ...GENERAL, id: "t3", name: "Free", price_cents: 0, quantity_sold: 0, quantity_reserved: 0, registration_form_fields: [] };
const EVENT = {
  id: "ev1",
  name: "Noche de Salsa",
  slug: "salsa",
  organization_id: "org1",
  starts_at: "2030-06-16T02:00:00.000Z",
  ends_at: ENDS,
  venue: "Porto",
  city: "Guayaquil",
  currency: "USD",
  timezone: "America/Guayaquil",
  requires_rsvp: true,
  registration_form_config: [
    { id: "ig", label: "Instagram", type: "text", required: true },
    { id: "mesa", label: "Mesa", type: "number" },
  ],
  ticket_tiers: [GENERAL, VIP, FREE],
  purchases: [],
};

function setup(tierId: string, opts: { extra?: Route[]; event?: Record<string, unknown> } = {}) {
  const fetchMock = mockFetch([
    ...(opts.extra ?? []),
    { match: (u) => u.startsWith("/api/organizer/data"), body: { events: [{ ...EVENT, ...opts.event }], cohost_events: [], owner_cohost_assignments: [] } },
    { match: (u, i) => u === "/api/ticket-tiers" && i?.method === "PATCH", body: { tier: {} } },
    { match: (u, i) => u === "/api/ticket-tiers" && i?.method === "POST", status: 201, body: { tier: { id: "new" } } },
    { match: (u, i) => u === "/api/events" && i?.method === "PATCH", body: {} },
    { match: (u, i) => u.startsWith("/api/ticket-tiers?id=") && i?.method === "DELETE", body: { success: true } },
    { match: (u) => u.includes("/force-reduce"), body: { success: true } },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup({ delay: null });
  renderV2(
    <QueryClientProvider client={client}>
      <TierEditor eventId="ev1" tierId={tierId} organization={org} organizations={[org]} role="owner" />
    </QueryClientProvider>
  );
  return { fetchMock, user };
}
const writes = (calls: Array<{ url: string; method: string; body: any }>) => calls.filter((c) => c.method !== "GET");
const saveBtn = () => screen.getByRole("button", { name: /^(Save tier|Create tier)$/ });
const TIERS_TAB = "/v2/organizer/event/ev1?org=kora&tab=tiers";

describe("TierEditor v2 — existing simple tier", () => {
  it("pre-fills, shows what's sold, and saves only what changed", async () => {
    const { user, fetchMock } = setup("t1");
    const name = await screen.findByLabelText("Tier name");
    expect(name).toHaveValue("General");
    expect(screen.getByLabelText("Price")).toHaveValue("25");
    expect(screen.getByText("40 already sold. Spots can’t go below that.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Price changes as tickets sell/ })).toBeDisabled();
    await user.clear(name);
    await user.type(name, "General B");
    await user.click(screen.getByRole("switch", { name: /Mark as sold out/ }));
    await user.click(saveBtn());
    await waitFor(() => expect(push).toHaveBeenCalledWith(TIERS_TAB));
    expect(writes(fetchMock.calls).map((c) => [c.method, c.url, c.body])).toEqual([
      ["PATCH", "/api/ticket-tiers", { id: "t1", name: "General B", is_manually_sold_out: true }],
    ]);
  });

  it("nothing changed → nothing sent", async () => {
    const { user, fetchMock } = setup("t1");
    await screen.findByLabelText("Tier name");
    await user.click(saveBtn());
    expect(screen.getByText("There are no changes to save.")).toBeInTheDocument();
    expect(writes(fetchMock.calls)).toHaveLength(0);
  });

  it("spots below sold are refused before calling the API", async () => {
    const { user, fetchMock } = setup("t1");
    const spots = await screen.findByLabelText("Spots");
    await user.clear(spots);
    await user.type(spots, "30");
    await user.click(saveBtn());
    expect(screen.getByText("Can’t be lower than what’s already sold.")).toBeInTheDocument();
    expect(writes(fetchMock.calls)).toHaveLength(0);
  });

  it("pending checkouts/RSVPs don't fit: explains what force-reduce does; confirm reduces, then saves the rest", async () => {
    let first = true;
    const { user, fetchMock } = setup("t1", {
      extra: [
        {
          match: (u, i) => {
            if (u !== "/api/ticket-tiers" || i?.method !== "PATCH" || !first) return false;
            first = false;
            return true;
          },
          status: 400,
          body: { error: "Cannot reduce", code: "QUANTITY_BELOW_RESERVED", details: { quantity_sold: 40, quantity_reserved: 8, min_allowed_quantity: 48 } },
        },
      ],
    });
    const spots = await screen.findByLabelText("Spots");
    await user.clear(spots);
    await user.type(spots, "45");
    await user.type(screen.getByLabelText("Tier name"), " B");
    await user.click(saveBtn());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Reduce General B to 45 spots?")).toBeInTheDocument();
    expect(within(dialog).getByText(/40 sold and 8 reserved/)).toBeInTheDocument();
    expect(within(dialog).getByText(/rejects every pending and approved RSVP of this tier, not only the extra ones/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reduce and reject" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(TIERS_TAB));
    expect(writes(fetchMock.calls).map((c) => [c.method, c.url, c.body])).toEqual([
      ["PATCH", "/api/ticket-tiers", { id: "t1", name: "General B", quantity_total: 45 }],
      ["POST", "/api/organizer/tiers/t1/force-reduce", { new_quantity_total: 45 }],
      ["PATCH", "/api/ticket-tiers", { id: "t1", name: "General B" }],
    ]);
  });

  it("cancelling the force-reduce prompt changes nothing", async () => {
    const { user, fetchMock } = setup("t1", {
      extra: [{ match: (u, i) => u === "/api/ticket-tiers" && i?.method === "PATCH", status: 400, body: { code: "QUANTITY_BELOW_RESERVED", details: { quantity_sold: 40, quantity_reserved: 8 } } }],
    });
    const spots = await screen.findByLabelText("Spots");
    await user.clear(spots);
    await user.type(spots, "45");
    await user.click(saveBtn());
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(fetchMock.calls.some((c) => c.url.includes("force-reduce"))).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("delete is blocked while the tier has sales", async () => {
    setup("t1");
    expect(await screen.findByRole("button", { name: "Delete tier" })).toBeDisabled();
    expect(screen.getByText("Tiers with sold tickets can’t be deleted.")).toBeInTheDocument();
  });
});

describe("TierEditor v2 — staged tier", () => {
  it("stage with sales can't be removed or go below sold; edits send the full stage list", async () => {
    const { user, fetchMock } = setup("t2");
    const names = await screen.findAllByLabelText("Stage name");
    expect(names.map((n) => (n as HTMLInputElement).value)).toEqual(["Early", "Regular"]);
    expect(screen.getByText("12 sold")).toBeInTheDocument();
    const removes = screen.getAllByRole("button", { name: "Remove stage" });
    expect(removes[0]).toBeDisabled();
    expect(removes[1]).toBeEnabled();
    const spots = screen.getAllByLabelText("Spots");
    await user.clear(spots[1]!);
    await user.type(spots[1]!, "40");
    await user.click(saveBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(writes(fetchMock.calls)[0]!.body).toEqual({
      id: "t2",
      quantity_total: 60,
      useStages: true,
      stages: [
        { id: "s1", name: "Early", price_cents: 6000, quantity: 20, order_index: 0, description: null },
        { id: "s2", name: "Regular", price_cents: 7000, quantity: 40, order_index: 1, description: null },
      ],
    });
  });

  it("force-reduce is not offered on staged tiers (it would desync stages and total)", async () => {
    const { user, fetchMock } = setup("t2", {
      extra: [{ match: (u, i) => u === "/api/ticket-tiers" && i?.method === "PATCH", status: 400, body: { code: "QUANTITY_BELOW_RESERVED", details: { quantity_sold: 12, quantity_reserved: 30 } } }],
    });
    const spots = await screen.findAllByLabelText("Spots");
    await user.clear(spots[1]!);
    await user.type(spots[1]!, "10");
    await user.click(saveBtn());
    expect(await screen.findByText(/12 sold and 30 reserved don’t fit in 30 spots. Review this tier’s pending RSVPs first/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.calls.some((c) => c.url.includes("force-reduce"))).toBe(false);
  });

  it("saved questions are read-only here; others of the event are one tap away", async () => {
    setup("t2");
    const q = await screen.findByLabelText("Question");
    expect(q).toHaveValue("Mesa");
    expect(q).toHaveAttribute("readonly");
    expect(screen.getByText("This event’s questions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Instagram" })).toBeInTheDocument();
  });
});

describe("TierEditor v2 — new tier", () => {
  it("creates a tier with the event's defaults", async () => {
    const { user, fetchMock } = setup("new");
    expect(await screen.findByLabelText("Tier name")).toHaveValue("Tier 4");
    expect(screen.getByRole("switch", { name: /Price changes as tickets sell/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Delete tier" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Price"), "15");
    await user.type(screen.getByLabelText("Spots"), "30");
    await user.click(screen.getByRole("button", { name: "Instagram" }));
    await user.click(saveBtn());
    await waitFor(() => expect(push).toHaveBeenCalledWith(TIERS_TAB));
    expect(writes(fetchMock.calls).map((c) => [c.method, c.url, c.body])).toEqual([
      [
        "POST",
        "/api/ticket-tiers",
        {
          event_id: "ev1",
          name: "Tier 4",
          per_user_limit: 10,
          sales_start: null,
          sales_end: ENDS,
          secret_code: null,
          description: null,
          is_hidden: false,
          is_manually_sold_out: false,
          quantity_total: 30,
          price_cents: 1500,
          useStages: false,
          registration_form_fields: ["ig"],
        },
      ],
    ]);
  });

  it("a brand-new question: pins 'all questions' tiers, adds it to the event, then creates the tier", async () => {
    const { user, fetchMock } = setup("new");
    await user.type(await screen.findByLabelText("Price"), "0");
    await user.type(screen.getByLabelText("Spots"), "10");
    await user.click(screen.getByRole("button", { name: "Add question" }));
    await user.type(screen.getByLabelText("Question"), "Cédula");
    await user.click(saveBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const w = writes(fetchMock.calls);
    expect(w.map((c) => `${c.method} ${c.url}`)).toEqual(["PATCH /api/ticket-tiers", "PATCH /api/events", "POST /api/ticket-tiers"]);
    expect(w[0]!.body).toEqual({ id: "t1", registration_form_fields: ["ig", "mesa"] });
    const config = w[1]!.body.registration_form_config;
    expect(config.map((f: any) => f.label)).toEqual(["Instagram", "Mesa", "Cédula"]);
    expect(w[2]!.body.registration_form_fields).toEqual([config[2].id]);
  });

  it("if the new question can't be saved, the tier isn't created", async () => {
    const { user, fetchMock } = setup("new", { extra: [{ match: (u, i) => u === "/api/events" && i?.method === "PATCH", status: 500, body: {} }] });
    await user.type(await screen.findByLabelText("Price"), "0");
    await user.type(screen.getByLabelText("Spots"), "10");
    await user.click(screen.getByRole("button", { name: "Add question" }));
    await user.type(screen.getByLabelText("Question"), "Cédula");
    await user.click(saveBtn());
    expect(await screen.findByText(/the new questions couldn’t be added/)).toBeInTheDocument();
    expect(fetchMock.calls.some((c) => c.method === "POST")).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("TierEditor v2 — delete, errors, access", () => {
  it("deletes an unsold tier after confirming", async () => {
    const { user, fetchMock } = setup("t3");
    await user.click(await screen.findByRole("button", { name: "Delete tier" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete Free?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete tier" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(TIERS_TAB));
    expect(writes(fetchMock.calls).map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /api/ticket-tiers?id=t3"]);
  });

  it("the event's only tier can't be deleted", async () => {
    setup("t3", { event: { ticket_tiers: [FREE] } });
    expect(await screen.findByRole("button", { name: "Delete tier" })).toBeDisabled();
    expect(screen.getByText("An event needs at least one tier.")).toBeInTheDocument();
  });

  it("API error is shown, no navigation", async () => {
    const { user } = setup("t1", { extra: [{ match: (u, i) => u === "/api/ticket-tiers" && i?.method === "PATCH", status: 409, body: { error: "More tickets were sold during the update." } }] });
    await user.type(await screen.findByLabelText("Tier name"), "!");
    await user.click(saveBtn());
    expect(await screen.findByText("More tickets were sold during the update.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("unknown tier", async () => {
    setup("nope");
    expect(await screen.findByText("This tier isn’t available.")).toBeInTheDocument();
  });

  it("viewer is sent back to the Tiers tab", async () => {
    ctx.role = "viewer";
    await expect(
      TierEditorPage({ params: Promise.resolve({ id: "ev1", tierId: "t1" }), searchParams: Promise.resolve({ org: "kora" }) })
    ).rejects.toThrow("REDIRECT /v2/organizer/event/ev1?org=kora&tab=tiers");
    ctx.role = "organizer";
    const el = (await TierEditorPage({ params: Promise.resolve({ id: "ev1", tierId: "new" }), searchParams: Promise.resolve({ org: "kora" }) })) as React.ReactElement<{ tierId: string }>;
    expect(el.props.tierId).toBe("new");
  });
});
