/** Fase 2.5: Explore in the app. */
import { fireEvent, screen } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { Explore } from "../../components/v2/attendee/explore/Explore";

const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockNav, useFocusEffect: (cb: () => void) => require("react").useEffect(cb, []) }));
jest.mock("../../components/navigation/CustomTabBar", () => ({ getTabBarPaddingBottom: () => 100 }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock("../../components/navigation/BecomeOrganizerSheet", () => ({
  BecomeOrganizerSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = require("react-native");
    return visible ? <Text>apply sheet</Text> : null;
  },
}));
const D = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const ev = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug: `ev-${id}`,
  name: `Event ${id}`,
  starts_at: iso(3 * D),
  ends_at: iso(3 * D + 5 * 3600_000),
  timezone: "America/Guayaquil",
  venue: "Club Uno",
  city: "Quito",
  currency: "USD",
  organizations: { name: "Sonar", slug: "sonar", logo_url: null },
  ticket_tiers: [{ id: "t", price_cents: 1500, quantity_total: 10, quantity_sold: 0 }],
  ...extra,
});
const mockEvents = {
  data: { rawEvents: [ev("a"), ev("cumbia", { name: "Noche de Cúmbia", is_featured: true }), ev("gye", { city: "Guayaquil" })] },
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};
jest.mock("../../hooks/useAppEvents", () => ({ useAppEvents: () => mockEvents }));
jest.mock("../../hooks/useOrganizations", () => ({
  useOrganizations: () => ({ data: [{ id: "o2", name: "Club Rojo", slug: "club-rojo", city: "Guayaquil" }], refetch: jest.fn() }),
}));
const mockAuth = { isSignedIn: true };
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => mockAuth }));
const mockUserOrgs = { data: [] as unknown[], isLoading: false };
jest.mock("../../hooks/useUserOrgs", () => ({ useUserOrgs: () => mockUserOrgs }));
// Fase 4.4: public follower counts and recent searches on the phone.
jest.mock("../../hooks/useFollowing", () => ({
  useFollowerCounts: () => ({ data: { o2: 1161 }, refetch: jest.fn() }),
}));
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

beforeEach(() => {
  mockNav.push.mockReset();
  mockAuth.isSignedIn = true;
  mockUserOrgs.data = [];
  mockStore.clear();
  mockEvents.data.rawEvents[0] = ev("a", { lineup: [{ name: "Perdomo" }] });
});

describe("Explore (app)", () => {
  it("idle: featured first, organizers, host card opens the apply sheet, FAQs", async () => {
    await renderV2(<Explore />);
    expect(screen.getByText("Featured events")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /^Event|^Noche/ })[0]!.props.accessibilityLabel).toMatch(/^Noche de Cúmbia/);
    await fireEvent.press(screen.getByRole("link", { name: "See Club Rojo" }));
    expect(mockNav.push).toHaveBeenCalledWith("/organizer/club-rojo");
    await fireEvent.press(screen.getByText("Apply to host"));
    expect(screen.getByText("apply sheet")).toBeTruthy();
    expect(screen.getByText("What is FLAME?")).toBeTruthy();
  });

  it("search (accents don't matter), organizers too; no results; clear", async () => {
    await renderV2(<Explore />);
    const box = screen.getByLabelText("Search");
    await fireEvent.changeText(box, "cumbia");
    expect(screen.getByText("1 result")).toBeTruthy();
    await fireEvent.changeText(box, "guayaquil");
    expect(screen.getByText("2 results")).toBeTruthy();
    await fireEvent.changeText(box, "zzz");
    expect(screen.getByText("No results")).toBeTruthy();
    await fireEvent.press(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    expect(screen.getByText("Featured events")).toBeTruthy();
  });

  it("host card: signed out → sign in", async () => {
    mockAuth.isSignedIn = false;
    await renderV2(<Explore />);
    await fireEvent.press(screen.getByText("Apply to host"));
    expect(mockNav.push).toHaveBeenCalledWith("/sign-in");
  });

  it("host card: hidden for an approved organizer", async () => {
    mockUserOrgs.data = [{ approved: true }];
    await renderV2(<Explore />);
    expect(screen.queryByText("Host your own events")).toBeNull();
  });

  it("host card: pending organization → under review (Spanish)", async () => {
    mockUserOrgs.data = [{ approved: false }];
    await renderV2(<Explore />, "es");
    expect(screen.getByText("Tu organización está en revisión. Te avisaremos cuando la aprueben.")).toBeTruthy();
    expect(screen.queryByText("Postular como organizador")).toBeNull();
  });

  it("fase 4.4: artists from the line-up; organizer cards show followers", async () => {
    await renderV2(<Explore />);
    expect(screen.getByText("Guayaquil · 1161 followers")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Search"), "perdomo");
    expect(screen.getByText("Artists")).toBeTruthy();
    expect(screen.getByText("Next: Event a")).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: "Perdomo" }));
    expect(mockNav.push).toHaveBeenCalledWith("/event/a");
  });

  it("fase 4.4: recent searches are kept on the phone and can be cleared", async () => {
    await renderV2(<Explore />);
    const box = screen.getByLabelText("Search");
    await fireEvent.changeText(box, "cumbia");
    await fireEvent(box, "submitEditing");
    await fireEvent.press(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    expect(await screen.findByText("Recent searches")).toBeTruthy();
    expect(JSON.parse(mockStore.get("flame_recent_searches")!)).toEqual(["cumbia"]);
    await fireEvent.press(screen.getByText("cumbia"));
    expect(screen.getByText("1 result")).toBeTruthy();
    await fireEvent.press(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    await fireEvent.press(screen.getByText("Clear"));
    expect(screen.queryByText("Recent searches")).toBeNull();
  });
});
