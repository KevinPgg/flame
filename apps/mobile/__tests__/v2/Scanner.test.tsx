/**
 * Door scanner v2 in the app (fase 1b.6): events by account (no access code), verify → check in
 * with the session, results, flash on/off, link to the access-code scanner.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { ScannerApp } from "../../components/v2/scanner/ScannerApp";
import { inDays, renderV2 } from "./helpers";

const mockPush = jest.fn();
const mockRoute: { event?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, setParams: (p: { event: string }) => (mockRoute.event = p.event || undefined) }),
  useLocalSearchParams: () => mockRoute,
}));
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
jest.mock("../../lib/api", () => ({ apiGet: (...a: unknown[]) => mockApiGet(...a), apiPost: (...a: unknown[]) => mockApiPost(...a), apiClient: jest.fn() }));
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => ({ isSignedIn: true, getToken: async () => "t" }) }));

const mockCameras: Array<{ onBarcodeScanned?: (r: { data: string }) => void; enableTorch?: boolean; key: number }> = [];
jest.mock("expo-camera", () => {
  const { View } = require("react-native");
  let mounts = 0;
  return {
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, async () => ({ granted: true })],
    CameraView: function CameraView(props: { onBarcodeScanned?: (r: { data: string }) => void; enableTorch?: boolean }) {
      const React = require("react");
      const [id] = React.useState(() => ++mounts);
      mockCameras.push({ onBarcodeScanned: props.onBarcodeScanned, enableTorch: props.enableTorch, key: id });
      return <View testID="scanner-camera" />;
    },
  };
});

const EVENTS = [
  { id: "ev-live", name: "Live Party", starts_at: inDays(-0.05), ends_at: inDays(0.2), venue: "Club", city: "GYE", timezone: "America/Guayaquil", image_url: null, organization_name: "Kora" },
  { id: "ev-next", name: "Next Week", starts_at: inDays(7), ends_at: inDays(7.2), venue: null, city: null, timezone: "America/Guayaquil", image_url: null, organization_name: "Partner" },
];
const qr = (eventId: string) => JSON.stringify({ orderId: "o1", eventId, ticketNumber: 2, userId: "u" });
const lastCamera = () => mockCameras[mockCameras.length - 1]!;

beforeEach(() => {
  mockPush.mockReset();
  mockApiPost.mockReset();
  mockCameras.length = 0;
  delete mockRoute.event;
  mockApiGet.mockReset().mockResolvedValue({ events: EVENTS });
});

it("lists the events this account can scan and opens the only one on right now", async () => {
  await renderV2(<ScannerApp onExit={jest.fn()} />);
  expect(await screen.findByText("Next Week")).toBeTruthy();
  expect(screen.getByText("Now")).toBeTruthy();
  expect(mockApiGet).toHaveBeenCalledWith("/api/qr-scanner/events", expect.any(Function));
  await waitFor(() => expect(mockRoute.event).toBe("ev-live"));
  await fireEvent.press(screen.getByText("Have an access code? Scan with the code"));
  expect(mockPush).toHaveBeenCalledWith("/scanner?public=1");
});

it("valid ticket → check in with the session (no access code) → recent scans", async () => {
  mockRoute.event = "ev-live";
  mockApiPost.mockImplementation(async (url: string) =>
    url.endsWith("/verify")
      ? { ticket: { id: "tk1", attendee_name: "Ana Ruiz", status: "valid", checked_in_at: null, ticket_tier: { name: "VIP" }, order: { quantity: 3 }, sequence_number: 2 }, isPromotionalTicket: false }
      : { checked_in_at: new Date().toISOString() },
  );
  await renderV2(<ScannerApp onExit={jest.fn()} />);
  await fireEvent.press(await screen.findByText("Activate camera"));
  await waitFor(() => lastCamera().onBarcodeScanned?.({ data: qr("ev-live") }));
  expect(await screen.findByText("Valid ticket")).toBeTruthy();
  expect(screen.getByText("VIP · Ticket 2 of 3")).toBeTruthy();
  const [, body] = mockApiPost.mock.calls[0]!;
  expect(body).not.toHaveProperty("accessCode");
  await fireEvent.press(screen.getByText("Check in"));
  expect(mockApiPost).toHaveBeenLastCalledWith("/api/qr-scanner/checkin", expect.objectContaining({ ticketId: "tk1", isPromotionalTicket: false }), expect.any(Function));
  expect((await screen.findAllByText("Checked in")).length).toBe(2); // result + recent scans
});

it("ticket for another event, and already checked in (409)", async () => {
  mockRoute.event = "ev-live";
  await renderV2(<ScannerApp onExit={jest.fn()} />);
  await fireEvent.press(await screen.findByText("Activate camera"));
  await waitFor(() => lastCamera().onBarcodeScanned?.({ data: qr("ev-next") }));
  expect((await screen.findAllByText("This ticket is for another event")).length).toBe(2); // result + recent scans
  expect(mockApiPost).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Scan next"));

  mockApiPost.mockRejectedValueOnce(Object.assign(new Error("Ticket already checked in"), { status: 409 }));
  await waitFor(() => lastCamera().onBarcodeScanned?.({ data: JSON.stringify({ orderId: "o9", eventId: "ev-live", ticketNumber: 1 }) }));
  expect((await screen.findAllByText("Already checked in")).length).toBeGreaterThan(0);
});

it("flash: on, then off remounts the camera with the torch off", async () => {
  mockRoute.event = "ev-live";
  await renderV2(<ScannerApp onExit={jest.fn()} />);
  await fireEvent.press(await screen.findByText("Activate camera"));
  const first = lastCamera().key;
  await fireEvent.press(screen.getByLabelText("Flash on"));
  expect(lastCamera().enableTorch).toBe(true);
  await fireEvent.press(screen.getByLabelText("Flash off"));
  expect(lastCamera().enableTorch).toBe(false);
  expect(lastCamera().key).not.toBe(first);
});

it("no events: explains how to be added", async () => {
  mockApiGet.mockResolvedValue({ events: [] });
  await renderV2(<ScannerApp onExit={jest.fn()} />);
  expect(await screen.findByText(/Ask the organizer to add you/)).toBeTruthy();
});
