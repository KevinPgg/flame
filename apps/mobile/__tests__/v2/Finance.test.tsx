/** Finance v2 in the app (prototype ow:finance, 2026-11-02). */
import { fireEvent, screen } from "@testing-library/react-native";
import { FinanceScreen } from "../../components/v2/manage/FinanceScreen";
import { org, renderV2 } from "./helpers";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  Redirect: () => null,
}));
const mockApiGet = jest.fn();
jest.mock("../../lib/api", () => ({ apiGet: (...a: unknown[]) => mockApiGet(...a), apiClient: jest.fn() }));

const purchase = (quantity: number, basePrice: number) => ({ id: "p", userName: "A", email: "a@x.com", tierName: "T1", stageName: null, quantity, totalPrice: basePrice + 200, basePrice, scanned: false, createdAt: "" });
const ev = (id: string, name: string, starts: string, extra: object = {}) => ({
  id, name, starts_at: starts, ends_at: starts, timezone: "America/Guayaquil", currency: "USD", ticket_tiers: [], purchases: [], bank_transfer_orders: [], promotional_tickets: [], promoter_links: [], ...extra,
});

beforeEach(() => {
  mockPush.mockReset();
  mockApiGet.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/organizer/data"))
      return {
        events: [
          ev("e1", "Salsa Night", "2026-09-10T03:00:00Z", { purchases: [purchase(2, 2000)], promoter_links: [{ id: "l", promoter_code: "x", total_tickets_sold: 2 }] }),
          ev("e2", "Luna", "2026-12-10T03:00:00Z", { purchases: [purchase(1, 1500)] }),
        ],
      };
    if (url.startsWith("/api/organizer/payouts/summary"))
      return { connected: true, defaultCurrency: "usd", balance: { available: [{ amount: 9_900, currency: "usd" }], pending: [] } };
    throw new Error(url);
  });
});

it("totals, ready to withdraw, rows open Breakdown", async () => {
  await renderV2(<FinanceScreen organization={org("owner")} />);
  expect(await screen.findByText("$35.00")).toBeTruthy();
  expect(screen.getByText("2 tickets from promoter links")).toBeTruthy();
  expect(await screen.findByText("$99.00")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Salsa Night"));
  expect(mockPush).toHaveBeenCalledWith("/v2/organizer/event/e1?org=kora&tab=breakdown");
  await fireEvent.press(screen.getByLabelText("Ready to withdraw"));
  expect(mockPush).toHaveBeenCalledWith("/v2/organizer/payouts?org=kora");
});

it("organizer role → owners only", async () => {
  await renderV2(<FinanceScreen organization={org("organizer")} />);
  expect(screen.queryByText("$35.00")).toBeNull();
});
