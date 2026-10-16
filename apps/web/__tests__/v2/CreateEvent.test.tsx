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
vi.mock("../../app/lib/utils/image-upload.client", () => ({
  resizeImageTo4x5: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
}));
import CreateEvent from "../../app/v2/organizer/create/CreateEvent";
import CreateEventPage from "../../app/v2/organizer/create/page";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => {
  push.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const CREATED = { event: { id: "ev-new", slug: "noche-de-salsa" }, ticket_tiers: [] };

function routes(extra: Route[] = []): Route[] {
  return [
    ...extra,
    { match: (u) => u.startsWith("/api/organizer/data"), body: { events: [], cohost_events: [], owner_cohost_assignments: [] } },
    { match: (u) => u.startsWith("/api/places/autocomplete"), body: { predictions: [] } },
    { match: (u, i) => u === "/api/events" && i?.method === "POST", body: CREATED },
  ];
}

function setup(opts: { language?: "en" | "es"; extra?: Route[] } = {}) {
  const fetchMock = mockFetch(routes(opts.extra));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup({ delay: null });
  renderV2(
    <QueryClientProvider client={client}>
      <CreateEvent organization={org} organizations={[org]} role="owner" />
    </QueryClientProvider>,
    opts.language
  );
  return { fetchMock, user };
}

const tierCard = (n: number) => screen.getAllByRole("article")[n - 1]!;
const flyerInput = () => document.getElementById("ef-flyer") as HTMLInputElement;
const publishBtn = () => screen.getByRole("button", { name: "Publish event" });

/** Minimum valid event: far-future dates in the event timezone, one paid tier. */
async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Event name"), "Noche de Salsa!");
  fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2030-06-15T21:00" } });
  await user.type(screen.getByLabelText("Venue"), "Luna Rooftop");
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Guayaquil" } });
  const card = within(tierCard(1));
  await user.type(card.getByLabelText("Tier name"), "General");
  await user.type(card.getByLabelText("Price"), "25,50");
  await user.type(card.getByLabelText("Spots"), "120");
}

const eventPost = (calls: Array<{ url: string; method: string; body: any }>) =>
  calls.find((c) => c.url === "/api/events" && c.method === "POST");

describe("CreateEvent v2", () => {
  it("publishing an empty form shows the problems and sends nothing", async () => {
    const { user, fetchMock } = setup();
    await user.click(publishBtn());
    expect(screen.getByText(/Fix \d+ fields to continue/)).toBeInTheDocument();
    expect(screen.getByText("Give the event a name.")).toBeInTheDocument();
    expect(screen.getByText("Pick when the event starts.")).toBeInTheDocument();
    expect(screen.getByText("Add the venue.")).toBeInTheDocument();
    expect(screen.getByText("Set a price (0 for free).")).toBeInTheDocument();
    expect(screen.getByLabelText("Event name")).toHaveFocus();
    expect(eventPost(fetchMock.calls)).toBeUndefined();
  });

  it("errors stay hidden until the first publish attempt", async () => {
    setup();
    expect(screen.queryByText("Give the event a name.")).not.toBeInTheDocument();
  });

  it("derives the link from the name, suggests the end 5 h after the start, and publishes", async () => {
    const { user, fetchMock } = setup();
    await fillBasics(user);
    expect(screen.getByLabelText("Event link")).toHaveValue("noche-de-salsa");
    expect(screen.getByLabelText("Ends")).toHaveValue("2030-06-16T02:00");

    await user.click(publishBtn());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/v2/organizer/event/ev-new?org=kora"));
    const body = eventPost(fetchMock.calls)!.body;
    expect(body.event).toMatchObject({
      organization_id: "org1",
      name: "Noche de Salsa!",
      slug: "noche-de-salsa",
      venue: "Luna Rooftop",
      city: "Guayaquil",
      starts_at: "2030-06-16T02:00:00.000Z",
      ends_at: "2030-06-16T07:00:00.000Z",
      requires_rsvp: true,
      currency: "USD",
      timezone: "America/Guayaquil",
    });
    expect(body.event.registration_form_config).toBeUndefined();
    expect(body.ticket_tiers).toEqual([
      {
        name: "General",
        price_cents: 2550,
        quantity_total: 120,
        per_user_limit: 10,
        sales_start: null,
        sales_end: "2030-06-16T07:00:00.000Z",
        secret_code: null,
        useStages: false,
        is_hidden: false,
        description: null,
      },
    ]);
    // No flyer → no upload.
    expect(fetchMock.calls.some((c) => c.url === "/api/upload-image")).toBe(false);
  });

  it("a hand-edited link stops following the name; a hand-edited end stops following the start", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Event name"), "Uno");
    const link = screen.getByLabelText("Event link");
    await user.clear(link);
    await user.type(link, "Mi Fiesta Ñ");
    await user.tab();
    expect(link).toHaveValue("mi-fiesta-n");
    await user.type(screen.getByLabelText("Event name"), " dos");
    expect(link).toHaveValue("mi-fiesta-n");

    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2030-06-15T21:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2030-06-16T06:00" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2030-06-15T22:00" } });
    expect(screen.getByLabelText("Ends")).toHaveValue("2030-06-16T06:00");
  });

  it("stages are opt-in: the toggle splits the tier into Early Bird / Regular and posts them", async () => {
    const { user, fetchMock } = setup();
    await fillBasics(user);
    const card = within(tierCard(1));
    await user.click(card.getByRole("switch", { name: /Price changes as tickets sell/ }));
    const names = card.getAllByLabelText("Stage name");
    expect(names.map((n) => (n as HTMLInputElement).value)).toEqual(["Early Bird", "Regular"]);
    expect(card.getByText("120 spots in total")).toBeInTheDocument();
    const prices = card.getAllByLabelText("Price");
    await user.clear(prices[1]!);
    await user.type(prices[1]!, "30");

    await user.click(publishBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(eventPost(fetchMock.calls)!.body.ticket_tiers[0]).toMatchObject({
      useStages: true,
      price_cents: 2550,
      quantity_total: 120,
      stages: [
        { name: "Early Bird", price_cents: 2550, quantity: 60 },
        { name: "Regular", price_cents: 3000, quantity: 60 },
      ],
    });
  });

  it("removing a stage below two blocks publishing with a clear message", async () => {
    const { user, fetchMock } = setup();
    await fillBasics(user);
    const card = within(tierCard(1));
    await user.click(card.getByRole("switch", { name: /Price changes as tickets sell/ }));
    await user.click(card.getAllByRole("button", { name: "Remove stage" })[1]!);
    await user.click(publishBtn());
    expect(screen.getByText("Add at least 2 stages, or turn off price changes.")).toBeInTheDocument();
    expect(eventPost(fetchMock.calls)).toBeUndefined();
  });

  it("per-tier questions with reuse in later tiers → event form config + per-tier field lists", async () => {
    const { user, fetchMock } = setup();
    await fillBasics(user);
    const first = within(tierCard(1));
    await user.click(first.getByRole("button", { name: "Add question" }));
    await user.type(first.getByLabelText("Question"), "Instagram");
    await user.click(first.getByRole("button", { name: "Add question" }));
    const q2 = first.getAllByLabelText("Question")[1]!;
    await user.type(q2, "Mesa");
    const types = first.getAllByRole("radiogroup", { name: "Answer type" });
    await user.click(within(types[1]!).getByRole("radio", { name: "Numbers" }));

    await user.click(screen.getByRole("button", { name: "Add Tier 2" }));
    const second = within(tierCard(2));
    await user.type(second.getByLabelText("Tier name"), "VIP");
    await user.type(second.getByLabelText("Price"), "60");
    await user.type(second.getByLabelText("Spots"), "20");
    await user.click(second.getByRole("button", { name: "Instagram" }));
    expect(second.getByLabelText("Question")).toHaveValue("Instagram");

    await user.click(publishBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const body = eventPost(fetchMock.calls)!.body;
    expect(body.event.registration_form_config.map((f: any) => [f.label, f.type, f.required])).toEqual([
      ["Instagram", "text", true],
      ["Mesa", "number", true],
    ]);
    const [ig, mesa] = body.event.registration_form_config.map((f: any) => f.id);
    expect(body.ticket_tiers.map((t: any) => t.registration_form_fields)).toEqual([[ig, mesa], [ig]]);
  });

  it("turning RSVP off hides the questions and drops them from the request", async () => {
    const { user, fetchMock } = setup();
    await fillBasics(user);
    await user.click(within(tierCard(1)).getByRole("button", { name: "Add question" }));
    await user.click(screen.getByRole("switch", { name: /RSVP required/ }));
    expect(screen.queryByRole("button", { name: "Add question" })).not.toBeInTheDocument();
    await user.click(publishBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const body = eventPost(fetchMock.calls)!.body;
    expect(body.event.requires_rsvp).toBe(false);
    expect(body.event.registration_form_config).toBeUndefined();
  });

  it("server rejection: shows the API message, keeps the form, no navigation", async () => {
    const { user } = setup({
      extra: [{ match: (u, i) => u === "/api/events" && i?.method === "POST", status: 400, body: { error: "An event with this URL slug already exists" } }],
    });
    await fillBasics(user);
    await user.click(publishBtn());
    expect(await screen.findByText("An event with this URL slug already exists")).toBeInTheDocument();
    expect(publishBtn()).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("flyer: uploads after the event exists, saves its URL, then opens the event", async () => {
    const { user, fetchMock } = setup({
      extra: [
        { match: (u) => u === "/api/upload-image", body: { url: "https://cdn/flyer.jpg" } },
        { match: (u, i) => u === "/api/events" && i?.method === "PATCH", body: { ok: true } },
      ],
    });
    await user.upload(flyerInput(), new File(["x"], "flyer.png", { type: "image/png" }));
    expect(await screen.findByRole("button", { name: "Remove flyer" })).toBeInTheDocument();
    await fillBasics(user);
    await user.click(publishBtn());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/v2/organizer/event/ev-new?org=kora"));

    const order = fetchMock.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.url}`);
    expect(order).toEqual(["POST /api/events", "POST /api/upload-image", "PATCH /api/events"]);
    const upload = fetchMock.calls.find((c) => c.url === "/api/upload-image")!.body as FormData;
    expect(upload.get("eventId")).toBe("ev-new");
    expect((upload.get("file") as File).type).toBe("image/jpeg");
    expect(fetchMock.calls.find((c) => c.method === "PATCH")!.body).toEqual({ id: "ev-new", image_url: "https://cdn/flyer.jpg" });
  });

  it("flyer upload fails: the event stays published, no second publish possible, link to the event", async () => {
    const { user, fetchMock } = setup({ extra: [{ match: (u) => u === "/api/upload-image", status: 500, body: {} }] });
    await user.upload(flyerInput(), new File(["x"], "flyer.png", { type: "image/png" }));
    await fillBasics(user);
    await user.click(publishBtn());
    expect(await screen.findByText(/the flyer didn’t upload/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish event" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to event" })).toHaveAttribute("href", "/v2/organizer/event/ev-new?org=kora");
    expect(fetchMock.calls.filter((c) => c.url === "/api/events" && c.method === "POST")).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("rejects non-images and files over 4.5 MB before resizing", async () => {
    const { user } = setup();
    const input = flyerInput();
    await user.upload(input, new File([new Uint8Array(5 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" }));
    expect(screen.getByText("That image is over 4.5 MB.")).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "doc.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("Choose an image file.")).toBeInTheDocument();
  });

  it("hidden tier, access code and custom sales start go to the API normalized", async () => {
    const { user, fetchMock } = setup();
    await fillBasics(user);
    const card = within(tierCard(1));
    await user.type(card.getByLabelText(/Access code/), "vip");
    await user.click(card.getByRole("switch", { name: /Hide tier/ }));
    expect(card.getByLabelText("Sales start")).toHaveTextContent("Now");
    await user.click(card.getByLabelText("Sales start"));
    fireEvent.change(card.getByLabelText("Sales start"), { target: { value: "2030-06-01T10:00" } });
    await user.click(publishBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(eventPost(fetchMock.calls)!.body.ticket_tiers[0]).toMatchObject({
      secret_code: "VIP",
      is_hidden: true,
      sales_start: "2030-06-01T15:00:00.000Z",
    });
  });

  it("warns (without blocking) when every tier is hidden", async () => {
    const { user, fetchMock } = setup();
    await fillBasics(user);
    expect(screen.queryByText(/Every tier is hidden/)).not.toBeInTheDocument();
    await user.click(within(tierCard(1)).getByRole("switch", { name: /Hide tier/ }));
    expect(screen.getByText(/Every tier is hidden: the event page won’t offer any tickets/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Tier 2" }));
    expect(screen.queryByText(/Every tier is hidden/)).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Remove tier" })[1]!);
    await user.click(publishBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(eventPost(fetchMock.calls)!.body.ticket_tiers[0].is_hidden).toBe(true);
  });

  it("speaks Spanish", async () => {
    const { user } = setup({ language: "es" });
    expect(screen.getByRole("heading", { name: "Nuevo evento" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publicar evento" }));
    expect(screen.getByText("Ponle un nombre al evento.")).toBeInTheDocument();
  });
});

describe("/v2/organizer/create (server page)", () => {
  it.each(["organizer", "viewer"])("%s is sent back to the dashboard (POST /api/events requires owner/admin)", async (role) => {
    ctx.role = role;
    await expect(CreateEventPage({ searchParams: Promise.resolve({ org: "kora" }) })).rejects.toThrow("REDIRECT /v2/organizer?org=kora");
  });

  it.each(["owner", "admin"])("%s gets the form", async (role) => {
    ctx.role = role;
    const el = (await CreateEventPage({ searchParams: Promise.resolve({ org: "kora" }) })) as React.ReactElement<{ role: string }>;
    expect(el.type).toBe(CreateEvent);
    expect(el.props.role).toBe(role);
  });
});
