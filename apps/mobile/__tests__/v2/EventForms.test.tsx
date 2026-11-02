/**
 * Create / edit event and tier editor v2 in the app (fase 1b.4): same payloads and rules as the
 * web v2 (apps/web/__tests__/v2/CreateEvent|EditEvent|TierEditor.test.tsx).
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { EditEvent } from "../../components/v2/eventForm/EditEvent";
import { TierEditor } from "../../components/v2/eventForm/TierEditor";
import { CreateEvent } from "../../components/v2/eventForm/CreateEvent";
import { event, inDays, org, renderV2 } from "./helpers";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => false, setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
}));
const mockApiGet = jest.fn();
const mockApiClient = jest.fn();
const mockApiPost = jest.fn();
const mockUpload = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiPost: (...a: unknown[]) => mockApiPost(...a),
  apiDelete: jest.fn(),
  apiPatch: jest.fn(),
  apiClient: (...a: unknown[]) => mockApiClient(...a),
  apiUploadFormData: (...a: unknown[]) => mockUpload(...a),
}));
jest.mock("../../hooks/useStripeConnect", () => ({ useStripeConnect: () => ({ status: null, isLoading: false }) }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: "file:///pick.jpg", width: 1080, height: 1350 }] })),
}));
jest.mock("../../lib/event-image", () => ({ processEventImageTo4x5: jest.fn(async () => ({ uri: "file:///flyer.jpg", mime: "image/jpeg", ext: "jpg" })) }));
jest.mock("expo-file-system/legacy", () => ({ getInfoAsync: jest.fn(async () => ({ exists: true, size: 245000 })) }));
// The wheel (iOS in tests) "turns" to a fixed future moment as soon as it opens.
const mockPicked = new Date(Date.now() + 10 * 24 * 3600 * 1000);
mockPicked.setUTCHours(3, 0, 0, 0); // 22:00 the evening before in Guayaquil
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: ({ onChange }: { onChange: (e: unknown, d: Date) => void }) => {
    require("react").useEffect(() => onChange({}, mockPicked), []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  },
  DateTimePickerAndroid: { open: jest.fn() },
}));

class FakeApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

const DB_END = (d: number) => inDays(d).replace(".000Z", "+00:00").replace(/\.\d{3}Z$/, "+00:00");
const tier = (id: string, name: string, extra = {}) => ({
  id, name, price_cents: 2500, quantity_total: 100, quantity_sold: 0, quantity_reserved: 0, per_user_limit: 4,
  sales_start: null, sales_end: null, secret_code: null, description: null, is_hidden: false, is_manually_sold_out: false,
  registration_form_fields: null, ticket_stages: [], ...extra,
});
const EV = event("ev-1", "Lovin Sunset", 10, {
  organization_id: "org-1",
  slug: "lovin-sunset",
  requires_rsvp: true,
  description: "Sunset session",
  ends_at: DB_END(10.3),
  registration_form_config: [{ id: "ig", label: "Instagram", type: "text", required: true }],
  ticket_tiers: [tier("t-ga", "General", { quantity_sold: 40 }), tier("t-vip", "VIP", { registration_form_fields: ["ig"] }), tier("t-free", "Free", { registration_form_fields: [] })],
} as never);
const COHOSTED = event("ev-co", "Their Night", 5, { organization_id: "org-9", slug: "their-night" } as never);

beforeEach(() => {
  [mockReplace, mockApiClient, mockApiPost, mockUpload].forEach((m) => m.mockReset());
  mockApiClient.mockResolvedValue({});
  mockApiGet.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/organizer/data")) return { organization: {}, events: [EV], cohost_events: [{ assignment_id: "a", owner_org_name: "Zulu", owner_org_slug: "zulu", event: COHOSTED }] };
    if (url.includes("event-assignments")) return { assignments: [{ event_id: "ev-1" }] };
    if (url.startsWith("/api/places")) return { predictions: [] };
    throw new Error(url);
  });
});

describe("edit event", () => {
  it("sends only what changed; nothing changed says so", async () => {
    await renderV2(<EditEvent eventId="ev-1" organization={org("owner")} />);
    expect(await screen.findByDisplayValue("Club")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save changes"));
    expect(screen.getByText("There are no changes to save.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Venue"), "Playa San Lorenzo");
    await fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() => expect(mockApiClient).toHaveBeenCalled());
    const [url, opts] = mockApiClient.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/events");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body)).toEqual({ id: "ev-1", venue: "Playa San Lorenzo" });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/v2/organizer/event/ev-1?org=kora"));
  });

  it("a date change asks first (ticket holders are notified)", async () => {
    await renderV2(<EditEvent eventId="ev-1" organization={org("admin")} />);
    await fireEvent.press(await screen.findByLabelText(/^Starts:/));
    await fireEvent.press(screen.getByText("Done"));
    await fireEvent.press(screen.getByText("Save changes"));
    expect(screen.getByText("Change the event date?")).toBeTruthy();
    expect(mockApiClient).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Change date"));
    await waitFor(() => expect(mockApiClient).toHaveBeenCalled());
    const body = JSON.parse((mockApiClient.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.starts_at).toBe(mockPicked.toISOString());
    expect(body.ends_at).toBeTruthy();
  });

  it("co-hosted event or viewer → can't edit", async () => {
    await renderV2(<EditEvent eventId="ev-co" organization={org("owner")} />);
    expect(await screen.findByText("Only the organization that owns this event can edit it.")).toBeTruthy();
  });
  it("new flyer: uploads it (retrying once on a network failure) and saves its URL", async () => {
    mockUpload.mockRejectedValueOnce(new FakeApiError(0, "Network request failed")).mockResolvedValueOnce({ url: "https://cdn.test/new.jpg" });
    await renderV2(<EditEvent eventId="ev-1" organization={org("owner")} />);
    await fireEvent.press(await screen.findByLabelText("Add flyer"));
    await fireEvent.press(await screen.findByText("Save changes"));
    await waitFor(() => expect(mockApiClient).toHaveBeenCalled());
    expect(mockUpload).toHaveBeenCalledTimes(2);
    const body = JSON.parse((mockApiClient.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body).toEqual({ id: "ev-1", image_url: "https://cdn.test/new.jpg" });
  });
});

describe("line-up (fase 4.3)", () => {
  it("edit: add an artist with Instagram → PATCH with the normalized list; a bad link blocks saving", async () => {
    await renderV2(<EditEvent eventId="ev-1" organization={org("owner")} />);
    expect(await screen.findByDisplayValue("Club")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add artist"));
    await fireEvent.changeText(screen.getByLabelText("Artist name 1"), "Chuy");
    await fireEvent.changeText(screen.getByLabelText("Instagram 1"), "instagram.com/chuy.music");
    await fireEvent.changeText(screen.getByLabelText("SoundCloud 1"), "https://evil.com/x");
    await fireEvent.press(screen.getByText("Save changes"));
    expect(screen.getByText("Paste a SoundCloud link (soundcloud.com/…) or the username.")).toBeTruthy();
    expect(mockApiClient).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("SoundCloud 1"), "chuy");
    await fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() => expect(mockApiClient).toHaveBeenCalled());
    expect(JSON.parse((mockApiClient.mock.calls[0] as [string, { body: string }])[1].body)).toEqual({
      id: "ev-1",
      lineup: [{ name: "Chuy", instagram: "chuy.music", soundcloud: "https://soundcloud.com/chuy" }],
    });
  });
});

describe("tier editor", () => {
  it("new tier on the defaults: POST with the sales end in Z (not the database's +00:00)", async () => {
    await renderV2(<TierEditor eventId="ev-1" tierId="new" organization={org("owner")} />);
    expect(await screen.findByDisplayValue("Tier 4")).toBeTruthy();
    expect(screen.getByLabelText("Sales end: When the event ends")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Spots"), "30");
    await fireEvent.changeText(screen.getByLabelText("Price"), "0");
    await fireEvent.press(screen.getByText("Create tier"));
    await waitFor(() => expect(mockApiClient).toHaveBeenCalled());
    const [url, opts] = mockApiClient.mock.calls[0] as [string, { method: string; body: string }];
    expect([url, opts.method]).toEqual(["/api/ticket-tiers", "POST"]);
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ event_id: "ev-1", name: "Tier 4", quantity_total: 30, price_cents: 0 });
    expect(body.sales_end).toMatch(/Z$/);
  });

  it("spots below what's sold are refused; delete is blocked with sales", async () => {
    await renderV2(<TierEditor eventId="ev-1" tierId="t-ga" organization={org("owner")} />);
    await fireEvent.changeText(await screen.findByLabelText("Spots"), "39");
    await fireEvent.press(screen.getByText("Save tier"));
    expect(screen.getByText("Can’t be lower than what’s already sold.")).toBeTruthy();
    expect(mockApiClient).not.toHaveBeenCalled();
    expect(screen.getByText("Tiers with sold tickets can’t be deleted.")).toBeTruthy();
  });

  it("pending checkouts don't fit → force-reduce confirmation, then the rest of the edits", async () => {
    mockApiClient.mockRejectedValueOnce(new FakeApiError(409, "below reserved", "QUANTITY_BELOW_RESERVED", { quantity_sold: 0, quantity_reserved: 8 }));
    await renderV2(<TierEditor eventId="ev-1" tierId="t-vip" organization={org("owner")} />);
    await fireEvent.changeText(await screen.findByLabelText("Spots"), "5");
    await fireEvent.changeText(screen.getByLabelText("Tier name"), "VIP Mesa");
    await fireEvent.press(screen.getByText("Save tier"));
    expect(await screen.findByText("Reduce VIP Mesa to 5 spots?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Reduce and reject"));
    await waitFor(() => expect(mockApiClient).toHaveBeenCalledTimes(3));
    const calls = mockApiClient.mock.calls.map((c) => [c[0], JSON.parse((c[1] as { body: string }).body)]);
    expect(calls[1]).toEqual(["/api/organizer/tiers/t-vip/force-reduce", { new_quantity_total: 5 }]);
    expect(calls[2]![1]).toEqual({ id: "t-vip", name: "VIP Mesa" });
  });

  it("removing a saved question only takes it off this tier (the event keeps it)", async () => {
    await renderV2(<TierEditor eventId="ev-1" tierId="t-vip" organization={org("owner")} />);
    expect(await screen.findByText("Saved question · its wording can’t change")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Remove question 1"));
    await fireEvent.press(screen.getByText("Save tier"));
    await waitFor(() => expect(mockApiClient).toHaveBeenCalledTimes(1));
    const [url, opts] = mockApiClient.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/api/ticket-tiers");
    expect(JSON.parse(opts.body)).toEqual({ id: "t-vip", registration_form_fields: [] });
  });
  it("a known event question is added to the tier with one tap", async () => {
    await renderV2(<TierEditor eventId="ev-1" tierId="t-free" organization={org("owner")} />);
    const chip = await screen.findByLabelText("+ Instagram");
    await fireEvent.press(chip);
    expect(screen.getByDisplayValue("Instagram")).toBeTruthy();
    expect(screen.queryByLabelText("+ Instagram")).toBeNull();
  });
});

describe("create event", () => {
  it("publishing with gaps sends nothing and says how many fields to fix", async () => {
    await renderV2(<CreateEvent organization={org("owner")} />);
    await fireEvent.press(screen.getByText("Publish event"));
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(screen.getByText(/Fix \d+ fields to continue/)).toBeTruthy();
    expect(screen.getByText("Give the event a name.")).toBeTruthy();
  });

  it("complete form → POST /api/events with the web payload, then opens the event", async () => {
    mockApiPost.mockResolvedValue({ event: { id: "ev-new", slug: "noche-de-salsa" } });
    await renderV2(<CreateEvent organization={org("admin")} />);
    await fireEvent.changeText(screen.getByLabelText("Event name"), "Noche de Salsa");
    expect(screen.getByDisplayValue("noche-de-salsa")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Starts:/));
    await fireEvent.press(screen.getByText("Done"));
    await fireEvent.changeText(screen.getByLabelText("Venue"), "Luna Rooftop");
    await fireEvent.changeText(screen.getByLabelText("City"), "Guayaquil");
    await fireEvent.changeText(screen.getByLabelText("Tier name"), "General");
    await fireEvent.changeText(screen.getByLabelText("Price"), "12,50");
    await fireEvent.changeText(screen.getByLabelText("Spots"), "80");
    await fireEvent.press(screen.getByText("Publish event"));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalled());
    const [url, body] = mockApiPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/api/events");
    const ev = body.event as Record<string, unknown>;
    expect(ev).toMatchObject({ organization_id: "org-1", name: "Noche de Salsa", slug: "noche-de-salsa", venue: "Luna Rooftop", city: "Guayaquil", starts_at: mockPicked.toISOString() });
    // End suggested 5 h after the start, as on the web.
    expect(new Date(ev.ends_at as string).getTime() - mockPicked.getTime()).toBe(5 * 3600 * 1000);
    expect((body.ticket_tiers as Array<Record<string, unknown>>)[0]).toMatchObject({ name: "General", price_cents: 1250, quantity_total: 80 });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/v2/organizer/event/ev-new?org=kora"));
  });

  it("with a flyer: publishes, uploads the flyer and patches its URL", async () => {
    mockApiPost.mockResolvedValue({ event: { id: "ev-new", slug: "noche" } });
    mockUpload.mockResolvedValue({ url: "https://cdn.test/f.jpg" });
    await renderV2(<CreateEvent organization={org("owner")} />);
    await fireEvent.press(screen.getByLabelText("Add flyer"));
    await fireEvent.changeText(await screen.findByLabelText("Event name"), "Noche");
    await fireEvent.press(screen.getByLabelText(/^Starts:/));
    await fireEvent.press(screen.getByText("Done"));
    await fireEvent.changeText(screen.getByLabelText("Venue"), "Luna");
    await fireEvent.changeText(screen.getByLabelText("City"), "Guayaquil");
    await fireEvent.changeText(screen.getByLabelText("Tier name"), "General");
    await fireEvent.changeText(screen.getByLabelText("Price"), "10");
    await fireEvent.changeText(screen.getByLabelText("Spots"), "50");
    await fireEvent.press(screen.getByText("Publish event"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/v2/organizer/event/ev-new?org=kora"));
    expect(mockUpload).toHaveBeenCalledWith("/api/upload-image", expect.anything(), expect.any(Function));
    expect(mockApiClient).toHaveBeenCalledWith("/api/events", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ id: "ev-new", image_url: "https://cdn.test/f.jpg" }) }));
  });

  it("organizer role can't create", async () => {
    await renderV2(<CreateEvent organization={org("organizer")} />);
    expect(screen.getByText("Only owners and admins can create events.")).toBeTruthy();
  });
});
