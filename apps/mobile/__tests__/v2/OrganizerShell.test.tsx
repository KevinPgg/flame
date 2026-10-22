/** Organizer frame (fase 1b): menu and bottom bar entries by role, like the web shell. */
import { Text } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import { OrganizerShell } from "../../components/v2/OrganizerShell";
import { event, org, renderV2 } from "./helpers";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../lib/api", () => ({
  apiGet: jest.fn(async () => ({ hasOrganization: true, organizations: [] })),
  apiClient: jest.fn(),
}));
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => ({ isSignedIn: true, getToken: async () => "t" }) }));
jest.mock("../../hooks/useStripeConnect", () => ({
  useStripeConnect: (id?: string) => ({
    status: id ? { connected: true, chargesEnabled: false, payoutsEnabled: false } : null,
    isLoading: false,
  }),
}));

const tabs = () => screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel);

it("owner: Events, RSVPs (badge), Team, Payouts, Settings", async () => {
  await renderV2(
    <OrganizerShell organization={org("owner")} pending={3} currentEvents={[]} title="Kora">
      <Text>body</Text>
    </OrganizerShell>,
  );
  expect(tabs()).toEqual(["Events", "RSVPs", "Team", "Payouts", "Settings"]);
  expect(screen.getByText("3")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Team"));
  expect(mockPush).toHaveBeenCalledWith("/org-members?orgId=org-1");
});

it("organizer: only Events and RSVPs; menu without create event or Stripe", async () => {
  await renderV2(
    <OrganizerShell organization={org("organizer")} pending={0} currentEvents={[event("e1", "Night", 2)]} title="Kora">
      <Text>body</Text>
    </OrganizerShell>,
  );
  expect(tabs()).toEqual(["Events", "RSVPs"]);
  await fireEvent.press(screen.getByLabelText("Menu"));
  expect(screen.getByText("Night")).toBeTruthy();
  expect(screen.queryByText("Create event")).toBeNull();
  expect(screen.queryByText("Finish Stripe setup")).toBeNull();
});

it("owner menu: create event and unfinished Stripe → payouts", async () => {
  await renderV2(
    <OrganizerShell organization={org("owner")} pending={0} currentEvents={[]} title="Kora">
      <Text>body</Text>
    </OrganizerShell>,
  );
  await fireEvent.press(screen.getByLabelText("Menu"));
  await fireEvent.press(screen.getByText("Finish Stripe setup"));
  expect(mockPush).toHaveBeenCalledWith("/account?tab=payouts&orgId=org-1");
});

it("hideTabbar: no bottom bar (full-screen forms)", async () => {
  await renderV2(
    <OrganizerShell organization={org("owner")} pending={0} currentEvents={[]} title="Kora" hideTabbar>
      <Text>body</Text>
    </OrganizerShell>,
  );
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
});
