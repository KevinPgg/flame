/** Fase 2.2: Flame 2.0 Home in the app (full-flyer cards, days, city sheet). */
import { Share } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import { feedDayTitle } from "@project-flame/lib";
import { renderV2 } from "./helpers";
import { AttendeeCityProvider } from "../../contexts/AttendeeCityContext";
import { HomeFeed } from "../../components/v2/attendee/home/HomeFeed";
import { AttendeeTopBar } from "../../components/v2/attendee/AttendeeTopBar";

const mockNav = { push: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockNav,
  usePathname: () => "/",
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, []),
}));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
jest.mock("../../components/FlameLogo", () => ({ FlameLogo: () => null }));
jest.mock("../../components/navigation/CustomTabBar", () => ({ getTabBarPaddingBottom: () => 100 }));
const mockEvents = { state: { data: undefined as unknown, isLoading: false, isError: false, refetch: jest.fn(async () => ({})) } };
jest.mock("../../hooks/useAppEvents", () => ({ useAppEvents: () => mockEvents.state }));
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

const H = 3600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const tier = (price_cents: number) => ({ id: `t${price_cents}`, price_cents, quantity_total: 100, quantity_sold: 0 });
const ev = (id: string, city: string, startH: number, extra: Record<string, unknown> = {}) => ({
  id,
  slug: `slug-${id}`,
  name: `Event ${id}`,
  image_url: null,
  starts_at: iso(startH * H),
  ends_at: iso((startH + 5) * H),
  timezone: "America/Guayaquil",
  city,
  currency: "USD",
  organizations: { name: `Org ${id}`, slug: `org-${id}`, logo_url: null },
  ticket_tiers: [tier(1500), tier(2500)],
  ...extra,
});

beforeEach(() => {
  mockNav.push.mockReset();
  mockStore.clear();
  mockEvents.state = {
    data: {
      rawEvents: [
        ev("live", "Quito", -1),
        ev("later", "Quito", 96, { requires_rsvp: true, ticket_tiers: [tier(0)] }),
        ev("gye", "Guayaquil", 100),
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(async () => ({})),
  };
});

async function open(language: "en" | "es" = "en") {
  await renderV2(
    <AttendeeCityProvider>
      <AttendeeTopBar />
      <HomeFeed />
    </AttendeeCityProvider>,
    language,
  );
}

describe("Home (app)", () => {
  it("starts on Quito (catalog default), grouped by day, full-flyer cards with date and price", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Change city: Quito" })).toBeTruthy();
    expect(screen.getByText("Happening now")).toBeTruthy();
    const laterTitle = feedDayTitle({ sample: iso(96 * H), timezone: "America/Guayaquil" }, "en-US");
    expect(screen.getByText(laterTitle)).toBeTruthy();
    expect(screen.getByText("Event live")).toBeTruthy();
    expect(screen.getByText("From $15.00")).toBeTruthy();
    expect(screen.getByText("Free")).toBeTruthy();
    expect(screen.getByText("RSVP")).toBeTruthy();
    expect(screen.queryByText("Event gye")).toBeNull();
  });

  it("city sheet: all cities with counts; picking one filters, All cities shows everything", async () => {
    await open();
    await fireEvent.press(screen.getByRole("button", { name: "Change city: Quito" }));
    expect(screen.getByText("Where are you going out?")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "All cities, 3 events" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Guayaquil, 1 event" }));
    expect(screen.getByText("Event gye")).toBeTruthy();
    expect(screen.queryByText("Event live")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Change city: Guayaquil" }));
    await fireEvent.press(screen.getByRole("radio", { name: "All cities, 3 events" }));
    // (the list renders its first items only; Quito's are first again)
    expect(screen.getByText("Event live")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change city: All cities" })).toBeTruthy();
  });

  it("without Quito events there is no default: all cities", async () => {
    mockEvents.state = { ...mockEvents.state, data: { rawEvents: [ev("a", "Cuenca", 30), ev("b", "Manta", 40)] } };
    await open();
    expect(screen.getByRole("button", { name: "Change city: All cities" })).toBeTruthy();
    expect(screen.getByText("Event a")).toBeTruthy();
    expect(screen.getByText("Event b")).toBeTruthy();
  });

  it("opens on the default city saved on this phone (Settings), not on Quito", async () => {
    mockStore.set("flme.v2.defaultCity", "Guayaquil");
    await open();
    expect(await screen.findByRole("button", { name: "Change city: Guayaquil" })).toBeTruthy();
    expect(screen.getByText("Event gye")).toBeTruthy();
    expect(screen.queryByText("Event live")).toBeNull();
  });

  it("saved All cities → everything", async () => {
    mockStore.set("flme.v2.defaultCity", "all");
    await open();
    expect(await screen.findByRole("button", { name: "Change city: All cities" })).toBeTruthy();
    expect(screen.getByText("Event live")).toBeTruthy(); // (the list renders its first items only)
  });

  it("saved city with no events now → Quito rule", async () => {
    mockStore.set("flme.v2.defaultCity", "Cuenca");
    await open();
    expect(await screen.findByRole("button", { name: "Change city: Quito" })).toBeTruthy();
  });

  it("opens the event, the organizer, and shares the public link", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    await open();
    await fireEvent.press(screen.getByRole("link", { name: /^Event live/ }));
    expect(mockNav.push).toHaveBeenCalledWith("/event/live");
    await fireEvent.press(screen.getByText("Org live"));
    expect(mockNav.push).toHaveBeenCalledWith("/organizer/org-live");
    await fireEvent.press(screen.getByRole("button", { name: "Share Event live" }));
    expect(share).toHaveBeenCalledWith({ message: "https://flme.co/events/slug-live" });
  });

  it("no events at all; load error with retry", async () => {
    mockEvents.state = { ...mockEvents.state, data: { rawEvents: [] } };
    await open();
    expect(screen.getByText("No upcoming events yet")).toBeTruthy();
  });

  it("load error → message and retry", async () => {
    mockEvents.state = { ...mockEvents.state, data: undefined, isError: true };
    await open();
    expect(screen.getByText("We couldn’t load events.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Try again"));
    expect(mockEvents.state.refetch).toHaveBeenCalled();
  });

  it("Spanish", async () => {
    await open("es");
    expect(screen.getByText("Ahora mismo")).toBeTruthy();
    expect(screen.getByText("Desde $15.00")).toBeTruthy();
    expect(screen.getByText("Gratis")).toBeTruthy();
  });
});
