/** Fase 4.2 Seguir organizadores (app): Follow button, count moves with it, signed out → sign in. */
import { Text } from "react-native";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { FollowButton } from "../../components/v2/attendee/FollowButton";
import { useFollowerCount } from "../../hooks/useFollowing";
import { renderV2 } from "./helpers";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));
const mockAuth = { isSignedIn: true as boolean };
jest.mock("../../hooks/useOptionalAuth", () => ({
  useOptionalAuth: () => ({ getToken: async () => "tok", isSignedIn: mockAuth.isSignedIn }),
}));
const mockApiGet = jest.fn();
const mockApiGetPublic = jest.fn();
const mockApiClient = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiGetPublic: (...a: unknown[]) => mockApiGetPublic(...a),
  apiClient: (...a: unknown[]) => mockApiClient(...a),
}));

const ORG = { id: "11111111-1111-4111-8111-111111111111", name: "Kora", slug: "kora", logo_url: null, city: "Quito" };

function Count() {
  const q = useFollowerCount(ORG.id);
  return <Text testID="count">{q.data === undefined ? "-" : String(q.data)}</Text>;
}

beforeEach(() => {
  [mockPush, mockApiGet, mockApiGetPublic, mockApiClient].forEach((m) => m.mockReset());
  mockAuth.isSignedIn = true;
  mockApiGet.mockResolvedValue({ organizations: [] });
  mockApiGetPublic.mockResolvedValue({ counts: { [ORG.id]: 12 } });
  mockApiClient.mockResolvedValue({ organization_id: ORG.id, following: true, followers_count: 13 });
});

it("follow: PUT, button turns into Following, the profile count goes 12 → 13", async () => {
  await renderV2(
    <>
      <FollowButton org={ORG} />
      <Count />
    </>,
  );
  await waitFor(() => expect(screen.getByTestId("count").props.children).toBe("12"));
  expect(mockApiGetPublic).toHaveBeenCalledWith(`/api/organizations/followers?ids=${ORG.id}`);
  await fireEvent.press(screen.getByLabelText("Follow Kora"));
  expect(mockApiClient).toHaveBeenCalledWith(
    "/api/me/following",
    expect.objectContaining({ method: "PUT", body: JSON.stringify({ organization_id: ORG.id, following: true }) }),
  );
  expect(await screen.findByText("Following")).toBeTruthy();
  expect(screen.getByTestId("count").props.children).toBe("13");
});

it("unfollow goes back if the API fails", async () => {
  mockApiGet.mockResolvedValue({ organizations: [{ ...ORG, followers_count: 12 }] });
  mockApiClient.mockRejectedValue(new Error("boom"));
  await renderV2(<FollowButton org={ORG} />);
  await fireEvent.press(await screen.findByLabelText("Unfollow Kora"));
  expect(await screen.findByLabelText("Unfollow Kora")).toBeTruthy();
});

it("signed out: opens sign in, calls nothing", async () => {
  mockAuth.isSignedIn = false;
  await renderV2(<FollowButton org={ORG} />);
  await fireEvent.press(screen.getByLabelText("Follow Kora"));
  expect(mockPush).toHaveBeenCalledWith("/sign-in");
  expect(mockApiGet).not.toHaveBeenCalled();
  expect(mockApiClient).not.toHaveBeenCalled();
});
