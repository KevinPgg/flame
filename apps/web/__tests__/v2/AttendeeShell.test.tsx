/** Fase 2.1: attendee frame on the web + the bell (panel on a computer, page on a phone). */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

const nav = vi.hoisted(() => ({ push: vi.fn(), path: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => nav.path,
}));
const user = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, isSignedIn: user.signedIn, user: { id: "u1" } }) }));

import { AttendeeShell, activeAttendeeTab } from "../../app/v2/attendee/AttendeeShell";
import { NotificationsList, timeAgo } from "../../app/v2/attendee/NotificationsList";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => {
  nav.push.mockReset();
  nav.path = "/";
  user.signedIn = true;
});
afterEach(() => vi.unstubAllGlobals());

const now = Date.now();
const N = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "rsvp_approved",
  title: `Title ${id}`,
  body: `Body ${id}`,
  read: false,
  created_at: new Date(now - 5 * 60_000).toISOString(),
  image: null,
  href: "/account",
  ...extra,
});

function setup(ui: React.ReactElement, opts: { items?: unknown[]; routes?: Route[]; language?: "en" | "es" } = {}) {
  const f = mockFetch([
    ...(opts.routes ?? []),
    { match: (u, i) => u === "/api/me/notifications" && !i?.method, body: { notifications: opts.items ?? [N("a"), N("b", { read: true, href: null })] } },
    { match: (u, i) => u === "/api/me/notifications" && i?.method === "PATCH", body: { success: true } },
    { match: (u, i) => u === "/api/me/notifications" && i?.method === "DELETE", body: { success: true } },
  ]);
  renderV2(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>, opts.language);
  return { f, u: userEvent.setup({ delay: null }) };
}

describe("attendee frame (web)", () => {
  it("four sections at their public URLs, the current one marked; search, bell and Settings", async () => {
    nav.path = "/account";
    setup(<AttendeeShell><p>body</p></AttendeeShell>);
    const desk = screen.getAllByRole("navigation", { name: "Main" })[0];
    expect(within(desk).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/", "/discover", "/account", "/profile"]);
    expect(within(desk).getByRole("link", { name: "Tickets" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/discover");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/v2/account");
    expect(await screen.findByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Notifications, 1 unread" })).toHaveAttribute("href", "/notifications");
    // One bell per screen size: the panel bell must not carry a bare inline-flex next to hidden
    // (Tailwind 4 let it win and phones showed two bells, 2026-10-27).
    const panelBell = screen.getByRole("button", { name: "Notifications, 1 unread" }).className.split(/\s+/);
    expect(panelBell).toContain("hidden");
    expect(panelBell).not.toContain("inline-flex");
    expect(screen.getByRole("link", { name: "Notifications, 1 unread" }).className.split(/\s+/)).toEqual(expect.arrayContaining(["inline-flex", "lg:hidden"]));
  });

  it("signed out: Tickets and You lead to sign in, no bell, a Sign in button", () => {
    user.signedIn = false;
    nav.path = "/discover";
    const { f } = setup(<AttendeeShell><p /></AttendeeShell>);
    const desk = screen.getAllByRole("navigation", { name: "Main" })[0];
    expect(within(desk).getByRole("link", { name: "Tickets" })).toHaveAttribute("href", "/sign-in?redirect_url=%2Faccount");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in?redirect_url=%2Fdiscover");
    expect(screen.queryByRole("button", { name: /Notifications/ })).not.toBeInTheDocument();
    expect(f.calls.some((c) => c.url.startsWith("/api/me/notifications"))).toBe(false);
  });

  it("footer keeps the v1 legal and contact links", () => {
    setup(<AttendeeShell><p /></AttendeeShell>);
    const foot = screen.getByRole("navigation", { name: "Footer" });
    for (const [name, href] of [["Privacy policy", "/privacy-policy"], ["Terms of use", "/terms-of-use"], ["Purchase terms", "/purchase-terms"], ["Organizer agreement", "/organizer-agreement"], ["Cookie settings", "/cookie-settings"], ["FAQs", "/faqs"]]) {
      expect(within(foot).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByRole("link", { name: "support@flme.co" })).toHaveAttribute("href", "mailto:support@flme.co");
  });

  it("which section a path is", () => {
    expect(activeAttendeeTab("/")).toBe("home");
    expect(activeAttendeeTab("/discover")).toBe("explore");
    expect(activeAttendeeTab("/account/ticket/1")).toBe("tickets");
    expect(activeAttendeeTab("/profile")).toBe("you");
    expect(activeAttendeeTab("/events/x")).toBeNull();
  });

  it("computer: the bell opens a panel; Esc and opening a notification close it", async () => {
    const { u } = setup(<AttendeeShell><p /></AttendeeShell>);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    await u.click(bell);
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByRole("link", { name: "See all" })).toHaveAttribute("href", "/notifications");
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
    await u.click(bell);
    await u.click(within(screen.getByRole("dialog", { name: "Notifications" })).getByRole("button", { name: /^Title a/ }));
    expect(nav.push).toHaveBeenCalledWith("/account");
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
  });
});

describe("notifications list", () => {
  it("opening an unread one marks it read and goes where it points; one without a link only marks", async () => {
    const { f, u } = setup(<NotificationsList heading="h1" />);
    await u.click(await screen.findByRole("button", { name: /^Title a/ }));
    await waitFor(() => expect(f.posts().find((p) => p.method === "PATCH")!.body).toEqual({ ids: ["a"] }));
    expect(nav.push).toHaveBeenCalledWith("/account");
    nav.push.mockReset();
    await u.click(screen.getByRole("button", { name: /^Title b/ }));
    expect(nav.push).not.toHaveBeenCalled();
    expect(f.posts().filter((p) => p.method === "PATCH")).toHaveLength(1);
  });

  it("mark all read; delete one with its own button", async () => {
    const { f, u } = setup(<NotificationsList heading="h1" />);
    await u.click(await screen.findByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(f.posts()[0].body).toEqual({ all: true }));
    expect(screen.queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Delete notification: Title b" }));
    await waitFor(() => expect(f.posts().find((p) => p.method === "DELETE")!.body).toEqual({ ids: ["b"] }));
    expect(screen.queryByText("Title b")).not.toBeInTheDocument();
  });

  it("clear all asks first when some are unread", async () => {
    const { f, u } = setup(<NotificationsList heading="h1" />);
    await u.click(await screen.findByRole("button", { name: "Clear all" }));
    expect(screen.getByText("1 is still unread. This can’t be undone.")).toBeInTheDocument();
    expect(f.posts()).toHaveLength(0);
    const confirm = screen.getAllByRole("button", { name: "Clear all" }).at(-1)!;
    await u.click(confirm);
    await waitFor(() => expect(f.posts()[0]).toMatchObject({ method: "DELETE", body: { all: true } }));
    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });

  it("clear all with everything read goes straight away; a failure brings them back and says so", async () => {
    const { f, u } = setup(<NotificationsList heading="h1" />, {
      items: [N("a", { read: true })],
      routes: [{ match: (url, i) => url === "/api/me/notifications" && i?.method === "DELETE", status: 500, body: {} }],
    });
    await u.click(await screen.findByRole("button", { name: "Clear all" }));
    expect(f.posts()[0]).toMatchObject({ method: "DELETE", body: { all: true } });
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t clear your notifications");
    expect(screen.getByText("Title a")).toBeInTheDocument();
  });

  it("empty, error with retry, flyer thumbnail, rejection shown whole", async () => {
    setup(<NotificationsList heading="h1" />, { items: [N("r", { type: "organization_rejected", body: "Kora wasn’t approved. Reason: long", image: null }), N("e", { image: "https://img/x.jpg" })] });
    const body = await screen.findByText("Kora wasn’t approved. Reason: long");
    expect(body.className).not.toContain("line-clamp");
    expect(document.querySelector('img[src="https://img/x.jpg"]')).not.toBeNull();
  });

  it("load error → retry", async () => {
    setup(<NotificationsList heading="h1" />, { routes: [{ match: (u, i) => u === "/api/me/notifications" && !i?.method, status: 500, body: {} }] });
    expect(await screen.findByText("We couldn’t load your notifications.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("Spanish, and time in words", async () => {
    setup(<NotificationsList heading="h1" />, { language: "es", items: [] });
    expect(await screen.findByText("Aún no tienes notificaciones")).toBeInTheDocument();
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString(), "en-US", now)).toBe("5 min. ago");
    expect(timeAgo(new Date(now - 26 * 3600_000).toISOString(), "en-US", now)).toBe("yesterday");
  });
});
