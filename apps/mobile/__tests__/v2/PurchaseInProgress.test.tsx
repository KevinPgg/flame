/** Floating "Purchase in progress" in the app (Kevin 2026-10-28). */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { PurchaseInProgress, inProgressPlacement } from "../../components/v2/attendee/PurchaseInProgress";

const mockNav = { push: jest.fn(), path: "/" };
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockNav.push }), usePathname: () => mockNav.path }));
jest.mock("../../hooks/useOptionalAuth", () => ({
  useOptionalAuth: () => ({ getToken: async () => "tok", isSignedIn: true, isConfigured: true, userId: "u1" }),
}));

const HOLD = { id: "h1", expires_at: new Date(Date.now() + 12 * 60_000).toISOString(), quantity: 2, tier: "Tier 1", event: { name: "White Party", slug: "white-party", image_url: null } };

describe("PurchaseInProgress (app)", () => {
  it("where it sits", () => {
    expect(inProgressPlacement("/checkout/h1")).toBe("hidden");
    expect(inProgressPlacement("/event/e1")).toBe("aboveBuyBar");
    expect(inProgressPlacement("/discover")).toBe("aboveTabBar");
  });

  it("shows the running reservation; Continue opens the payment screen; ✕ hides it", async () => {
    const fetcher = jest.fn(async () => ({ hold: HOLD }));
    await renderV2(<PurchaseInProgress fetcher={fetcher as never} />);
    expect(await screen.findByText("White Party")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith("/api/holds/active", expect.any(Function));
    expect(screen.getByText(/^2 × Tier 1 · 1[12]:\d\d left$/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(mockNav.push).toHaveBeenCalledWith("/checkout/h1");
    await fireEvent.press(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("White Party")).toBeNull();
  });

  it("hidden on the payment screen and when there's no reservation", async () => {
    mockNav.path = "/checkout/h1";
    const fetcher = jest.fn(async () => ({ hold: HOLD }));
    await renderV2(<PurchaseInProgress fetcher={fetcher as never} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(screen.queryByTestId("purchase-in-progress")).toBeNull();
    mockNav.path = "/";
  });
});
