/** Fase 2.4: event page header, "More from", and the public organizer profile (web). */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderV2 } from "./helpers";
import { EventHeader, EventTopBar, type EventHeaderData } from "../../app/v2/attendee/events/[slug]/EventHeader";
import { MoreFromOrganizer } from "../../app/v2/attendee/events/[slug]/MoreFromOrganizer";
import OrganizerProfile from "../../app/v2/attendee/organizer/[slug]/OrganizerProfile";
import { __resetFollowing } from "../../app/v2/attendee/useFollowing";
import type { HomeEvent } from "../../app/lib/home-events";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());

const EVENT: EventHeaderData = {
  name: "Noche Larga",
  slug: "noche-larga",
  description: "Line one\nLine two\nLine three\nLine four with https://flme.co link",
  image_url: "https://img/flyer.jpg",
  starts_at: "2026-10-31T03:00:00Z",
  ends_at: "2026-10-31T08:00:00Z",
  timezone: "America/Guayaquil",
  venue: "Club Uno",
  city: "Quito",
  requires_rsvp: true,
  organizations: { name: "Club Uno", slug: "club-uno", logo_url: null },
  cohost_org_names: ["Sonar"],
};

const tile = (id: string, extra: Partial<HomeEvent> = {}): HomeEvent => ({
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
  organizations: { name: "Club Uno", slug: "club-uno", logo_url: null },
  ticket_tiers: [{ id: "t", price_cents: 1500, quantity_total: 10, quantity_sold: 0, sales_start: null, sales_end: null, ticket_stages: [] }],
  ...extra,
});

describe("event page header (web)", () => {
  it("organizer and co-host link to the profile; big title; when, where with directions; RSVP note", () => {
    renderV2(<EventHeader event={EVENT} />);
    expect(screen.getByRole("link", { name: /Club Uno & Sonar/ })).toHaveAttribute("href", "/organizer/club-uno");
    expect(screen.getByRole("heading", { level: 1, name: "Noche Larga" })).toBeInTheDocument();
    expect(screen.getByText(/^Fri, Oct 30 · 10:00\sPM – 3:00\sAM$/)).toBeInTheDocument();
    expect(screen.getByText("Club Uno, Quito")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Directions" })).toHaveAttribute("href", expect.stringContaining("Club%20Uno%2C%20Quito"));
    expect(screen.getByText("RSVP required — the organizer approves each request")).toBeInTheDocument();
  });

  it("description in 3 lines with More / Less; links stay clickable", async () => {
    const user = userEvent.setup({ delay: null });
    renderV2(<EventHeader event={EVENT} />);
    expect(screen.getByTestId("event-description")).toHaveClass("line-clamp-3");
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByTestId("event-description")).not.toHaveClass("line-clamp-3");
    expect(screen.getByRole("button", { name: "Less" })).toBeInTheDocument();
    expect(within(screen.getByTestId("event-description")).getByRole("link")).toHaveAttribute("href", "https://flme.co");
  });

  it("share copies the public link when the browser can't share; Spanish", async () => {
    const user = userEvent.setup({ delay: null });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });
    // Share lives in the fixed top bar since 2026-10-28 (the header no longer has it).
    const { unmount } = renderV2(
      <>
        <EventTopBar id="ev-noche" slug="noche-larga" name="Noche Larga" />
        <EventHeader event={{ ...EVENT, description: null, requires_rsvp: false }} />
      </>,
    );
    expect(screen.getAllByRole("button", { name: "Share event" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Share event" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/events/noche-larga`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    expect(screen.queryByText(/RSVP required/)).not.toBeInTheDocument();
    unmount();
    renderV2(<EventHeader event={EVENT} />, "es");
    expect(screen.getByText("Cuándo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cómo llegar" })).toBeInTheDocument();
  });

  it("More from the organizer: tiles to the event pages; nothing when empty", () => {
    const { container, unmount } = renderV2(<MoreFromOrganizer organizer="Club Uno" events={[]} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    renderV2(<MoreFromOrganizer organizer="Club Uno" events={[tile("a"), tile("b", { requires_rsvp: true })]} />);
    expect(screen.getByRole("heading", { name: "More from Club Uno" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Event a/ })).toHaveAttribute("href", "/events/ev-a");
    expect(screen.getAllByText("$15.00")).toHaveLength(2);
    expect(screen.getByText("RSVP")).toBeInTheDocument();
  });
});

describe("organizer profile (web)", () => {
  const ORG = {
    id: "o1",
    name: "Club Uno",
    slug: "club-uno",
    description: "Techno every Friday",
    city: "Quito",
    instagram_handle: "@clubuno",
    logo_url: "https://img/logo.png",
    cover_image_url: null,
  };

  it("cover from the logo when there's none, name, city, Instagram, upcoming grid; past tab", async () => {
    const user = userEvent.setup({ delay: null });
    renderV2(<OrganizerProfile org={ORG} upcoming={[tile("a"), tile("b")]} past={[tile("old")]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Club Uno" })).toBeInTheDocument();
    expect(screen.getByTestId("org-cover").getAttribute("style")).toContain("https://img/logo.png");
    expect(screen.getByRole("link", { name: "Instagram @clubuno" })).toHaveAttribute("href", "https://instagram.com/clubuno");
    expect(screen.getByText("2 upcoming events")).toBeInTheDocument();
    expect(screen.getByText("Techno every Friday")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Event a/ })).toHaveAttribute("href", "/events/ev-a");
    // Upcoming use the Home full-flyer card (Kevin 2026-11-05): organizer row + share on each one.
    expect(screen.getAllByRole("button", { name: /Share .*Event/ })).toHaveLength(2);
    await user.click(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByRole("link", { name: /Event old/ })).toBeInTheDocument();
    expect(screen.queryByText("$15.00")).not.toBeInTheDocument(); // no price on past events
  });

  it("followers and Follow (fase 4.2): the count moves with the button; signed in", async () => {
    __resetFollowing();
    const ORG_ID = "11111111-1111-4111-8111-111111111111";
    const calls: Array<{ method: string; body: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url === "/api/me/following" && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify({ organizations: [] }));
        if (url === "/api/me/following") return new Response(JSON.stringify({ organization_id: ORG_ID, following: true, followers_count: 13 }));
        return new Response("{}", { status: 404 });
      })
    );
    const user = userEvent.setup({ delay: null });
    renderV2(<OrganizerProfile org={{ ...ORG, id: ORG_ID, followers_count: 12 }} upcoming={[]} past={[]} />);
    expect(screen.getByTestId("org-followers")).toHaveTextContent("12 followers");
    await user.click(screen.getByRole("button", { name: "Follow Club Uno" }));
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ organization_id: ORG_ID, following: true });
    expect(await screen.findByRole("button", { name: "Unfollow Club Uno" })).toHaveTextContent("Following");
    expect(screen.getByTestId("org-followers")).toHaveTextContent("13 followers");
    vi.unstubAllGlobals();
    __resetFollowing();
  });

  it("no upcoming events; Spanish", () => {
    renderV2(<OrganizerProfile org={{ ...ORG, instagram_handle: null }} upcoming={[]} past={[]} />, "es");
    expect(screen.getByText("Por ahora no hay eventos próximos.")).toBeInTheDocument();
    expect(screen.getByText("Los nuevos eventos de Club Uno aparecerán aquí.")).toBeInTheDocument();
  });
});

describe("line-up on the event page (fase 4.3)", () => {
  it("one tile per artist with its links; nothing when the line-up is empty or junk", async () => {
    const { Lineup } = await import("../../app/v2/attendee/events/[slug]/Lineup");
    renderV2(
      <Lineup lineup={[{ name: "DJ Mila Q", instagram: "mila.q", spotify: "https://open.spotify.com/artist/1" }, { name: "Perdomo" }, { name: "" }]} />
    );
    expect(screen.getByRole("heading", { name: "Lineup" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("MQ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DJ Mila Q on Instagram" })).toHaveAttribute("href", "https://instagram.com/mila.q");
    expect(screen.getByRole("link", { name: "DJ Mila Q on Spotify" })).toHaveAttribute("href", "https://open.spotify.com/artist/1");
    renderV2(<Lineup lineup={null} />);
    renderV2(<Lineup lineup={[{ name: "  " }, "x"]} />);
    expect(screen.getAllByRole("heading", { name: "Lineup" })).toHaveLength(1);
  });
});
