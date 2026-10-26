/**
 * Manage → Team, Payouts, Organization settings in the app (fase 1b.5a): same endpoints and rules
 * as the web v2 (TeamView, PayoutsView, SettingsView) and the restricted people search.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { TeamScreen } from "../../components/v2/manage/TeamScreen";
import { PayoutsScreen } from "../../components/v2/manage/PayoutsScreen";
import { OrgSettingsScreen } from "../../components/v2/manage/OrgSettingsScreen";
import { event, org, renderV2 } from "./helpers";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => false, setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiClient = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiPost: (...a: unknown[]) => mockApiPost(...a),
  apiClient: (...a: unknown[]) => mockApiClient(...a),
  apiUploadFormData: jest.fn(),
}));
const mockStripe = { status: null as unknown, isLoading: false, fetchError: null, onboarding: false, onboardError: null, handleConnect: jest.fn(), refreshStatus: jest.fn() };
jest.mock("../../hooks/useStripeConnect", () => ({ useStripeConnect: () => mockStripe }));
jest.mock("../../hooks/v2/useMe", () => ({ useMe: () => ({ name: "Kevin", imageUrl: null, email: "kevin@x.com" }) }));
jest.mock("expo-image-picker", () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: "jpeg" } }));

class FakeApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MEMBERS = [
  { id: "m-1", user_id: "u-kevin", role: "owner", user_first_name: "Kevin", user_last_name: "P", user_email: "kevin@x.com" },
  { id: "m-2", user_id: "u-ana", role: "organizer", user_first_name: "Ana", user_last_name: "Ruiz", user_email: "ana@x.com" },
];
const EVS = [event("ev-1", "Lovin Sunset", 5), event("ev-2", "Kora Night", 9)];

beforeEach(() => {
  [mockReplace, mockApiPost, mockApiClient, mockStripe.handleConnect].forEach((m) => m.mockReset());
  mockApiPost.mockResolvedValue({});
  mockApiClient.mockResolvedValue({});
  mockStripe.status = { connected: true, chargesEnabled: true, payoutsEnabled: true, accountId: "acct" };
  mockApiGet.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/organizer/data")) return { organization: {}, events: EVS, cohost_events: [] };
    if (url.includes("event-assignments?mine")) return { assignments: [] };
    if (url.endsWith("/members")) return { members: MEMBERS };
    if (url.endsWith("/event-assignments")) return { assignments: [{ user_id: "u-ana", event_id: "ev-1" }] };
    if (url.startsWith("/api/organizer/people")) {
      if (url.includes("q=lu")) return { people: [{ id: "u-luis", email: "luis@x.com", first_name: "Luis", last_name: "Mora", related: true }] };
      if (url.includes("q=zoe%40x.com")) return { people: [{ id: "u-zoe", email: "zoe@x.com", first_name: null, last_name: null, related: false }] };
      return { people: [] };
    }
    if (url.startsWith("/api/organizer/payouts/summary"))
      return { connected: true, defaultCurrency: "usd", schedule: "manual", balance: { available: [{ amount: 12000, currency: "usd" }], pending: [{ amount: 3000, currency: "usd" }] }, payouts: [{ id: "po_1", amount: 5000, currency: "usd", status: "paid", arrival_date: 1760000000, created: 1760000000, automatic: false }], bank: { bankName: "Pichincha", last4: "4321", currency: "usd" } };
    if (url === "/api/organizations/org-1") return { organization: { id: "org-1", name: "Kora Club", slug: "kora", instagram_handle: "kora", city: "Guayaquil", description: "Hi", logo_url: null }, role: "owner" };
    throw new Error(url);
  });
});

describe("team", () => {
  it("members with role and events; you; owner has no options", async () => {
    await renderV2(<TeamScreen organization={org("owner")} />);
    expect(await screen.findByText("ana@x.com")).toBeTruthy();
    expect(screen.getByText("(you)")).toBeTruthy();
    expect(await screen.findByText("1 event assigned")).toBeTruthy();
    expect(screen.queryByLabelText("Options for Kevin P")).toBeNull();
    expect(screen.getByLabelText("Options for Ana Ruiz")).toBeTruthy();
  });

  it("add: suggestions as you type (restricted search), pick, role, POST", async () => {
    await renderV2(<TeamScreen organization={org("admin")} />);
    await fireEvent.press(await screen.findByLabelText("Add member"));
    expect(screen.getByText(/Anyone else: type their full e-mail/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Name or e-mail"), "lu");
    await fireEvent.press(await screen.findByLabelText("Luis Mora luis@x.com"));
    await fireEvent.press(screen.getByRole("radio", { name: "Admin" }));
    await fireEvent.press(screen.getByText("Add to team"));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith("/api/organizations/org-1/members", { userId: "u-luis", role: "admin" }, expect.any(Function)));
    expect(mockApiGet).toHaveBeenCalledWith("/api/organizer/people?organizationId=org-1&q=lu", expect.any(Function));
  });

  it("someone outside the organization only by full e-mail, tagged", async () => {
    await renderV2(<TeamScreen organization={org("owner")} />);
    await fireEvent.press(await screen.findByLabelText("Add member"));
    await fireEvent.changeText(screen.getByLabelText("Name or e-mail"), "zoe");
    expect(await screen.findByText(/Nobody connected to Kora Club matches|No one connected to Kora Club matches/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Name or e-mail"), "zoe@x.com");
    expect(await screen.findByText("Found by e-mail")).toBeTruthy();
  });

  it("assign events (organizer) sends the checked list; remove asks first", async () => {
    await renderV2(<TeamScreen organization={org("owner")} />);
    await fireEvent.press(await screen.findByLabelText("Options for Ana Ruiz"));
    await fireEvent.press(screen.getByText("Assign events"));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Kora Night" }));
    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith("/api/organizations/org-1/event-assignments", expect.objectContaining({ method: "PUT", body: JSON.stringify({ userId: "u-ana", eventIds: ["ev-1", "ev-2"] }) })),
    );
    await fireEvent.press(await screen.findByLabelText("Options for Ana Ruiz"));
    await fireEvent.press(screen.getByText("Remove from team"));
    expect(screen.getByText("Remove Ana Ruiz from the team?")).toBeTruthy();
    await fireEvent.press(screen.getAllByText("Remove from team").at(-1)!);
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith("/api/organizations/members/remove", { orgId: "org-1", memberId: "m-2" }, expect.any(Function)));
  });

  it("assign events: past events aren't offered and their assignments are kept on save", async () => {
    const past = event("ev-old", "Viejo", -10);
    const live = event("ev-live", "En curso", -0.05, { ends_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString() });
    mockApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/organizer/data")) return { organization: {}, events: [past, live, ...EVS], cohost_events: [] };
      if (url.endsWith("/members")) return { members: MEMBERS };
      if (url.endsWith("/event-assignments")) return { assignments: [{ user_id: "u-ana", event_id: "ev-1" }, { user_id: "u-ana", event_id: "ev-old" }] };
      throw new Error(url);
    });
    await renderV2(<TeamScreen organization={org("owner")} />);
    await fireEvent.press(await screen.findByLabelText("Options for Ana Ruiz"));
    await fireEvent.press(screen.getByText("Assign events"));
    expect(screen.queryByRole("checkbox", { name: "Viejo" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "En curso" })).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith("/api/organizations/org-1/event-assignments", expect.objectContaining({ body: JSON.stringify({ userId: "u-ana", eventIds: ["ev-1", "ev-old"] }) })),
    );
  });

  it("organizer role: list only", async () => {
    await renderV2(<TeamScreen organization={org("organizer")} />);
    expect(await screen.findByText("ana@x.com")).toBeTruthy();
    expect(screen.queryByLabelText("Add member")).toBeNull();
    expect(screen.queryByLabelText("Options for Ana Ruiz")).toBeNull();
  });
});

describe("payouts", () => {
  it("balance, history, bank; request asks first and sends an idempotency key", async () => {
    mockApiPost.mockResolvedValue({ payout: { amount: 12000, currency: "usd" } });
    await renderV2(<PayoutsScreen organization={org("owner")} />);
    expect(await screen.findByText("$120.00")).toBeTruthy();
    expect(screen.getByText("$30.00")).toBeTruthy();
    expect(screen.getByText(/Pichincha •• 4321/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Request payout"));
    expect(mockApiPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByText("Request payout").at(-1)!);
    await waitFor(() => expect(mockApiPost).toHaveBeenCalled());
    const [url, body] = mockApiPost.mock.calls[0] as [string, Record<string, string>];
    expect(url).toBe("/api/organizer/payouts/create");
    expect(body).toMatchObject({ organizationId: "org-1", currency: "USD" });
    expect(body.clientIdempotencyKey).toBeTruthy();
  });

  it("one already in progress (409) says so", async () => {
    mockApiPost.mockRejectedValue(new FakeApiError(409, "conflict"));
    await renderV2(<PayoutsScreen organization={org("owner")} />);
    await fireEvent.press(await screen.findByText("Request payout"));
    await fireEvent.press(screen.getAllByText("Request payout").at(-1)!);
    expect(await screen.findByText(/already/i)).toBeTruthy();
  });

  it("not connected → connect with the chosen country", async () => {
    mockStripe.status = { connected: false, chargesEnabled: false, payoutsEnabled: false, accountId: null };
    await renderV2(<PayoutsScreen organization={org("admin")} />);
    await fireEvent.press(screen.getByText("Connect with Stripe"));
    expect(mockStripe.handleConnect).toHaveBeenCalledWith("US");
  });
});

describe("organization settings", () => {
  it("reads through the API; saves only the profile fields (PATCH)", async () => {
    await renderV2(<OrgSettingsScreen organization={org("owner")} />);
    expect(await screen.findByDisplayValue("Guayaquil")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("City"), "Salinas");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() => expect(mockApiClient).toHaveBeenCalled());
    const [url, opts] = mockApiClient.mock.calls[0] as [string, { method: string; body: string }];
    expect([url, opts.method]).toEqual(["/api/organizations/org-1", "PATCH"]);
    expect(JSON.parse(opts.body)).toMatchObject({ city: "Salinas", instagram_handle: "kora" });
  });

  it("organizer: read-only", async () => {
    await renderV2(<OrgSettingsScreen organization={org("organizer")} />);
    expect(await screen.findByText(/read-only|Only owners/i)).toBeTruthy();
    expect(screen.queryByText("Save changes")).toBeNull();
  });
});
