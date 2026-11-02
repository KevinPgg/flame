/** Fase 4.1 Guardar eventos (app): heart on cards, shared cache, signed-out → sign in. */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { EventTile } from "../../components/v2/attendee/EventTile";
import { SaveButton } from "../../components/v2/attendee/SaveButton";
import { renderV2, inDays } from "./helpers";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));
const mockAuth = { isSignedIn: true as boolean };
jest.mock("../../hooks/useOptionalAuth", () => ({
  useOptionalAuth: () => ({ getToken: async () => "tok", isSignedIn: mockAuth.isSignedIn }),
}));
const mockApiGet = jest.fn();
const mockApiClient = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiClient: (...a: unknown[]) => mockApiClient(...a),
}));

const EV = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "biblos",
  name: "Biblos",
  image_url: null,
  starts_at: inDays(2),
  ends_at: inDays(2.2),
  timezone: "America/Guayaquil",
  currency: "USD",
  ticket_tiers: [],
};

beforeEach(() => {
  [mockPush, mockApiGet, mockApiClient].forEach((m) => m.mockReset());
  mockAuth.isSignedIn = true;
  mockApiGet.mockResolvedValue({ events: [] });
  mockApiClient.mockResolvedValue({});
});

it("saves and un-saves with PUT; both hearts of the same event follow", async () => {
  await renderV2(
    <>
      <EventTile event={EV} width={150} />
      <SaveButton event={{ id: EV.id, name: "Biblos" }} variant="circle" />
    </>,
  );
  await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith("/api/me/saved-events", expect.any(Function)));
  await fireEvent.press(screen.getAllByLabelText("Save Biblos")[0]!);
  expect(mockApiClient).toHaveBeenCalledWith(
    "/api/me/saved-events",
    expect.objectContaining({ method: "PUT", body: JSON.stringify({ event_id: EV.id, saved: true }) }),
  );
  expect(await screen.findAllByLabelText("Remove Biblos from saved")).toHaveLength(2);

  await fireEvent.press(screen.getAllByLabelText("Remove Biblos from saved")[1]!);
  expect(mockApiClient).toHaveBeenLastCalledWith(
    "/api/me/saved-events",
    expect.objectContaining({ body: JSON.stringify({ event_id: EV.id, saved: false }) }),
  );
  expect(await screen.findAllByLabelText("Save Biblos")).toHaveLength(2);
});

it("starts filled when already saved, and goes back if the API fails", async () => {
  mockApiGet.mockResolvedValue({ events: [EV] });
  mockApiClient.mockRejectedValue(new Error("boom"));
  await renderV2(<EventTile event={EV} width={150} />);
  await fireEvent.press(await screen.findByLabelText("Remove Biblos from saved"));
  expect(await screen.findByLabelText("Remove Biblos from saved")).toBeTruthy();
});

it("signed out: the heart opens sign in and calls nothing", async () => {
  mockAuth.isSignedIn = false;
  await renderV2(<EventTile event={EV} width={150} />);
  await fireEvent.press(screen.getByLabelText("Save Biblos"));
  expect(mockPush).toHaveBeenCalledWith("/sign-in");
  expect(mockApiGet).not.toHaveBeenCalled();
  expect(mockApiClient).not.toHaveBeenCalled();
});

it("past event card: no heart unless asked", async () => {
  await renderV2(<EventTile event={EV} width={150} past />);
  expect(screen.queryByLabelText("Save Biblos")).toBeNull();
});
