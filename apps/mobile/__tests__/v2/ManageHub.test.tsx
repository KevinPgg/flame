/** "Manage organization" hub (prototype): team, payouts, settings for owner/admin. */
import { fireEvent, screen } from "@testing-library/react-native";
import { ManageHub } from "../../components/v2/ManageHub";
import { org, renderV2 } from "./helpers";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text>{`redirect:${href}`}</Text>;
  },
}));
const mockApiGet = jest.fn();
jest.mock("../../lib/api", () => ({ apiGet: (...a: unknown[]) => mockApiGet(...a), apiClient: jest.fn() }));
jest.mock("../../hooks/useStripeConnect", () => ({ useStripeConnect: () => ({ status: null, isLoading: false }) }));

beforeEach(() => {
  mockPush.mockReset();
  mockApiGet.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/organizer/data")) return { organization: {}, events: [] };
    if (url.endsWith("/members")) return { members: [{}, {}, {}, {}] };
    if (url.startsWith("/api/organizer/payouts/summary"))
      return { connected: true, defaultCurrency: "usd", balance: { available: [{ amount: 654_963, currency: "usd" }], pending: [] } };
    throw new Error(url);
  });
});

it("rows with live numbers; each opens its screen", async () => {
  await renderV2(<ManageHub organization={org("owner", { name: "Kora Experiences" })} />);
  expect(screen.getByText("Everything about running Kora Experiences — not a specific event — lives here.")).toBeTruthy();
  expect(await screen.findByText("4 members")).toBeTruthy();
  expect(await screen.findByText("$6,549.63 available")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Team"));
  expect(mockPush).toHaveBeenCalledWith("/org-members?orgId=org-1");
  await fireEvent.press(screen.getByLabelText("Settings"));
  expect(mockPush).toHaveBeenCalledWith("/account?tab=organization&orgId=org-1");
});

it("Stripe not connected", async () => {
  mockApiGet.mockImplementation(async (url: string) =>
    url.startsWith("/api/organizer/payouts/summary") ? { connected: false } : url.endsWith("/members") ? { members: [] } : { events: [] },
  );
  await renderV2(<ManageHub organization={org("admin")} />, "es");
  expect(await screen.findByText("Conecta Stripe para cobrar")).toBeTruthy();
  expect(screen.getByText("Gestionar organización")).toBeTruthy();
});

it("organizer role → back to the dashboard", async () => {
  await renderV2(<ManageHub organization={org("organizer")} />);
  expect(screen.getByText("redirect:/v2/organizer?org=kora")).toBeTruthy();
});
