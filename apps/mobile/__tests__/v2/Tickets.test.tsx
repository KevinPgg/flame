/** Fase 2.3: My tickets and the swipeable QR ticket in the app. */
import { Linking, Share } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { UserTicket } from "@project-flame/lib";
import { renderV2 } from "./helpers";
import { Wallet } from "../../components/v2/attendee/tickets/Wallet";
import { TicketPager } from "../../components/v2/attendee/tickets/TicketPager";

const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock("expo-router", () => ({
  useRouter: () => mockNav,
  usePathname: () => "/dashboard",
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, []),
}));
jest.mock("../../components/navigation/CustomTabBar", () => ({ getTabBarPaddingBottom: () => 100 }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
jest.mock("react-native-qrcode-svg", () => {
  const { Text } = require("react-native");
  return ({ value }: { value: string }) => <Text>{`qr:${JSON.parse(value).qrToken}`}</Text>;
});
const mockTickets = { state: { data: undefined as unknown, isLoading: false, isError: false, refetch: jest.fn(async () => ({})) } };
jest.mock("../../hooks/useUserTickets", () => ({ useUserTickets: () => mockTickets.state }));

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
const tk = (id: string, e: ReturnType<typeof event>, tier: string, createdDaysAgo: number, extra: Partial<UserTicket> = {}): UserTicket => ({
  id,
  type: "ticket",
  status: "issued",
  created_at: iso(-createdDaysAgo * D),
  qr_code: `https://qr/${id}.png`,
  attendee_name: `Holder ${id}`,
  ticket_tier: { id: `${e.id}-${tier}`, name: tier, price_cents: 1500, event: e },
  order: { id: `o-${id}`, quantity: 1, total_cents: 1749, created_at: iso(-createdDaysAgo * D) },
  ...extra,
});
const ROWS: UserTicket[] = [
  tk("t2", SOON, "VIP", 1),
  tk("t1", SOON, "GA", 2),
  tk("promo", SOON, "GA", 0, { type: "promotional", qr_code: undefined, qr_token: "tok-promo", order: undefined }),
  tk("past1", OLD, "GA", 40, { status: "checked_in" }),
  {
    id: "r1",
    type: "rsvp",
    status: "pending",
    created_at: iso(-D),
    requested_quantity: 2,
    ticket_tier: { id: "later-GA", name: "GA", price_cents: 0, event: event("later", 10) },
  },
];

beforeEach(() => {
  Object.values(mockNav).forEach((f) => typeof f === "function" && "mockReset" in f && (f as jest.Mock).mockReset());
  mockTickets.state = { data: { tickets: ROWS }, isLoading: false, isError: false, refetch: jest.fn(async () => ({})) };
});

describe("My tickets (app)", () => {
  it("counters, one card per event with all its tickets, RSVP request with its state", async () => {
    await renderV2(<Wallet />);
    expect(screen.getByLabelText("Total: 5")).toBeTruthy();
    expect(screen.getByLabelText("Purchased: 3")).toBeTruthy();
    expect(screen.getByLabelText("Pending: 2")).toBeTruthy();
    expect(screen.getByText("In 3 days")).toBeTruthy();
    expect(screen.getByText("3 tickets · GA, VIP")).toBeTruthy();
    expect(screen.getByText("RSVP · pending")).toBeTruthy();
    expect(screen.getByText("The organizer is reviewing your request.")).toBeTruthy();
    expect(screen.queryByText("Event old")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show tickets for Event soon" }));
    expect(mockNav.push).toHaveBeenCalledWith("/ticket/t1");
    await fireEvent.press(screen.getByText("See event"));
    expect(mockNav.push).toHaveBeenCalledWith("/event/later");
  });

  it("past: attended events; empty and error states", async () => {
    await renderV2(<Wallet />);
    await fireEvent.press(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByText("Event old")).toBeTruthy();
    expect(screen.getByText("Attended")).toBeTruthy();
  });

  it("no tickets → find events", async () => {
    mockTickets.state = { ...mockTickets.state, data: { tickets: [] } };
    await renderV2(<Wallet />);
    expect(screen.getByText("No tickets yet")).toBeTruthy();
    await fireEvent.press(screen.getByText("Find events"));
    expect(mockNav.push).toHaveBeenCalledWith("/");
  });

  it("load error → retry", async () => {
    mockTickets.state = { ...mockTickets.state, data: undefined, isError: true };
    await renderV2(<Wallet />);
    expect(screen.getByText("We couldn’t load your tickets.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Try again"));
    expect(mockTickets.state.refetch).toHaveBeenCalled();
  });

  it("Spanish", async () => {
    await renderV2(<Wallet />, "es");
    expect(screen.getByText("Mis tickets")).toBeTruthy();
    expect(screen.getByText("En 3 días")).toBeTruthy();
    expect(screen.getByText("RSVP · pendiente")).toBeTruthy();
  });
});

describe("QR ticket (app)", () => {
  it("opens on the requested ticket among all of the event, in purchase order; chips switch without navigating", async () => {
    await renderV2(<TicketPager id="t2" />);
    expect(screen.getByText("Ticket 2 of 3")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Ticket 2" }).props.accessibilityState).toEqual({ selected: true });
    // the pager holds the event's tickets already loaded (no reload to move between them)
    expect(screen.getByText("Holder t2")).toBeTruthy();
    expect(screen.getByText("qr:tok-promo")).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Ticket 3" }));
    expect(screen.getByText("Ticket 3 of 3")).toBeTruthy();
    expect(mockNav.push).not.toHaveBeenCalled();
    expect(mockNav.replace).not.toHaveBeenCalled();
    expect(screen.getByText("Courtesy")).toBeTruthy(); // info follows the shown ticket
  });

  it("swiping the pager changes the ticket", async () => {
    await renderV2(<TicketPager id="t1" />);
    expect(screen.getByText("$17.49")).toBeTruthy();
    fireEvent(screen.getByLabelText("Ticket 1 of 3"), "momentumScrollEnd", { nativeEvent: { contentOffset: { x: 750 * 1, y: 0 } } });
    expect(await screen.findByText("Ticket 2 of 3")).toBeTruthy();
  });

  it("QR zoom, directions, help, share", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    await renderV2(<TicketPager id="t1" />);
    await fireEvent.press(screen.getAllByRole("button", { name: "Enlarge QR" })[0]!);
    expect(screen.getByText("Tap anywhere to close")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await fireEvent.press(screen.getByRole("button", { name: "Directions" }));
    expect(open).toHaveBeenCalledWith("https://www.google.com/maps/search/?api=1&query=Club%20Uno%2C%20Quito");
    await fireEvent.press(screen.getByRole("button", { name: "Help" }));
    expect(mockNav.push).toHaveBeenCalledWith("/support");
    await fireEvent.press(screen.getByRole("button", { name: "Share" }));
    expect(share).toHaveBeenCalledWith({ message: "https://flme.co/events/ev-soon" });
  });

  it("not found → back to my tickets; a single ticket has no chips", async () => {
    await renderV2(<TicketPager id="nope" />);
    expect(screen.getByText("We couldn’t find this ticket")).toBeTruthy();
    await fireEvent.press(screen.getByText("Go to my tickets"));
    expect(mockNav.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("past ticket alone: no chips, checked in", async () => {
    await renderV2(<TicketPager id="past1" />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Already used at the door")).toBeTruthy();
  });
});
