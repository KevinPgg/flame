/** Fase 2.2: Flame 2.0 Home on the web. */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { feedDayTitle } from "@project-flame/lib";
import { renderV2 } from "./helpers";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: nav.refresh }) }));
import HomeView from "../../app/v2/attendee/home/HomeView";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => nav.refresh.mockReset());

const H = 3600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const tier = (price_cents: number, extra: Record<string, unknown> = {}) => ({
  id: `t${price_cents}`,
  price_cents,
  quantity_total: 100,
  quantity_sold: 0,
  sales_start: null,
  sales_end: null,
  ticket_stages: [],
  ...extra,
});
const ev = (id: string, city: string, startH: number, extra: Record<string, unknown> = {}) =>
  ({
    id,
    slug: `slug-${id}`,
    name: `Event ${id}`,
    image_url: `https://img/${id}.jpg`,
    starts_at: iso(startH * H),
    ends_at: iso((startH + 5) * H),
    venue: "Club",
    city,
    requires_rsvp: false,
    currency: "USD",
    timezone: "America/Guayaquil",
    organizations: { name: `Org ${id}`, slug: `org-${id}`, logo_url: null },
    ticket_tiers: [tier(1500), tier(2500)],
    ...extra,
  }) as never;

const EVENTS = [ev("live", "Quito", -1), ev("later", "Quito", 96, { requires_rsvp: true, ticket_tiers: [tier(1500, { quantity_sold: 100 })] }), ev("gye", "Guayaquil", 100)];

describe("Home (web)", () => {
  it("Quito by default; days; full-flyer cards linking to the public event and organizer pages", () => {
    renderV2(<HomeView events={EVENTS} failed={false} />);
    expect(screen.getByRole("button", { name: "Change city: Quito" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Happening now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: feedDayTitle({ sample: iso(96 * H), timezone: "America/Guayaquil" }, "en-US") })).toBeInTheDocument();
    const live = screen.getByRole("link", { name: /^Event live/ });
    expect(live).toHaveAttribute("href", "/events/slug-live");
    expect(within(live).getByText("From $15.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Org live/ })).toHaveAttribute("href", "/organizer/org-live");
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(screen.getByText("RSVP")).toBeInTheDocument();
    expect(screen.queryByText("Event gye")).not.toBeInTheDocument();
  });

  it("city picker: counts, choose a city, back to all; nothing is remembered", async () => {
    const user = userEvent.setup({ delay: null });
    renderV2(<HomeView events={EVENTS} failed={false} />);
    await user.click(screen.getByRole("button", { name: "Change city: Quito" }));
    expect(screen.getByRole("radio", { name: "All cities, 3 events" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Quito, 2 events" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Guayaquil, 1 event" }));
    expect(screen.getByText("Event gye")).toBeInTheDocument();
    expect(screen.queryByText("Event live")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change city: Guayaquil" }));
    await user.click(screen.getByRole("radio", { name: "All cities, 3 events" }));
    expect(screen.getByText("Event gye")).toBeInTheDocument();
    expect(screen.getByText("Event live")).toBeInTheDocument();
  });

  it("city picker closes with a click outside the box, not with a click inside", async () => {
    const user = userEvent.setup({ delay: null });
    renderV2(<HomeView events={EVENTS} failed={false} />);
    await user.click(screen.getByRole("button", { name: "Change city: Quito" }));
    const dialog = screen.getByRole("dialog", { name: "Where are you going out?" });
    fireEvent.click(screen.getByText("Pick a city, or see everything on Flame."));
    expect(screen.getByRole("dialog", { name: "Where are you going out?" })).toBeInTheDocument();
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ left: 100, right: 400, top: 100, bottom: 500, width: 300, height: 400, x: 100, y: 100, toJSON: () => ({}) });
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(screen.queryByRole("dialog", { name: "Where are you going out?" })).not.toBeInTheDocument();
  });

  it("no Quito events → all cities; no events at all; load error retries", async () => {
    const { unmount } = renderV2(<HomeView events={[ev("a", "Cuenca", 30)]} failed={false} />);
    expect(screen.getByRole("button", { name: "Change city: All cities" })).toBeInTheDocument();
    unmount();
    const r2 = renderV2(<HomeView events={[]} failed={false} />);
    expect(screen.getByText("No upcoming events yet")).toBeInTheDocument();
    r2.unmount();
    renderV2(<HomeView events={[]} failed />);
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Try again" }));
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("share copies the public link when the browser can't share", async () => {
    const user = userEvent.setup({ delay: null }); // installs its own clipboard: replace it after
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    renderV2(<HomeView events={EVENTS} failed={false} />);
    await user.click(screen.getByRole("button", { name: "Share Event live" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/events\/slug-live$/));
    expect(await screen.findByRole("status")).toHaveTextContent("Link copied");
  });

  it("Spanish", () => {
    renderV2(<HomeView events={EVENTS} failed={false} />, "es");
    expect(screen.getByRole("heading", { name: "Ahora mismo" })).toBeInTheDocument();
    expect(screen.getByText("Desde $15.00")).toBeInTheDocument();
    expect(screen.getByText("Agotado")).toBeInTheDocument();
  });
});
