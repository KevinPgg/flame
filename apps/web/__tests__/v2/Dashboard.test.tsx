import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/v2/organizer",
  useSearchParams: () => new URLSearchParams("org=kora"),
  redirect: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isSignedIn: true, isLoaded: true }) }));
vi.mock("../../app/contexts/MemberRoleContext", () => ({ useMemberRoleContext: () => ({ setSelectedOrgId: vi.fn() }) }));
vi.mock("../../app/components/modals/OnboardingModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog">Onboarding</div> : null),
}));
import OrganizerDashboard from "../../app/v2/organizer/OrganizerDashboard";
import OrganizersList from "../../app/v2/organizer/OrganizersList";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const day = 86_400_000;
const ev = (id: string, name: string, inDays: number, over: Record<string, unknown> = {}) => ({
  id,
  name,
  organization_id: "org1",
  starts_at: new Date(Date.now() + inDays * day).toISOString(),
  ends_at: new Date(Date.now() + (inDays + 0.25) * day).toISOString(),
  timezone: "America/Guayaquil",
  venue: "Bar Uno",
  city: "Guayaquil",
  currency: "USD",
  totalRevenue: 0,
  totalAttendees: 0,
  pending_rsvps: 0,
  ticket_tiers: [],
  ...over,
});
const DATA = {
  events: [
    ev("a", "Salsa Night", 5, { totalRevenue: 125_000, totalAttendees: 80, requires_rsvp: true, pending_rsvps: 3 }),
    ev("b", "Carnával Fest", 12, { totalRevenue: 50_000, totalAttendees: 40 }),
    ev("old", "Old Party", -30, { totalRevenue: 10_000, totalAttendees: 5 }),
  ],
  cohost_events: [{ event: ev("c", "Hush Live", 8, { organization_id: "org2", totalRevenue: 99_999 }), owner_org_name: "Hush" }],
  owner_cohost_assignments: [],
};

function dashboard(role: "owner" | "organizer", routes: Route[] = []) {
  const f = mockFetch([
    ...routes,
    { match: (u) => u.startsWith("/api/organizer/data"), body: DATA },
    { match: (u) => u.includes("/event-assignments?mine=true"), body: { assignments: [{ event_id: "b" }] } },
    { match: (u) => u.startsWith("/api/stripe/"), body: { connected: true, chargesEnabled: true, payoutsEnabled: true } },
  ]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup({ delay: null });
  renderV2(
    <QueryClientProvider client={qc}>
      <OrganizerDashboard organization={org} organizations={[org]} role={role} me={null} />
    </QueryClientProvider>
  );
  return { f, user };
}

const main = () => screen.getByRole("main");

describe("Organizer dashboard v2", () => {
  it("owner: KPIs (revenue from own events only), current list with RSVP and co-host labels, create event", async () => {
    dashboard("owner");
    expect(await within(main()).findByText("Salsa Night")).toBeInTheDocument();
    expect(within(main()).getByText("$1,850.00")).toBeInTheDocument(); // 1250 + 500 + 100, not the co-hosted event
    expect(within(main()).getByText("4")).toBeInTheDocument(); // total events incl. co-hosted
    expect(within(main()).getByText("3 pending requests")).toBeInTheDocument();
    expect(within(main()).getByText("Co-host with Hush")).toBeInTheDocument();
    expect(within(main()).queryByText("Old Party")).not.toBeInTheDocument();
    expect(within(main()).getByRole("link", { name: /Salsa Night/ })).toHaveAttribute("href", "/v2/organizer/event/a?org=kora");
    expect(within(main()).getByRole("link", { name: "Create event" })).toHaveAttribute("href", "/v2/organizer/create?org=kora");
    expect(within(main()).getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/v2/organizer/settings?org=kora");
  });

  it("tabs with counts; past events; search ignores accents; empty search message", async () => {
    const { user } = dashboard("owner");
    await within(main()).findByText("Salsa Night");
    expect(within(main()).getByRole("tab", { name: /Current & upcoming 3/ })).toHaveAttribute("aria-selected", "true");
    await user.click(within(main()).getByRole("tab", { name: /Past events 1/ }));
    expect(within(main()).getByText("Old Party")).toBeInTheDocument();
    await user.click(within(main()).getByRole("tab", { name: /Current & upcoming/ }));
    await user.type(within(main()).getByPlaceholderText("Search events"), "carnaval");
    expect(within(main()).getByText("Carnával Fest")).toBeInTheDocument();
    expect(within(main()).queryByText("Salsa Night")).not.toBeInTheDocument();
    await user.clear(within(main()).getByPlaceholderText("Search events"));
    await user.type(within(main()).getByPlaceholderText("Search events"), "zzz");
    expect(within(main()).getByText("No events match your search.")).toBeInTheDocument();
  });

  it("search counts both tabs and points to the other one when the match is there", async () => {
    const { user } = dashboard("owner");
    await within(main()).findByText("Salsa Night");
    await user.type(within(main()).getByPlaceholderText("Search events"), "old party");
    expect(within(main()).getByRole("tab", { name: /Past events 1/ })).toBeInTheDocument();
    expect(within(main()).getByRole("tab", { name: /Current & upcoming 0/ })).toBeInTheDocument();
    expect(within(main()).getByText("1 match in Past events.")).toBeInTheDocument();
    await user.click(within(main()).getByRole("button", { name: "Show" }));
    expect(within(main()).getByText("Old Party")).toBeInTheDocument();
    // and accents both ways
    await user.clear(within(main()).getByPlaceholderText("Search events"));
    await user.type(within(main()).getByPlaceholderText("Search events"), "CARNÁVAL");
    expect(within(main()).getByText("1 match in Current & upcoming.")).toBeInTheDocument();
  });

  it("organizer: only assigned events, no KPIs, no create button, notice", async () => {
    dashboard("organizer");
    expect(await within(main()).findByText("Carnával Fest")).toBeInTheDocument();
    expect(within(main()).queryByText("Salsa Night")).not.toBeInTheDocument();
    expect(within(main()).getByText("You see the events assigned to you.")).toBeInTheDocument();
    expect(within(main()).queryByText("Total revenue")).not.toBeInTheDocument();
    expect(within(main()).queryByRole("link", { name: "Create event" })).not.toBeInTheDocument();
  });

  it("data error → retry box that refetches", async () => {
    let fail = true;
    const { f, user } = dashboard("owner", [
      { match: (u) => u.startsWith("/api/organizer/data"), get status() { return fail ? 500 : 200; }, get body() { return fail ? {} : DATA; } } as Route,
    ]);
    const retry = await within(main()).findByRole("button", { name: /retry|try again/i });
    fail = false;
    await user.click(retry);
    expect(await within(main()).findByText("Salsa Night")).toBeInTheDocument();
    expect(f.calls.filter((c) => c.url.startsWith("/api/organizer/data")).length).toBeGreaterThan(1);
  });
});

describe("My organizers v2", () => {
  function list(routes: Route[]) {
    const f = mockFetch(routes);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup({ delay: null });
    renderV2(
      <QueryClientProvider client={qc}>
        <OrganizersList />
      </QueryClientProvider>
    );
    return { f, user };
  }

  it("approved organizers link to their dashboard; pending ones don't; create opens the onboarding", async () => {
    const { user } = list([
      {
        match: (u) => u === "/api/organizations",
        body: {
          hasOrganization: true,
          organizations: [
            { id: "1", name: "Kora", slug: "kora", logo_url: null, approved: true, eventCount: 3 },
            { id: "2", name: "Nueva", slug: "nueva", logo_url: null, approved: false, eventCount: 0 },
          ],
        },
      },
    ]);
    expect(await screen.findByRole("link", { name: /Kora/ })).toHaveAttribute("href", "/v2/organizer?org=kora");
    expect(screen.getByText("3 events")).toBeInTheDocument();
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Nueva/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create new organizer" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Onboarding");
  });

  it("no organizers → message", async () => {
    list([{ match: (u) => u === "/api/organizations", body: { hasOrganization: false, organizations: [] } }]);
    expect(await screen.findByText("You don’t manage any organizer yet.")).toBeInTheDocument();
  });

  it("load error shows retry", async () => {
    list([{ match: (u) => u === "/api/organizations", status: 500, body: {} }]);
    await waitFor(() => expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
