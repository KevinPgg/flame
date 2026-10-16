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
import EditEvent from "../../app/v2/organizer/event/[id]/edit/EditEvent";
import EditEventPage from "../../app/v2/organizer/event/[id]/edit/page";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => {
  push.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const EVENT = {
  id: "ev1",
  name: "Noche de Salsa",
  slug: "noche-de-salsa",
  organization_id: "org1",
  starts_at: "2030-06-16T02:00:00.000Z", // 15 Jun 21:00 Guayaquil
  ends_at: "2030-06-16T07:00:00.000Z", // 16 Jun 02:00
  venue: "Porto",
  city: "Guayaquil",
  description: "Line-up TBA",
  image_url: "https://cdn/old.jpg",
  currency: "USD",
  timezone: "America/Guayaquil",
  requires_rsvp: true,
  status: "published",
  pending_rsvps: 0,
  ticket_tiers: [
    { id: "t1", name: "General", price_cents: 2000, quantity_total: 100, quantity_sold: 3, sales_end: "2030-06-16T07:00:00.000Z" },
    { id: "t2", name: "VIP", price_cents: 5000, quantity_total: 20, quantity_sold: 0, sales_end: "2030-06-16T04:00:00.000Z" },
  ],
  purchases: [],
};

function setup(opts: { event?: Record<string, unknown>; extra?: Route[]; cohost?: boolean; language?: "en" | "es"; eventId?: string } = {}) {
  const ev = { ...EVENT, ...opts.event };
  const fetchMock = mockFetch([
    ...(opts.extra ?? []),
    {
      match: (u) => u.startsWith("/api/organizer/data"),
      body: opts.cohost
        ? { events: [], cohost_events: [{ event: ev, owner_org_name: "Other" }], owner_cohost_assignments: [] }
        : { events: [ev], cohost_events: [], owner_cohost_assignments: [] },
    },
    { match: (u) => u.startsWith("/api/places/autocomplete"), body: { predictions: [] } },
    { match: (u, i) => u === "/api/events" && i?.method === "PATCH", body: { id: "ev1" } },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup({ delay: null });
  renderV2(
    <QueryClientProvider client={client}>
      <EditEvent eventId={opts.eventId ?? "ev1"} organization={org} organizations={[org]} role="owner" />
    </QueryClientProvider>,
    opts.language
  );
  return { fetchMock, user };
}

const patches = (calls: Array<{ url: string; method: string; body: any }>) => calls.filter((c) => c.method === "PATCH");
const saveBtn = () => screen.getByRole("button", { name: "Save changes" });

describe("EditEvent v2", () => {
  it("pre-fills from the event (in its timezone) and shows what can't change as read-only", async () => {
    setup();
    expect(await screen.findByLabelText("Venue")).toHaveValue("Porto");
    expect(screen.getByLabelText("Starts")).toHaveValue("2030-06-15T21:00");
    expect(screen.getByLabelText("Ends")).toHaveValue("2030-06-16T02:00");
    expect(screen.getByLabelText("City")).toHaveValue("Guayaquil");
    expect(screen.getByLabelText("About")).toHaveValue("Line-up TBA");
    expect(screen.getByText("Noche de Salsa", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/\/events\/noche-de-salsa$/)).toBeInTheDocument();
    expect(screen.getByText("Ecuador (ECT, UTC-5)", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/^Yes · guests request/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Event name/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Edit in the Tiers tab/ })).toHaveAttribute("href", "/v2/organizer/event/ev1?org=kora&tab=tiers");
    expect(screen.getByRole("img", { name: "Add flyer" })).toHaveAttribute("src", "https://cdn/old.jpg");
  });

  it("sends only what changed and goes back to the event", async () => {
    const { user, fetchMock } = setup();
    const venue = await screen.findByLabelText("Venue");
    await user.clear(venue);
    await user.type(venue, "Luna Rooftop ");
    await user.click(saveBtn());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/v2/organizer/event/ev1?org=kora"));
    expect(patches(fetchMock.calls).map((c) => c.body)).toEqual([{ id: "ev1", venue: "Luna Rooftop" }]);
    expect(fetchMock.calls.some((c) => c.url === "/api/upload-image")).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("nothing changed → says so, sends nothing", async () => {
    const { user, fetchMock } = setup();
    await screen.findByLabelText("Venue");
    await user.click(saveBtn());
    expect(screen.getByText("There are no changes to save.")).toBeInTheDocument();
    expect(patches(fetchMock.calls)).toHaveLength(0);
  });

  it("a date change asks first (ticket holders get notified); cancel sends nothing, confirm sends both dates", async () => {
    const { user, fetchMock } = setup();
    fireEvent.change(await screen.findByLabelText("Starts"), { target: { value: "2030-06-15T22:00" } });
    await user.click(saveBtn());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/gets an email and a push notification/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(patches(fetchMock.calls)).toHaveLength(0);

    await user.click(saveBtn());
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Change date" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(patches(fetchMock.calls)[0]!.body).toEqual({
      id: "ev1",
      starts_at: "2030-06-16T03:00:00.000Z",
      ends_at: "2030-06-16T07:00:00.000Z",
    });
  });

  it("ending before a tier stops selling is blocked and names the tier", async () => {
    const { user, fetchMock } = setup();
    fireEvent.change(await screen.findByLabelText("Ends"), { target: { value: "2030-06-15T23:30" } });
    await user.click(saveBtn());
    expect(screen.getByText(/Change their sales end in the Tiers tab first/)).toBeInTheDocument();
    expect(screen.getByText("Tiers selling past the end: General")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(patches(fetchMock.calls)).toHaveLength(0);
  });

  it("event starting within 2 hours: dates locked, other fields still save without dates", async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const later = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const { user, fetchMock } = setup({ event: { starts_at: soon, ends_at: later } });
    expect(await screen.findByLabelText("Starts")).toBeDisabled();
    expect(screen.getByLabelText("Ends")).toBeDisabled();
    expect(screen.getByText(/its dates can’t change anymore/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("About"), " + guest DJ");
    await user.click(saveBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(patches(fetchMock.calls)[0]!.body).toEqual({ id: "ev1", description: "Line-up TBA + guest DJ" });
  });

  it("new flyer: uploads first, then saves its URL", async () => {
    const { user, fetchMock } = setup({ extra: [{ match: (u) => u === "/api/upload-image", body: { url: "https://cdn/new.jpg" } }] });
    await screen.findByLabelText("Venue");
    await user.upload(document.getElementById("ef-flyer") as HTMLInputElement, new File(["x"], "f.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByRole("img", { name: "Add flyer" })).toHaveAttribute("src", "blob:preview"));
    await user.click(saveBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(fetchMock.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/upload-image", "PATCH /api/events"]);
    expect((fetchMock.calls.find((c) => c.url === "/api/upload-image")!.body as FormData).get("eventId")).toBe("ev1");
    expect(patches(fetchMock.calls)[0]!.body).toEqual({ id: "ev1", image_url: "https://cdn/new.jpg" });
  });

  it("flyer upload fails → nothing is saved, the organizer is told", async () => {
    const { user, fetchMock } = setup({ extra: [{ match: (u) => u === "/api/upload-image", status: 500, body: {} }] });
    await screen.findByLabelText("Venue");
    await user.upload(document.getElementById("ef-flyer") as HTMLInputElement, new File(["x"], "f.png", { type: "image/png" }));
    await user.type(screen.getByLabelText("Venue"), "!");
    await user.click(saveBtn());
    expect(await screen.findByText(/The flyer didn’t upload, so nothing was saved/)).toBeInTheDocument();
    expect(patches(fetchMock.calls)).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
    expect(saveBtn()).toBeEnabled();
  });

  it("removing the saved flyer clears image_url", async () => {
    const { user, fetchMock } = setup();
    await screen.findByLabelText("Venue");
    await user.click(screen.getByRole("button", { name: "Remove flyer" }));
    expect(screen.queryByRole("img", { name: "Add flyer" })).not.toBeInTheDocument();
    await user.click(saveBtn());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(patches(fetchMock.calls)[0]!.body).toEqual({ id: "ev1", image_url: "" });
  });

  it("required fields: empty venue blocks saving", async () => {
    const { user, fetchMock } = setup();
    await user.clear(await screen.findByLabelText("Venue"));
    await user.click(saveBtn());
    expect(screen.getByText("Add the venue.")).toBeInTheDocument();
    expect(screen.getByLabelText("Venue")).toHaveFocus();
    expect(patches(fetchMock.calls)).toHaveLength(0);
  });

  it("API rejection is shown and the form stays", async () => {
    const { user } = setup({
      extra: [{ match: (u, i) => u === "/api/events" && i?.method === "PATCH", status: 400, body: { error: "Event start time must be at least 2 hours in the future" } }],
    });
    await user.type(await screen.findByLabelText("Venue"), "!");
    await user.click(saveBtn());
    expect(await screen.findByText("Event start time must be at least 2 hours in the future")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("co-hosted event: only the owner organization can edit", async () => {
    setup({ cohost: true });
    expect(await screen.findByText("Only the organization that owns this event can edit it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("unknown event (or not assigned to this organizer)", async () => {
    setup({ eventId: "nope" });
    expect(await screen.findByText("This event isn’t available.")).toBeInTheDocument();
  });

  it("speaks Spanish", async () => {
    setup({ language: "es" });
    expect(await screen.findByRole("heading", { name: "Editar evento" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Guardar cambios" })).toBeInTheDocument();
  });
});

describe("/v2/organizer/event/[id]/edit (server page)", () => {
  const call = () => EditEventPage({ params: Promise.resolve({ id: "ev1" }), searchParams: Promise.resolve({ org: "kora" }) });

  it("viewer goes back to the event page", async () => {
    ctx.role = "viewer";
    await expect(call()).rejects.toThrow("REDIRECT /v2/organizer/event/ev1?org=kora");
  });

  it.each(["owner", "admin", "organizer"])("%s gets the form (organizer: only assigned events reach it)", async (role) => {
    ctx.role = role;
    const el = (await call()) as React.ReactElement<{ eventId: string; role: string }>;
    expect(el.type).toBe(EditEvent);
    expect(el.props).toMatchObject({ eventId: "ev1", role });
  });
});
