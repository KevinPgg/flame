/** Unread badge on the bell (2026-11-02): two digits must fit — 21 showed as "2" on Android. */
import { screen } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { AttendeeTopBar, badgeLabel, badgeWidth } from "../../components/v2/attendee/AttendeeTopBar";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => "/" }));
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => ({ isSignedIn: true }) }));
jest.mock("../../components/FlameLogo", () => ({ FlameLogo: () => null }));

describe("bell badge", () => {
  it("label and width grow with the digits", () => {
    expect(badgeLabel(7)).toBe("7");
    expect(badgeLabel(21)).toBe("21");
    expect(badgeLabel(150)).toBe("99+");
    expect(badgeWidth("7")).toBe(18);
    expect(badgeWidth("21")).toBe(24);
    expect(badgeWidth("99+")).toBe(30);
  });

  it("shows the whole number", async () => {
    await renderV2(<AttendeeTopBar unreadCount={21} />);
    expect(screen.getByText("21")).toBeTruthy();
  });
});
