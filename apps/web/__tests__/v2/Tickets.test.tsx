/** Fase 2.3: My tickets and the QR ticket on the web (move between tickets without reloading). */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserTicket } from "@project-flame/lib";
import { renderV2 } from "./helpers";

const state = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() }));
vi.mock("../../app/lib/hooks/useUserTickets", () => ({ useUserTickets: () => state }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async (v: string) => `data:qr,${JSON.parse(v).qrToken}`) } }));
import WalletView from "../../app/v2/attendee/tickets/WalletView";
import TicketView from "../../app/v2/attendee/tickets/[id]/TicketView";

vi.setConfig({ testTimeout: 20_000 });

const D = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const event = (id: string, inDays: number) => ({
  id,
  name: `Event ${id}`,
  slug: `ev-${id}`,
  description: "",
  image_url: "",
  starts_at: iso(inDays * D),
  ends_at: iso(inDays * D + 5 * 3600_000),
  venue: "Club Uno",
  city: "Quito",
  timezone: "America/Guayaquil",
  currency: "USD",
  organization: { name: `Org ${id}` },
});
const SOON = event("soon", 3);
const OLD = event("old", -30);
const tk = (id: string, e: ReturnType<typeof event>, tier: string, daysAgo: number, extra: Partial<UserTicket> = {}): UserTicket => ({
  id,
  type: "ticket",
  status: "issued",
  created_at: iso(-daysAgo * D),
  qr_code: `https://qr/${id}.png`,
  attendee_name: `Holder ${id}`,
  ticket_tier: { id: `${e.id}-${tier}`, name: tier, price_cents: 1500, event: e },
  order: { id: `o-${id}`, quantity: 1, total_cents: 1749, created_at: iso(-daysAgo * D) },
  ...extra,
});
const ROWS: UserTicket[] = [
  tk("t2", SOON, "VIP", 1),
  tk("t1", SOON, "GA", 2),
  tk("promo", SOON, "GA", 0, { type: "promotional", qr_code: undefined, qr_token: "tok-promo", order: undefined }),
  tk("past1", OLD, "GA", 40, { status: "checked_in" }),
  { id: "r1", type: "rsvp", status: "rejected", created_at: iso(-D), requested_quantity: 1, ticket_tier: { id: "l-GA", name: "GA", price_cents: 0, event: event("later", 10) } },
];

beforeEach(() => {
  Object.assign(state, { data: { tickets: ROWS }, isLoading: false, isError: false, refetch: vi.fn() });
  vi.mocked(window.history.replaceState).mockClear();
});

describe("My tickets (web)", () => {
  it("counters, one card per event linking to its first ticket, requests with their state", () => {
    renderV2(<WalletView />);
    expect(screen.getByText("Purchased").previousSibling).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: "Show tickets for Event soon" })).toHaveAttribute("href", "/account/ticket/t1");
    expect(screen.getByText("3 tickets · GA, VIP")).toBeInTheDocument();
    expect(screen.getByText("RSVP · not approved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See event" })).toHaveAttribute("href", "/events/ev-later");
  });

  it("past tab; empty; Spanish", async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = renderV2(<WalletView />);
    await user.click(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByText("Event old")).toBeInTheDocument();
    expect(screen.getByText("Attended")).toBeInTheDocument();
    unmount();
    state.data = { tickets: [] };
    const second = renderV2(<WalletView />, "es");
    expect(screen.getByText("Aún no tienes tickets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buscar eventos" })).toHaveAttribute("href", "/");
    second.unmount();
  });
});

describe("QR ticket (web)", () => {
  it("all tickets of the event in one strip; chips and arrows switch and the address follows without navigating", async () => {
    const user = userEvent.setup({ delay: null });
    renderV2(<TicketView id="t2" />);
    expect(screen.getByText("Ticket 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Holder t1")).toBeInTheDocument();
    expect(screen.getByText("Holder t2")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByAltText("QR")).toHaveLength(3));
    await user.click(screen.getByRole("tab", { name: "Ticket 3" }));
    expect(screen.getByText("Ticket 3 of 3")).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(window.history.replaceState).mock.calls.at(-1)?.[2]).toBe("/account/ticket/promo"));
    expect(screen.getByText("Courtesy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous ticket" }));
    expect(screen.getByText("Ticket 2 of 3")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Ticket 1 of 3")).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(window.history.replaceState).mock.calls.at(-1)?.[2]).toBe("/account/ticket/t1"));
  });

  it("jumping 1 → 3 doesn't flicker through 2 while the strip glides; a swipe afterwards still moves it", async () => {
    const user = userEvent.setup({ delay: null });
    renderV2(<TicketView id="t1" />);
    const strip = screen.getByTestId("ticket-strip");
    Object.defineProperty(strip, "clientWidth", { configurable: true, value: 100 });
    strip.scrollTo = vi.fn();
    const scrollTo = (x: number) => {
      strip.scrollLeft = x;
      fireEvent.scroll(strip);
    };
    await user.click(screen.getByRole("tab", { name: "Ticket 3" }));
    expect(screen.getByText("Ticket 3 of 3")).toBeInTheDocument();
    scrollTo(60); // passing over ticket 2
    scrollTo(100);
    expect(screen.getByText("Ticket 3 of 3")).toBeInTheDocument();
    scrollTo(200); // arrived
    expect(screen.getByText("Ticket 3 of 3")).toBeInTheDocument();
    scrollTo(100); // the person swipes back
    expect(screen.getByText("Ticket 2 of 3")).toBeInTheDocument();
  });

  it("the strips slide without a visible scrollbar", () => {
    renderV2(<TicketView id="t1" />);
    expect(screen.getByTestId("ticket-strip")).toHaveClass("v2-no-scrollbar");
    expect(screen.getByTestId("ticket-strip").style.scrollbarWidth).toBe("none");
    expect(screen.getByRole("tablist")).toHaveClass("v2-no-scrollbar");
  });

  it("courtesy QR keeps v1's content; zoom opens on white and closes with a click or Esc", async () => {
    const user = userEvent.setup({ delay: null });
    renderV2(<TicketView id="promo" />);
    await waitFor(() => expect(screen.getAllByAltText("QR").map((i) => i.getAttribute("src"))).toContain("data:qr,tok-promo"));
    await user.click(screen.getByRole("button", { name: "Enlarge QR" }));
    expect(screen.getByRole("dialog", { name: "Enlarge QR" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enlarge QR" }));
    await user.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("directions, help, back; price and organizer of the shown ticket", () => {
    renderV2(<TicketView id="t1" />);
    expect(screen.getByRole("link", { name: "Directions" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=Club%20Uno%2C%20Quito");
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/account");
    expect(screen.getByText("$17.49")).toBeInTheDocument();
    expect(screen.getByText("Org soon")).toBeInTheDocument();
  });

  it("not found and a lone past ticket", () => {
    const { unmount } = renderV2(<TicketView id="nope" />);
    expect(screen.getByText("We couldn’t find this ticket")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my tickets" })).toHaveAttribute("href", "/account");
    unmount();
    renderV2(<TicketView id="past1" />);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("Already used at the door")).toBeInTheDocument();
  });
});
