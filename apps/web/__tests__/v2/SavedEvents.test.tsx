/** Fase 4.1 Guardar eventos (web): the heart on cards and the shared store. */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderV2, mockFetch } from "./helpers";
import { EventTile } from "../../app/v2/attendee/EventTile";
import { SaveButton } from "../../app/v2/attendee/SaveButton";
import { __resetSavedEvents } from "../../app/v2/attendee/useSavedEvents";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => __resetSavedEvents());
afterEach(() => vi.unstubAllGlobals());

const EV = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "biblos",
  name: "Biblos",
  image_url: null,
  starts_at: new Date(Date.now() + 86400_000).toISOString(),
  ends_at: new Date(Date.now() + 2 * 86400_000).toISOString(),
  venue: "Club",
  city: "Quito",
  requires_rsvp: false,
  currency: "USD",
  timezone: "America/Guayaquil",
  organizations: null,
  ticket_tiers: [],
} as never;

const isGet = (u: string, i?: RequestInit) => u === "/api/me/saved-events" && (i?.method ?? "GET") === "GET";
const isPut = (u: string, i?: RequestInit) => u === "/api/me/saved-events" && i?.method === "PUT";

describe("heart", () => {
  it("saves and un-saves with PUT; every heart of the same event follows", async () => {
    const f = mockFetch([
      { match: isGet, body: { events: [] } },
      { match: isPut, body: {} },
    ]);
    const user = userEvent.setup({ delay: null });
    renderV2(
      <>
        <EventTile event={EV} />
        <SaveButton event={{ id: (EV as any).id, name: "Biblos" }} variant="circle" />
      </>
    );
    await waitFor(() => expect(f.calls.some((c) => c.method === "GET")).toBe(true));
    const [first] = screen.getAllByRole("button", { name: "Save Biblos" });
    await user.click(first!);
    expect(f.posts()[0]).toMatchObject({ method: "PUT", body: { event_id: (EV as any).id, saved: true } });
    const pressed = screen.getAllByRole("button", { name: "Remove Biblos from saved" });
    expect(pressed).toHaveLength(2);
    pressed.forEach((b) => expect(b).toHaveAttribute("aria-pressed", "true"));

    await user.click(pressed[1]!);
    expect(f.posts()[1]).toMatchObject({ body: { event_id: (EV as any).id, saved: false } });
    expect(screen.getAllByRole("button", { name: "Save Biblos" })).toHaveLength(2);
  });

  it("starts filled when the event is already saved", async () => {
    mockFetch([{ match: isGet, body: { events: [EV] } }]);
    renderV2(<EventTile event={EV} />);
    expect(await screen.findByRole("button", { name: "Remove Biblos from saved" })).toHaveAttribute("aria-pressed", "true");
  });

  it("goes back to empty if the API fails", async () => {
    mockFetch([
      { match: isGet, body: { events: [] } },
      { match: isPut, status: 500, body: {} },
    ]);
    const user = userEvent.setup({ delay: null });
    renderV2(<EventTile event={EV} />);
    await user.click(await screen.findByRole("button", { name: "Save Biblos" }));
    expect(await screen.findByRole("button", { name: "Save Biblos" })).toHaveAttribute("aria-pressed", "false");
  });

  it("signed out: the heart sends you to sign in and back", async () => {
    const f = mockFetch([{ match: isGet, status: 401, body: {} }]);
    const assign = vi.fn();
    Object.assign(window.location, { pathname: "/events/biblos", search: "", assign });
    const user = userEvent.setup({ delay: null });
    renderV2(<EventTile event={EV} />);
    await waitFor(() => expect(f.calls).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Save Biblos" }));
    expect(assign).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fevents%2Fbiblos");
    expect(f.posts()).toHaveLength(0);
  });

  it("a past event card has no heart", () => {
    mockFetch([{ match: isGet, body: { events: [] } }]);
    renderV2(<EventTile event={EV} past />);
    expect(screen.queryByRole("button", { name: "Save Biblos" })).not.toBeInTheDocument();
  });
});
