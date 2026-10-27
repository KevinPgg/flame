/** Fase 2.1: attendee top bar + tab bar (app). */
import { fireEvent, screen } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { AttendeeTabBar, activeAttendeeTab } from "../../components/v2/attendee/AttendeeTabBar";
import { AttendeeTopBar } from "../../components/v2/attendee/AttendeeTopBar";
import { attendeeV2Enabled } from "../../lib/v2/flags";

const mockNav = { push: jest.fn(), replace: jest.fn(), path: "/" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockNav.push, replace: mockNav.replace }),
  usePathname: () => mockNav.path,
}));
const mockAuth = { isSignedIn: true as boolean | undefined };
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => ({ isSignedIn: mockAuth.isSignedIn }) }));
jest.mock("../../components/FlameLogo", () => ({ FlameLogo: () => null }));

beforeEach(() => {
  mockNav.push.mockReset();
  mockNav.replace.mockReset();
  mockNav.path = "/";
  mockAuth.isSignedIn = true;
});

describe("attendee tab bar", () => {
  it("Home · Explore · Tickets · You, the current one selected", async () => {
    mockNav.path = "/dashboard";
    await renderV2(<AttendeeTabBar />);
    expect(screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel)).toEqual(["Home", "Explore", "Tickets", "You"]);
    expect(screen.getByRole("tab", { name: "Tickets" }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole("tab", { name: "Home" }).props.accessibilityState).toEqual({ selected: false });
  });

  it("goes to each section; tapping the current one does nothing", async () => {
    await renderV2(<AttendeeTabBar />);
    await fireEvent.press(screen.getByRole("tab", { name: "Explore" }));
    await fireEvent.press(screen.getByRole("tab", { name: "You" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Home" }));
    expect(mockNav.push.mock.calls.map((c) => c[0])).toEqual(["/discover", "/profile"]);
  });

  it("signed out: Tickets and You ask to sign in; Explore doesn't", async () => {
    mockAuth.isSignedIn = false;
    await renderV2(<AttendeeTabBar />);
    await fireEvent.press(screen.getByRole("tab", { name: "Tickets" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Explore" }));
    expect(mockNav.push.mock.calls.map((c) => c[0])).toEqual(["/sign-in", "/discover"]);
  });

  it("while auth is still resolving, the protected tab opens (its own gate waits)", async () => {
    mockAuth.isSignedIn = undefined;
    await renderV2(<AttendeeTabBar />);
    await fireEvent.press(screen.getByRole("tab", { name: "You" }));
    expect(mockNav.push).toHaveBeenCalledWith("/profile");
  });

  it("Spanish", async () => {
    await renderV2(<AttendeeTabBar />, "es");
    expect(screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel)).toEqual(["Inicio", "Explorar", "Tickets", "Tú"]);
  });

  it("which tab a path belongs to", () => {
    expect(activeAttendeeTab("/")).toBe("home");
    expect(activeAttendeeTab("/discover")).toBe("explore");
    expect(activeAttendeeTab("/history")).toBe("tickets");
    expect(activeAttendeeTab("/ticket/abc")).toBe("tickets");
    expect(activeAttendeeTab("/profile")).toBe("you");
    expect(activeAttendeeTab("/event/abc")).toBeNull();
  });
});

describe("attendee top bar", () => {
  it("search, notifications with the unread count, settings", async () => {
    const onBell = jest.fn();
    await renderV2(<AttendeeTopBar unreadCount={3} onNotificationPress={onBell} />);
    await fireEvent.press(screen.getByRole("button", { name: "Notifications, 3 unread" }));
    expect(onBell).toHaveBeenCalled();
    expect(screen.getByText("3")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Search" }));
    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    expect(mockNav.push.mock.calls.map((c) => c[0])).toEqual(["/discover", "/settings"]);
  });

  it("no unread → no number", async () => {
    await renderV2(<AttendeeTopBar unreadCount={0} />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("switch", () => {
  const prev = process.env.EXPO_PUBLIC_ATTENDEE_V1;
  afterEach(() => {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_ATTENDEE_V1;
    else process.env.EXPO_PUBLIC_ATTENDEE_V1 = prev;
  });
  it("v2 by default; EXPO_PUBLIC_ATTENDEE_V1=true brings back v1", () => {
    expect(attendeeV2Enabled()).toBe(true);
    process.env.EXPO_PUBLIC_ATTENDEE_V1 = "true";
    expect(attendeeV2Enabled()).toBe(false);
  });
});
