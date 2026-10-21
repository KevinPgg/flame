import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch } from "./helpers";
import { OrganizerShell } from "../../app/v2/organizer/OrganizerShell";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const other = { id: "org2", name: "Hush", slug: "hush", logo_url: null };
const day = 86_400_000;
const ev = (id: string, d: number) => ({
  id,
  name: `Event ${id}`,
  slug: id,
  starts_at: new Date(Date.now() + d * day).toISOString(),
  ends_at: new Date(Date.now() + d * day + 3600_000).toISOString(),
  timezone: "America/Guayaquil",
  image_url: null,
});

function setup(props: Partial<React.ComponentProps<typeof OrganizerShell>> = {}, stripe = { connected: true, chargesEnabled: true, payoutsEnabled: true }) {
  const fetchMock = mockFetch([{ match: (u) => u.startsWith("/api/stripe/connect/status"), body: stripe }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderV2(
    <QueryClientProvider client={client}>
      <OrganizerShell
        organization={org}
        organizations={[org, other]}
        role="owner"
        pending={3}
        currentEvents={[ev("a", 3) as never, ev("b", 10) as never]}
        pastEvents={[ev("old", -20) as never]}
        title="New event"
        crumbs={[{ label: "My organizers", href: "/v2/organizer" }, { label: "Kora", href: "/v2/organizer?org=kora" }, { label: "Create event" }]}
        backHref="/v2/organizer?org=kora"
        me={{ name: "Juan Andrés", imageUrl: null }}
        {...props}
      >
        <p>page body</p>
      </OrganizerShell>
    </QueryClientProvider>
  );
  return { fetchMock, user: userEvent.setup({ delay: null }) };
}

describe("OrganizerShell (prototype layout)", () => {
  it("top bar: title, breadcrumbs, back, account", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "New event" })).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "My organizers" })).toHaveAttribute("href", "/v2/organizer");
    expect(within(crumbs).getByText("Create event")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/v2/organizer?org=kora");
    expect(screen.getAllByRole("link", { name: /Juan Andrés/ })[0]).toHaveAttribute("href", "/profile");
    expect(screen.getAllByText("JA").length).toBeGreaterThan(0);
    expect(screen.getByText("page body").closest("main")).toHaveAttribute("id", "v2-main");
  });

  it("sidebar: sections (no scanner: the web does not scan), create event, upcoming and past events, attendee links", async () => {
    setup();
    const side = screen.getByRole("complementary", { name: "Menu" });
    expect(within(side).getByRole("link", { name: /RSVPs/ })).toHaveTextContent("3");
    expect(within(side).getByRole("link", { name: "Team" })).toBeInTheDocument();
    expect(within(side).getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(within(side).getByRole("link", { name: "Payouts" })).toHaveAttribute("href", "/v2/organizer/payouts?org=kora");
    expect(within(side).queryByRole("link", { name: "Scan" })).not.toBeInTheDocument();
    expect(within(side).getByRole("link", { name: "Create event" })).toHaveAttribute("href", "/v2/organizer/create?org=kora");
    expect(within(side).getByText("Upcoming")).toBeInTheDocument();
    expect(within(side).getByRole("link", { name: /Event a/ })).toHaveAttribute("href", "/v2/organizer/event/a?org=kora");
    expect(within(side).getByText("Past")).toBeInTheDocument();
    expect(within(side).getByRole("link", { name: /Event old/ })).toBeInTheDocument();
    expect(within(side).getByRole("link", { name: "Discover" })).toHaveAttribute("href", "/discover");
    expect(within(side).getByRole("link", { name: "My account" })).toHaveAttribute("href", "/v2/account");
    expect(within(side).getByRole("link", { name: "My tickets" })).toHaveAttribute("href", "/account");
    expect(await within(side).findByText("Stripe connected", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("viewer: no team, payouts, settings, create event or Stripe status", async () => {
    const { fetchMock } = setup({ role: "viewer" });
    const side = screen.getByRole("complementary", { name: "Menu" });
    expect(within(side).queryByRole("link", { name: "Team" })).not.toBeInTheDocument();
    expect(within(side).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(within(side).queryByRole("link", { name: "Payouts" })).not.toBeInTheDocument();
    expect(within(side).queryByRole("link", { name: "Create event" })).not.toBeInTheDocument();
    expect(fetchMock.calls.some((c) => c.url.includes("/api/stripe/"))).toBe(false);
  });

  it("Stripe not finished → link to payouts", async () => {
    setup({}, { connected: true, chargesEnabled: false, payoutsEnabled: false });
    expect(await screen.findByRole("link", { name: "Finish Stripe setup" }, { timeout: 5000 })).toHaveAttribute("href", "/v2/organizer/payouts?org=kora");
  });

  it("phone: the menu button opens the drawer; Escape and the scrim close it", async () => {
    const { user } = setup();
    const side = screen.getByRole("complementary", { name: "Menu" });
    const burger = screen.getByRole("button", { name: "Menu" });
    expect(side.className).toContain("-translate-x-[105%]");
    await user.click(burger);
    expect(burger).toHaveAttribute("aria-expanded", "true");
    expect(side.className).not.toContain("-translate-x-[105%]");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(side.className).toContain("-translate-x-[105%]"));
    await user.click(burger);
    await user.click(within(side).getByRole("button", { name: "Close menu" }));
    expect(side.className).toContain("-translate-x-[105%]");
  });

  it("tab bar on phone, hidden on full-screen forms", () => {
    setup({ hideTabbar: false });
    expect(screen.getAllByRole("navigation", { name: "Menu" })).toHaveLength(1);
  });

  it("forms hide the tab bar", () => {
    setup({ hideTabbar: true });
    expect(screen.queryAllByRole("navigation", { name: "Menu" })).toHaveLength(0);
  });

  it("organization switcher lists the others and My organizers", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Switch organizer" }));
    expect(screen.getByRole("link", { name: /Hush/ })).toHaveAttribute("href", "/v2/organizer?org=hush");
    expect(screen.getAllByRole("link", { name: "My organizers" }).length).toBeGreaterThan(0);
  });

  it("Spanish", () => {
    renderV2(
      <QueryClientProvider client={new QueryClient()}>
        <OrganizerShell organization={org} organizations={[org]} role="viewer" pending={0} currentEvents={[]} title="Eventos">
          <p />
        </OrganizerShell>
      </QueryClientProvider>,
      "es"
    );
    expect(screen.getByText("Próximos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mis tickets" })).toBeInTheDocument();
  });
});
