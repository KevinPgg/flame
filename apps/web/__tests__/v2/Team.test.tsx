import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
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
    me: null,
  })),
}));
vi.mock("../../app/contexts/MemberRoleContext", () => ({ useMemberRoleContext: () => ({ setSelectedOrgId: vi.fn() }) }));
import TeamView from "../../app/v2/organizer/team/TeamView";
import TeamPage from "../../app/v2/organizer/team/page";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => push.mockReset());
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const member = (id: string, role: string, first: string | null, email: string) => ({
  id,
  user_id: `u-${id}`,
  organization_id: "org1",
  role,
  user_first_name: first,
  user_last_name: null,
  user_email: email,
});
const MEMBERS = [
  member("m3", "organizer", "Beto", "beto@x.com"),
  member("m1", "owner", "Ana", "ana@x.com"),
  member("m2", "admin", "Carla", "carla@x.com"),
  member("m4", "organizer", "Dani", "dani@x.com"),
];
const day = 86_400_000;
const EVENTS = [
  { id: "e1", name: "Salsa", organization_id: "org1", starts_at: new Date(Date.now() + 5 * day).toISOString(), ends_at: new Date(Date.now() + 5.2 * day).toISOString(), ticket_tiers: [], purchases: [] },
  { id: "e2", name: "Carnaval", organization_id: "org1", starts_at: new Date(Date.now() + 9 * day).toISOString(), ends_at: new Date(Date.now() + 9.2 * day).toISOString(), ticket_tiers: [], purchases: [] },
];

function setup(opts: { extra?: Route[]; me?: { name: string; imageUrl: null; email: string } | null; membersStatus?: number } = {}) {
  const fetchMock = mockFetch([
    ...(opts.extra ?? []),
    { match: (u, i) => u === "/api/organizations/org1/members" && (i?.method ?? "GET") === "GET", status: opts.membersStatus ?? 200, body: opts.membersStatus ? { error: "Forbidden" } : { members: MEMBERS } },
    { match: (u, i) => u === "/api/organizations/org1/event-assignments" && (i?.method ?? "GET") === "GET", body: { assignments: [{ event_id: "e1", user_id: "u-m3" }, { event_id: "e2", user_id: "u-m3" }, { event_id: "e2", user_id: "u-m4" }] } },
    { match: (u) => u.startsWith("/api/organizer/data"), body: { events: EVENTS, cohost_events: [], owner_cohost_assignments: [] } },
    { match: (u) => u.startsWith("/api/stripe/"), body: { connected: true, chargesEnabled: true, payoutsEnabled: true } },
    { match: (u) => u.startsWith("/api/organizer/people") && u.includes("q=nu"), body: { people: [{ id: "u-new", email: "new@x.com", first_name: "Nuevo", last_name: "Uno", related: true }] } },
    { match: (u, i) => i?.method === "POST" || i?.method === "PATCH" || i?.method === "PUT", body: { success: true } },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup({ delay: null });
  renderV2(
    <QueryClientProvider client={client}>
      <TeamView organization={org} organizations={[org]} role="owner" me={opts.me ?? { name: "Carla", imageUrl: null, email: "carla@x.com" }} />
    </QueryClientProvider>
  );
  return { fetchMock, user };
}
const writes = (calls: Array<{ url: string; method: string; body: any }>) => calls.filter((c) => c.method !== "GET");
const rows = () => screen.getAllByRole("listitem").filter((li) => li.closest("main"));

describe("Team v2", () => {
  it("owner, admins, organizers; you are marked; assignments per organizer; owner has no options", async () => {
    setup();
    await screen.findByText("ana@x.com");
    const names = rows().map((r) => within(r).getAllByText(/@x\.com$/)[0]!.textContent);
    expect(names).toEqual(["ana@x.com", "carla@x.com", "beto@x.com", "dani@x.com"]);
    expect(screen.getByText("(you)")).toBeInTheDocument();
    expect(screen.getAllByText("2 events assigned").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 event assigned").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Options for Ana" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options for Beto" })).toBeInTheDocument();
  });

  it("invite (fase 4.5): any e-mail, role, sent; shows the notice", async () => {
    const { user, fetchMock } = setup({
      extra: [{ match: (u, i) => u === "/api/organizations/org1/invitations" && i?.method === "POST", body: { invitation: { id: "inv1" }, resent: false, emailSent: true } }],
    });
    await screen.findByText("ana@x.com");
    await user.click(screen.getByRole("button", { name: /Invite member/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-mail"), "not-an-email");
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));
    expect(within(dialog).getByText("Enter a valid e-mail, like name@email.com.")).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("E-mail"));
    await user.type(within(dialog).getByLabelText("E-mail"), "  New@X.com ");
    await user.click(within(dialog).getByRole("radio", { name: /Admin/ }));
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes(fetchMock.calls)).toEqual([{ url: "/api/organizations/org1/invitations", method: "POST", body: { email: "new@x.com", role: "admin" } }]);
    expect(screen.getByRole("status")).toHaveTextContent("Invite sent to new@x.com");
  });

  it("invite: someone already in the team is stopped before calling the API", async () => {
    const { user, fetchMock } = setup();
    await screen.findByText("ana@x.com");
    await user.click(screen.getByRole("button", { name: /Invite member/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-mail"), "BETO@x.com");
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));
    expect(within(dialog).getByText("beto@x.com is already in the team.")).toBeInTheDocument();
    expect(writes(fetchMock.calls)).toEqual([]);
  });

  it("pending invitations: Invited / Expired, resend and cancel (asks first)", async () => {
    const soon = new Date(Date.now() + 3.5 * day).toISOString();
    const { user, fetchMock } = setup({
      extra: [
        {
          match: (u, i) => u === "/api/organizations/org1/invitations" && (i?.method ?? "GET") === "GET",
          body: {
            invitations: [
              { id: "inv1", email: "zoe@x.com", role: "organizer", state: "pending", created_at: "", expires_at: soon },
              { id: "inv2", email: "old@x.com", role: "admin", state: "expired", created_at: "", expires_at: "2026-01-01T00:00:00Z" },
            ],
          },
        },
        { match: (u, i) => u === "/api/organizations/org1/invitations/inv1" && i?.method === "DELETE", body: {} },
      ],
    });
    const list = await screen.findByTestId("invite-list");
    expect(list).toHaveTextContent("zoe@x.com");
    expect(list).toHaveTextContent("Invited");
    expect(list).toHaveTextContent("Expires in 4 days");
    expect(list).toHaveTextContent("Expired");
    await user.click(within(list).getAllByRole("button", { name: "Resend" })[0]!);
    await waitFor(() => expect(writes(fetchMock.calls)[0]).toMatchObject({ url: "/api/organizations/org1/invitations/inv1", method: "POST" }));
    await user.click(within(list).getByRole("button", { name: "Cancel invite zoe@x.com" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Cancel the invitation to zoe@x.com?");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel invite" }));
    await waitFor(() => expect(writes(fetchMock.calls).some((c) => c.method === "DELETE" && c.url.endsWith("/inv1"))).toBe(true));
  });

  it("change role", async () => {
    const { user, fetchMock } = setup();
    await user.click(await screen.findByRole("button", { name: "Options for Beto" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Change role" }));
    const dialog = await screen.findByRole("dialog", { name: "Change role" });
    await user.click(within(dialog).getByRole("radio", { name: /Admin/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes(fetchMock.calls)).toEqual([{ url: "/api/organizations/org1/members/m3", method: "PATCH", body: { role: "admin" } }]);
  });

  it("assign events: current ones pre-checked, saves the new set", async () => {
    const { user, fetchMock } = setup();
    await user.click(await screen.findByRole("button", { name: "Options for Dani" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Assign events" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign events" });
    const salsa = within(dialog).getByRole("checkbox", { name: /Salsa/ });
    const carnaval = within(dialog).getByRole("checkbox", { name: /Carnaval/ });
    expect(salsa).not.toBeChecked();
    expect(carnaval).toBeChecked();
    await user.click(salsa);
    expect(within(dialog).getByText("2 selected")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes(fetchMock.calls)).toEqual([{ url: "/api/organizations/org1/event-assignments", method: "PUT", body: { userId: "u-m4", eventIds: ["e1", "e2"] } }]);
  });

  it("assign events: past events aren't offered (running ones are); saving keeps past assignments", async () => {
    const past = { id: "e0", name: "Viejo", organization_id: "org1", starts_at: new Date(Date.now() - 10 * day).toISOString(), ends_at: new Date(Date.now() - 9.8 * day).toISOString(), ticket_tiers: [], purchases: [] };
    const { user, fetchMock } = setup({
      extra: [
        { match: (u, i) => u === "/api/organizations/org1/event-assignments" && (i?.method ?? "GET") === "GET", body: { assignments: [{ event_id: "e2", user_id: "u-m4" }, { event_id: "e0", user_id: "u-m4" }] } },
        { match: (u) => u.startsWith("/api/organizer/data"), body: { events: [past, ...EVENTS], cohost_events: [], owner_cohost_assignments: [] } },
      ],
    });
    await user.click(await screen.findByRole("button", { name: "Options for Dani" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Assign events" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign events" });
    expect(within(dialog).queryByRole("checkbox", { name: /Viejo/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("1 selected")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: /Salsa/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes(fetchMock.calls)).toEqual([{ url: "/api/organizations/org1/event-assignments", method: "PUT", body: { userId: "u-m4", eventIds: ["e1", "e2", "e0"] } }]);
  });

  it("admins don't get 'Assign events' (they see every event)", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Options for Carla" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Assign events" })).not.toBeInTheDocument();
  });

  it("remove asks first; API error is shown in the dialog", async () => {
    const { user, fetchMock } = setup({ extra: [{ match: (u) => u === "/api/organizations/members/remove", status: 409, body: { error: "Member not found or cannot be removed" } }] });
    await user.click(await screen.findByRole("button", { name: "Options for Beto" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove from team" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove Beto from the team?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove from team" }));
    expect(await within(dialog).findByText("Member not found or cannot be removed")).toBeInTheDocument();
    expect(writes(fetchMock.calls)).toEqual([{ url: "/api/organizations/members/remove", method: "POST", body: { orgId: "org1", memberId: "m3" } }]);
  });

  it("removing yourself warns and then leaves the organization", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Options for Carla" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove from team" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("You’ll lose access to this organization right away.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove from team" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/v2/organizer"));
  });

  it("members can't be loaded → error box", async () => {
    setup({ membersStatus: 403 });
    expect(await screen.findByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("Spanish", async () => {
    mockFetch([{ match: () => true, body: { members: [], assignments: [] } }]);
    renderV2(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TeamView organization={org} organizations={[org]} role="owner" />
      </QueryClientProvider>,
      "es"
    );
    expect(await screen.findByText("Aún no hay miembros.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Equipo" })).toBeInTheDocument();
  });
});

describe("/v2/organizer/team (server page)", () => {
  it.each(["organizer", "viewer"])("%s goes back to the dashboard", async (role) => {
    ctx.role = role;
    await expect(TeamPage({ searchParams: Promise.resolve({ org: "kora" }) })).rejects.toThrow("REDIRECT /v2/organizer?org=kora");
  });
  it.each(["owner", "admin"])("%s gets the team", async (role) => {
    ctx.role = role;
    const el = (await TeamPage({ searchParams: Promise.resolve({ org: "kora" }) })) as React.ReactElement;
    expect(el.type).toBe(TeamView);
  });
});
