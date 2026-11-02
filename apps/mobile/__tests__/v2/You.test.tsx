/** Fase 2.6: You, the inbox row and the welcome behind sign-in (app). */
import { fireEvent, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { UserTicket } from "@project-flame/lib";
import { I18nProvider } from "../../lib/i18n";
import { renderV2 } from "./helpers";
import { You } from "../../components/v2/attendee/you/You";
import { InboxCard, InboxRow } from "../../components/v2/attendee/InboxCard";

const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockNav }));
jest.mock("../../components/navigation/CustomTabBar", () => ({ getTabBarPaddingBottom: () => 100 }));
jest.mock("../../components/navigation/BecomeOrganizerSheet", () => ({
  BecomeOrganizerSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = require("react-native");
    return visible ? <Text>apply sheet</Text> : null;
  },
}));
jest.mock("../../components/v2/support/OrgApprovals", () => ({ OrgApprovalsEntry: () => null }));
jest.mock("../../hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: { first_name: "Ana", last_name: "Ruiz", email: "ana@x.com", profile_image_url: null }, isLoading: false, refetch: jest.fn() }),
}));
jest.mock("../../hooks/useUserOrgs", () => ({
  useUserOrgs: () => ({
    data: [
      { organizationId: "o1", organizationName: "Club Uno", organizationSlug: "club-uno", approved: true, logoUrl: null, eventCount: 3, memberRole: "owner" },
      { organizationId: "o2", organizationName: "New Org", organizationSlug: "new", approved: false, logoUrl: null, eventCount: 0, memberRole: "owner" },
    ],
    isLoading: false,
    refetch: jest.fn(),
  }),
}));
const mockSetOrg = jest.fn();
jest.mock("../../contexts/MemberRoleContext", () => ({ useMemberRoleContext: () => ({ setSelectedOrgId: mockSetOrg }) }));
const D = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const mockOld = { id: "old", name: "Old night", slug: "old", description: "", image_url: "", starts_at: iso(-30 * D), ends_at: iso(-30 * D + 3600_000), venue: "Club", timezone: "America/Guayaquil" };
const mockPAST: UserTicket = { id: "t1", type: "ticket", status: "checked_in", created_at: iso(-40 * D), ticket_tier: { id: "x", name: "GA", price_cents: 0, event: mockOld } };
jest.mock("../../hooks/useUserTickets", () => ({ useUserTickets: () => ({ data: { tickets: [mockPAST] }, refetch: jest.fn() }) }));
const mockSaved = {
  events: [
    { id: "s-up", slug: "s-up", name: "Saved soon", image_url: null, starts_at: iso(3 * D), ends_at: iso(3 * D + 3600_000), timezone: "America/Guayaquil", ticket_tiers: [] },
    { id: "s-old", slug: "s-old", name: "Saved gone", image_url: null, starts_at: iso(-3 * D), ends_at: iso(-3 * D + 3600_000), timezone: "America/Guayaquil", ticket_tiers: [] },
  ],
};
jest.mock("../../hooks/useSavedEvents", () => ({
  useSavedEvents: () => ({ events: mockSaved.events, isLoading: false, isSaved: () => true, toggle: jest.fn(), refetch: jest.fn() }),
}));

beforeEach(() => {
  mockNav.push.mockReset();
  mockSetOrg.mockReset();
});

describe("You (app)", () => {
  it("Saved (fase 4.1): upcoming first, ended ones after with their tag; hearts to un-save", async () => {
    await renderV2(<You />);
    expect(screen.getByRole("header", { name: "Saved" })).toBeTruthy();
    const names = screen.getAllByText(/^Saved (soon|gone)$/).map((n) => n.props.children);
    expect(names).toEqual(["Saved soon", "Saved gone"]);
    expect(screen.getByText("Ended")).toBeTruthy();
    expect(screen.getByLabelText("Remove Saved soon from saved")).toBeTruthy();
    expect(screen.getByLabelText("Remove Saved gone from saved")).toBeTruthy();
  });

  it("name, e-mail, counters; Edit profile and Settings; organizers with Manage / Under review; New organizer", async () => {
    await renderV2(<You />);
    expect(screen.getByRole("header", { name: "Ana Ruiz" })).toBeTruthy();
    expect(screen.getByText("ana@x.com")).toBeTruthy();
    expect(screen.getByLabelText("Events: 1")).toBeTruthy();
    expect(screen.getByLabelText("Organizers: 2")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    expect(mockNav.push).toHaveBeenCalledWith("/settings");
    await fireEvent.press(screen.getByRole("button", { name: "Manage Club Uno" }));
    expect(mockSetOrg).toHaveBeenCalledWith("o1");
    expect(mockNav.push).toHaveBeenCalledWith("/organizer-admin?orgId=o1");
    expect(screen.getByText("Under review")).toBeTruthy();
    await fireEvent.press(screen.getByText("New organizer"));
    expect(screen.getByText("apply sheet")).toBeTruthy();
  });

  it("past events open their ticket; History → My tickets", async () => {
    await renderV2(<You />, "es");
    await fireEvent.press(screen.getByText("Old night"));
    expect(mockNav.push).toHaveBeenCalledWith("/ticket/t1");
    await fireEvent.press(screen.getByText("Historial"));
    expect(mockNav.push).toHaveBeenCalledWith("/dashboard");
  });
});

describe("inbox row (app)", () => {
  const N = { id: "n1", type: "event_reminder", title: "Tonight", body: "Doors at 9", data: { eventId: "e1" }, read: false, created_at: new Date(Date.now() - 5 * 60_000).toISOString() };

  it("time ago in the person's language; icon without a flyer", async () => {
    await renderV2(<InboxCard item={N} />);
    expect(screen.getByText("5 min ago")).toBeTruthy();
    expect(screen.queryByTestId("inbox-flyer")).toBeNull();
  });

  it("flyer from the events already in memory (no fetch)", async () => {
    const client = new QueryClient();
    client.setQueryData(["events", "all"], { rawEvents: [{ id: "e1", image_url: "https://img/e1.jpg" }] });
    await render(
      <QueryClientProvider client={client}>
        <I18nProvider initialLanguage="es">
          <InboxRow item={{ ...N, created_at: new Date(Date.now() - 26 * 3600_000).toISOString() }} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("inbox-flyer")).toBeTruthy();
    expect(screen.getByText("Ayer")).toBeTruthy();
  });
});
