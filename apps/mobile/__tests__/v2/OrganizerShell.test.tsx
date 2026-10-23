/**
 * Organizer frame (fase 1b, phone design of the prototype): bottom bar Events · RSVPs · Scan ·
 * Manage by role, organization switcher on the title, "you" avatar back to the profile.
 */
import { Text } from "react-native";
import { screen } from "@testing-library/react-native";
import { fireEvent } from "@testing-library/react-native";
import { OrganizerShell } from "../../components/v2/OrganizerShell";
import { org, renderV2 } from "./helpers";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../lib/api", () => ({
  apiGet: jest.fn(async () => ({
    hasOrganization: true,
    organizations: [
      { id: "org-1", name: "Kora Club", slug: "kora", approved: true, role: "owner", logo_url: null },
      { id: "org-2", name: "Luna Bar", slug: "luna", approved: true, role: "admin", logo_url: null },
      { id: "org-3", name: "Pending Co", slug: "pend", approved: false, role: "owner", logo_url: null },
    ],
  })),
  apiClient: jest.fn(),
}));
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => ({ isSignedIn: true, getToken: async () => "t" }) }));
jest.mock("../../hooks/useStripeConnect", () => ({ useStripeConnect: () => ({ status: null, isLoading: false }) }));

const tabs = () => screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel);
const shell = (role: Parameters<typeof org>[0], extra = {}) =>
  renderV2(
    <OrganizerShell organization={org(role)} pending={3} title="Kora Club" {...extra}>
      <Text>body</Text>
    </OrganizerShell>,
  );

beforeEach(() => mockPush.mockReset());

it("owner/admin: Events, RSVPs (badge), Scan, Manage — no side menu", async () => {
  await shell("owner");
  expect(tabs()).toEqual(["Events", "RSVPs", "Scan", "Manage"]);
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.queryByLabelText("Menu")).toBeNull();
  await fireEvent.press(screen.getByLabelText("Manage"));
  expect(mockPush).toHaveBeenCalledWith("/v2/organizer/manage?org=kora");
  await fireEvent.press(screen.getByLabelText("Scan"));
  expect(mockPush).toHaveBeenCalledWith("/v2/scanner?org=kora");
});

it("organizer: Events, RSVPs, Scan", async () => {
  await shell("organizer");
  expect(tabs()).toEqual(["Events", "RSVPs", "Scan"]);
});

it("viewer: Events, RSVPs, Scan (any member can scan)", async () => {
  await shell("viewer");
  expect(tabs()).toEqual(["Events", "RSVPs", "Scan"]);
});

it("title switches organization (approved ones) and the avatar goes back to you", async () => {
  await shell("owner", { switcher: true });
  await fireEvent.press(screen.getByLabelText("Switch organizer"));
  expect(await screen.findByText("Luna Bar")).toBeTruthy();
  expect(screen.queryByText("Pending Co")).toBeNull();
  await fireEvent.press(screen.getByText("Luna Bar"));
  expect(mockPush).toHaveBeenCalledWith("/v2/organizer?org=luna");
  await fireEvent.press(screen.getByLabelText("Attendee app"));
  expect(mockPush).toHaveBeenCalledWith("/profile");
});

it("hideTabbar: no bottom bar (full-screen forms)", async () => {
  await shell("owner", { hideTabbar: true });
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
});
