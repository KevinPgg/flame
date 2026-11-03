/**
 * One Settings for the person (fase 1b.5b): account, language, notifications through the API,
 * scan, help, sign out, delete account (two confirmations). Signed out: scan with code + sign in.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { UserSettings } from "../../components/v2/settings/UserSettings";
import { clerkAccountPortalUrl } from "../../lib/v2/clerk-portal";
import { renderV2 } from "./helpers";
import { AttendeeCityProvider } from "../../contexts/AttendeeCityContext";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
const mockApiGet = jest.fn();
const mockApiClient = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiClient: (...a: unknown[]) => mockApiClient(...a),
  apiUploadFormData: jest.fn(),
}));
const mockAuth = { isSignedIn: true as boolean | undefined, getToken: async () => "tok", signOut: jest.fn(async () => {}) };
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => mockAuth }));
jest.mock("../../lib/notifications", () => ({ deregisterPushToken: jest.fn(async () => {}) }));
jest.mock("../../lib/scanner-platform", () => ({ SCANNING_SUPPORTED: true }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.2.3" }));
jest.mock("expo-image-picker", () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: "jpeg" } }));
jest.mock("../../hooks/useAppEvents", () => ({
  useAppEvents: () => ({ data: { rawEvents: [{ city: "Quito" }, { city: "Quito" }, { city: "Guayaquil" }] } }),
}));
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

let orgs: unknown[] = [];
beforeEach(() => {
  [mockReplace, mockPush, mockApiClient, mockAuth.signOut].forEach((m) => m.mockReset());
  mockAuth.isSignedIn = true;
  orgs = [];
  mockApiClient.mockImplementation(async (url: string, opts: { body?: string }) =>
    url === "/api/me/notification-preferences" ? { preferences: { ...base, ...JSON.parse(opts.body ?? "{}") } } : {},
  );
  mockApiGet.mockReset().mockImplementation(async (url: string) => {
    if (url === "/api/user/profile") return { id: "u1", email: "ana@x.com", first_name: "Ana", last_name: "Ruiz", profile_image_url: null };
    if (url === "/api/me/profile") return { email: "ana@x.com", first_name: "Ana", last_name: "Ruiz", instagram: null, avatar_color: null, photo_url: null };
    if (url === "/api/me/notification-preferences") return { preferences: base };
    if (url === "/api/organizations") return { organizations: orgs };
    throw new Error(url);
  });
});
const base = {
  rsvp_pending: true, rsvp_approved: true, rsvp_rejected: true, ticket_received: true, event_date_changed: true,
  event_reminder: true, new_rsvp_request: true, ticket_sold: false, auth_expiry_warning: true,
};

describe("settings, signed in", () => {
  it("account row opens our own security screen (no profile card); language, version; organizer notifications only for members", async () => {
    await renderV2(<UserSettings />);
    expect(screen.queryByText("Ana Ruiz")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Password, e-mails and security"));
    expect(mockPush).toHaveBeenCalledWith("/v2/account-security");
    expect(screen.getByLabelText(/^Language: English/)).toBeTruthy();
    expect(screen.getByText("Version 1.2.3")).toBeTruthy();
    expect(await screen.findByRole("switch", { name: "Event reminders" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Ticket sales" })).toBeNull();
  });

  it("toggling a notification PUTs only that change; 'ticket received' can't be turned off", async () => {
    orgs = [{ id: "org-1", name: "Kora", slug: "kora", approved: true, role: "owner" }];
    await renderV2(<UserSettings />);
    const sales = await screen.findByRole("switch", { name: "Ticket sales" });
    expect(sales.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(sales);
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith("/api/me/notification-preferences", expect.objectContaining({ method: "PUT", body: JSON.stringify({ ticket_sold: true }) })),
    );
    mockApiClient.mockClear();
    const received = screen.getByRole("switch", { name: "Ticket received" });
    expect(received.props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    await fireEvent.press(received);
    expect(mockApiClient).not.toHaveBeenCalled();
  });

  it("delete account asks twice, then deletes and signs out", async () => {
    await renderV2(<UserSettings />);
    await fireEvent.press(await screen.findByText("Delete account"));
    expect(screen.getByText("Delete your Flame account?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Continue"));
    expect(mockApiClient).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Yes, delete forever"));
    await waitFor(() => expect(mockApiClient).toHaveBeenCalledWith("/api/user/delete", expect.objectContaining({ method: "DELETE" })));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockAuth.signOut).toHaveBeenCalled();
  });

  it("scan opens the account scanner; sign out", async () => {
    await renderV2(<UserSettings />);
    await fireEvent.press(await screen.findByLabelText("Scan tickets"));
    expect(mockPush).toHaveBeenCalledWith("/v2/scanner");
    await fireEvent.press(screen.getByText("Sign out"));
    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});

describe("home city (saved on this phone)", () => {
  it("Automatic by default; choosing a city saves it on the phone; Automatic clears it; works signed out", async () => {
    mockStore.clear();
    mockAuth.isSignedIn = false;
    await renderV2(
      <AttendeeCityProvider>
        <UserSettings />
      </AttendeeCityProvider>,
    );
    const row = await screen.findByLabelText("Open Home on: Automatic");
    await fireEvent.press(row);
    expect(screen.getByRole("radio", { name: "All cities" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Guayaquil" }));
    await waitFor(() => expect(mockStore.get("flme.v2.defaultCity")).toBe("Guayaquil"));
    await fireEvent.press(screen.getByLabelText("Open Home on: Guayaquil"));
    await fireEvent.press(screen.getByRole("radio", { name: "Automatic" }));
    await waitFor(() => expect(mockStore.has("flme.v2.defaultCity")).toBe(false));
  });

  it("not shown outside the app frame (no city provider)", async () => {
    await renderV2(<UserSettings />);
    expect(screen.queryByText("Home city")).toBeNull();
  });
});

describe("settings, signed out", () => {
  it("no account blocks; scan with code; sign in", async () => {
    mockAuth.isSignedIn = false;
    await renderV2(<UserSettings />);
    expect(screen.queryByText("Account")).toBeNull();
    expect(screen.queryByText("Notifications")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Scan tickets"));
    expect(mockPush).toHaveBeenCalledWith("/scanner?public=1");
    await fireEvent.press(screen.getByText("Sign in"));
    expect(mockPush).toHaveBeenCalledWith("/sign-in");
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});

describe("Clerk account portal URL", () => {
  const pk = (host: string, kind = "test") => `pk_${kind}_${Buffer.from(`${host}$`).toString("base64")}`;
  it("derived from the publishable key; override wins; unknown → null", () => {
    expect(clerkAccountPortalUrl(pk("clerk.flme.co", "live"))).toBe("https://accounts.flme.co/user");
    expect(clerkAccountPortalUrl(pk("happy-cat-12.clerk.accounts.dev"))).toBe("https://happy-cat-12.accounts.dev/user");
    expect(clerkAccountPortalUrl(pk("x.clerk.accounts.dev"), "https://custom/user")).toBe("https://custom/user");
    expect(clerkAccountPortalUrl("nope")).toBeNull();
    expect(clerkAccountPortalUrl(pk("weird.example.com"))).toBeNull();
  });
});
