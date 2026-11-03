/** Edit profile in the app (2026-11-02): name, Instagram, colour; Clerk errors shown. */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { EditProfile } from "../../components/v2/attendee/you/EditProfile";
import { renderV2 } from "./helpers";

const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock("expo-router", () => ({ useRouter: () => mockNav }));
const mockApiGet = jest.fn();
const mockApiClient = jest.fn();
jest.mock("../../lib/api", () => {
  class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { ApiError, apiGet: (...a: unknown[]) => mockApiGet(...a), apiClient: (...a: unknown[]) => mockApiClient(...a), apiUploadFormData: jest.fn() };
});
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => ({ isSignedIn: true, getToken: jest.fn() }) }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" } }));

beforeEach(() => {
  mockNav.back.mockReset();
  mockApiClient.mockReset().mockResolvedValue({});
  mockApiGet.mockReset().mockResolvedValue({ email: "ana@x.com", first_name: "Ana", last_name: "Ruiz", instagram: null, avatar_color: null, photo_url: null });
});

it("saves the normalized values and goes back", async () => {
  await renderV2(<EditProfile />);
  await fireEvent.changeText(await screen.findByLabelText("First name"), "Ana María");
  await fireEvent.changeText(screen.getByLabelText("Instagram"), "instagram.com/ana.r");
  await fireEvent.press(screen.getByLabelText("Colour 4"));
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mockNav.back).toHaveBeenCalled());
  const [url, opts] = mockApiClient.mock.calls[0];
  expect(url).toBe("/api/me/profile");
  expect(JSON.parse(opts.body)).toEqual({ first_name: "Ana María", last_name: "Ruiz", instagram: "ana.r", avatar_color: "#1B4D3E" });
});

it("empty first name → error, nothing sent", async () => {
  await renderV2(<EditProfile />);
  await fireEvent.changeText(await screen.findByLabelText("First name"), "");
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByText("Write your first name.")).toBeTruthy();
  expect(mockApiClient).not.toHaveBeenCalled();
});

it("Clerk refused the name → message, stays", async () => {
  const { ApiError } = jest.requireMock("../../lib/api");
  mockApiClient.mockRejectedValueOnce(new ApiError(502, "x", "NAME_NOT_SAVED"));
  await renderV2(<EditProfile />);
  await fireEvent.changeText(await screen.findByLabelText("First name"), "Otra");
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("We couldn’t change your name. Try again.")).toBeTruthy();
  expect(mockNav.back).not.toHaveBeenCalled();
});
