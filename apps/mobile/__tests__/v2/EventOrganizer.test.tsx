/** Fase 2.4: event page header, "More from", organizer profile (app). */
import { Linking, Share } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { EventHeader } from "../../components/v2/attendee/event/EventHeader";
import { MoreFromOrganizer } from "../../components/v2/attendee/event/MoreFromOrganizer";
import { OrganizerProfile } from "../../components/v2/attendee/organizer/OrganizerProfile";

const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock("expo-router", () => ({ useRouter: () => mockNav }));
jest.mock("../../components/navigation/CustomTabBar", () => ({ getTabBarPaddingBottom: () => 100 }));
const D = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const feed = (id: string, org: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug: `ev-${id}`,
  name: `Event ${id}`,
  image_url: null,
  starts_at: iso(3 * D),
  ends_at: iso(3 * D + 5 * 3600_000),
  timezone: "America/Guayaquil",
  venue: "Club Uno",
  city: "Quito",
  currency: "USD",
  organizations: { name: org, slug: org.toLowerCase().replace(/\s/g, "-"), logo_url: null },
  ticket_tiers: [{ id: "t", price_cents: 1500, quantity_total: 10, quantity_sold: 0 }],
  ...extra,
});
const mockEvents = { data: { rawEvents: [feed("a", "Club Uno"), feed("b", "Club Uno"), feed("c", "Other"), feed("co", "Other")] }, isLoading: false, isError: false, refetch: jest.fn() };
jest.mock("../../hooks/useAppEvents", () => ({ useAppEvents: () => mockEvents }));
const mockOrgs = { state: { data: [] as unknown[], isLoading: false, isError: false, refetch: jest.fn() } };
jest.mock("../../hooks/useOrganizations", () => ({ useOrganizations: () => mockOrgs.state }));
jest.mock("../../hooks/usePastOrgEvents", () => ({
  usePastOrgEvents: () => ({ data: [{ id: "old", title: "Old night", imageUrl: "", date: "Sep 1" }], refetch: jest.fn() }),
}));
jest.mock("../../hooks/useOrgCohostEventIds", () => ({ useOrgCohostEventIds: () => ({ data: new Set(["co"]), refetch: jest.fn() }) }));

const EVENT = {
  name: "Noche Larga",
  description: "One\nTwo\nThree\nFour",
  image_url: null,
  starts_at: "2026-10-31T03:00:00Z",
  ends_at: "2026-10-31T08:00:00Z",
  timezone: "America/Guayaquil",
  venue: "Club Uno",
  city: "Quito",
  requires_rsvp: true,
};

beforeEach(() => {
  mockNav.push.mockReset();
  mockOrgs.state = {
    data: [{ id: "o1", name: "Club Uno", slug: "club-uno", logo_url: null, cover_image_url: null, description: "Techno", instagram_handle: "@clubuno", city: "Quito" }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
});

describe("event header (app)", () => {
  it("organizer → profile; title; one-night time range; directions; RSVP; More / Less", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    const onShare = jest.fn();
    await renderV2(<EventHeader event={EVENT} organizer={{ names: "Club Uno & Sonar", slug: "club-uno" }} onShare={onShare} />);
    await fireEvent.press(screen.getByRole("link", { name: "See organizer" }));
    expect(mockNav.push).toHaveBeenCalledWith("/organizer/club-uno");
    expect(screen.getByText("Club Uno & Sonar")).toBeTruthy();
    expect(screen.getByText(/^Fri, Oct 30 · 10:00\sPM – 3:00\sAM$/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: "Directions" }));
    expect(open).toHaveBeenCalledWith(expect.stringContaining("Club%20Uno%2C%20Quito"));
    expect(screen.getByText("RSVP required — the organizer approves each request")).toBeTruthy();
    expect(screen.getByTestId("event-description").props.numberOfLines).toBe(3);
    await fireEvent.press(screen.getByText("More"));
    expect(screen.getByTestId("event-description").props.numberOfLines).toBeUndefined();
    await fireEvent.press(screen.getByRole("button", { name: "Share event" }));
    expect(onShare).toHaveBeenCalled();
  });

  it("More from the organizer: its other events only; opens them", async () => {
    await renderV2(<MoreFromOrganizer eventId="a" organizerSlug="club-uno" organizerName="Club Uno" />);
    expect(screen.getByText("More from Club Uno")).toBeTruthy();
    expect(screen.getByText("Event b")).toBeTruthy();
    expect(screen.queryByText("Event a")).toBeNull();
    expect(screen.queryByText("Event c")).toBeNull();
    await fireEvent.press(screen.getByRole("link", { name: /^Event b/ }));
    expect(mockNav.push).toHaveBeenCalledWith("/event/b");
  });
});

describe("organizer profile (app)", () => {
  it("name, city, Instagram, owned + co-hosted upcoming events, past tab, share", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    await renderV2(<OrganizerProfile slug="club-uno" />);
    expect(screen.getByRole("header", { name: "Club Uno" })).toBeTruthy();
    expect(screen.getByText("3 upcoming events")).toBeTruthy();
    expect(screen.getByText("Event a")).toBeTruthy();
    expect(screen.getByText("Event co")).toBeTruthy(); // co-hosted
    expect(screen.queryByText("Event c")).toBeNull();
    await fireEvent.press(screen.getByRole("link", { name: "Instagram @clubuno" }));
    expect(open).toHaveBeenCalledWith("https://instagram.com/clubuno");
    await fireEvent.press(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByText("Old night")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Share Club Uno" }));
    expect(share).toHaveBeenCalledWith({ message: "https://flme.co/organizer/club-uno" });
  });

  it("unknown organizer → not available", async () => {
    await renderV2(<OrganizerProfile slug="nope" />);
    expect(screen.getByText("This organizer isn’t available")).toBeTruthy();
  });
});
