/** Fase 2.5: Explore on the web (search by name, featured, organizers, host, FAQs). */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderV2 } from "./helpers";
import type { HomeEvent } from "../../app/lib/home-events";

const who = vi.hoisted(() => ({ signedIn: true, role: { role: "user", hasOrganization: false, organization: undefined as undefined | { approved: boolean } } }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, isSignedIn: who.signedIn }) }));
vi.mock("../../app/lib/hooks/useUserRole", () => ({ useUserRole: () => ({ data: who.role, isLoading: false }) }));
import ExploreView from "../../app/v2/attendee/explore/ExploreView";

vi.setConfig({ testTimeout: 20_000 });

const ev = (id: string, extra: Partial<HomeEvent> = {}): HomeEvent => ({
  id,
  name: `Event ${id}`,
  slug: `ev-${id}`,
  image_url: null,
  starts_at: "2026-11-07T03:00:00Z",
  ends_at: "2026-11-07T08:00:00Z",
  venue: "Club Uno",
  city: "Quito",
  requires_rsvp: false,
  currency: "USD",
  timezone: "America/Guayaquil",
  organizations: { name: "Sonar", slug: "sonar", logo_url: null },
  ticket_tiers: [{ id: "t", price_cents: 1500, quantity_total: 10, quantity_sold: 0, sales_start: null, sales_end: null, ticket_stages: [] }],
  ...extra,
});
const EVENTS = [ev("a"), ev("cumbia", { name: "Noche de Cúmbia", is_featured: true }), ev("gye", { venue: "La Bodega", city: "Guayaquil" })];
const ORGS = [
  { id: "o1", name: "Sonar", slug: "sonar", logo_url: null, cover_image_url: null, city: "Quito" },
  { id: "o2", name: "Club Rojo", slug: "club-rojo", logo_url: null, cover_image_url: "https://img/c.jpg", city: "Guayaquil" },
];

beforeEach(() => {
  who.signedIn = true;
  who.role = { role: "user", hasOrganization: false, organization: undefined };
});

describe("Explore (web)", () => {
  it("idle: featured first, organizers, host card to onboarding, FAQs with link to all", () => {
    renderV2(<ExploreView events={EVENTS} organizers={ORGS} failed={false} />);
    const links = screen.getAllByRole("link", { name: /^Event|^Noche/ }).map((a) => a.getAttribute("href"));
    expect(links[0]).toBe("/events/ev-cumbia");
    expect(screen.getByRole("link", { name: "See Club Rojo" })).toHaveAttribute("href", "/organizer/club-rojo");
    expect(screen.getByRole("link", { name: "Apply to host" })).toHaveAttribute("href", "/?onboarding=true");
    expect(screen.getByText("What is FLAME?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all FAQs" })).toHaveAttribute("href", "/faqs");
  });

  it("search by name, venue, city or organizer (accents don't matter); organizers by name; no results; clear", async () => {
    const user = userEvent.setup({ delay: null });
    renderV2(<ExploreView events={EVENTS} organizers={ORGS} failed={false} />);
    const box = screen.getByRole("searchbox", { name: "Search" });
    await user.type(box, "cumbia");
    expect(screen.getByText("1 result")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Noche de Cúmbia/ })).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "guayaquil");
    expect(screen.getByText("2 results")).toBeInTheDocument(); // Event gye + Club Rojo
    expect(screen.getByRole("link", { name: "See Club Rojo" })).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "zzz");
    expect(screen.getByText("No results")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    expect(screen.getByText("Featured events")).toBeInTheDocument();
  });

  it("host card: signed out → sign in then onboarding; approved → create; pending → under review", () => {
    who.signedIn = false;
    const a = renderV2(<ExploreView events={[]} organizers={[]} failed={false} />);
    expect(screen.getByRole("link", { name: "Apply to host" })).toHaveAttribute("href", "/sign-in?redirect_url=%2Fonboarding");
    a.unmount();
    who.signedIn = true;
    who.role = { role: "organizer", hasOrganization: true, organization: { approved: true } };
    const b = renderV2(<ExploreView events={[]} organizers={[]} failed={false} />);
    expect(screen.getByRole("link", { name: "Create an event" })).toHaveAttribute("href", "/organizer?tab=create-event");
    b.unmount();
    who.role = { role: "organizer", hasOrganization: true, organization: { approved: false } };
    renderV2(<ExploreView events={[]} organizers={[]} failed={false} />, "es");
    expect(screen.getByText("Tu organización está en revisión. Te avisaremos cuando la aprueben.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Postular como organizador" })).not.toBeInTheDocument();
  });

  it("fase 4.4: artists from the line-up lead to their next event; organizer cards show followers", async () => {
    const user = userEvent.setup({ delay: null });
    const withLineup = [ev("a", { lineup: [{ name: "Perdomo" }] } as Partial<HomeEvent>), ev("b", { name: "Sunset", lineup: [{ name: "perdómo" }] } as Partial<HomeEvent>)];
    renderV2(<ExploreView events={withLineup} organizers={[{ ...ORGS[1]!, followers_count: 1161 }]} failed={false} />);
    expect(screen.getByText("Guayaquil · 1161 followers")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "perdomo");
    expect(screen.getByRole("heading", { name: "Artists" })).toBeInTheDocument();
    const artist = screen.getByRole("link", { name: /Perdomo/ });
    expect(artist).toHaveAttribute("href", "/events/ev-a");
    expect(artist).toHaveTextContent("Next: Event a · +1 more event");
    expect(screen.getByText("3 results")).toBeInTheDocument(); // 1 artist + 2 events
  });

  it("fase 4.4: recent searches (this browser), newest first, clear", async () => {
    window.localStorage.clear();
    const user = userEvent.setup({ delay: null });
    renderV2(<ExploreView events={EVENTS} organizers={ORGS} failed={false} />);
    const box = screen.getByRole("searchbox", { name: "Search" });
    await user.type(box, "cumbia{Enter}");
    await user.clear(box);
    expect(screen.getByRole("heading", { name: "Recent searches" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("flame.recentSearches")!)).toEqual(["cumbia"]);
    await user.click(screen.getByRole("button", { name: /cumbia/ }));
    expect(screen.getByText("1 result")).toBeInTheDocument();
    await user.clear(box);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("heading", { name: "Recent searches" })).not.toBeInTheDocument();
  });
});
