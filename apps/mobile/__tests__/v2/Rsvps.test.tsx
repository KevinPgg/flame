/**
 * RSVPs v2 in the app (fase 1b.3): event list and one event's requests — same endpoints and rules
 * as the web v2 (apps/web/__tests__/v2/Rsvps.test.tsx).
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { RsvpEvents } from "../../components/v2/rsvps/RsvpEvents";
import { RsvpEventDetail } from "../../components/v2/rsvps/RsvpEventDetail";
import { event, inDays, org, renderV2 } from "./helpers";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true, setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
}));
const mockApiGet = jest.fn();
const mockApiClient = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
  apiPatch: jest.fn(),
  apiClient: (...a: unknown[]) => mockApiClient(...a),
}));
jest.mock("../../hooks/useStripeConnect", () => ({ useStripeConnect: () => ({ status: null, isLoading: false }) }));
const mockExport = jest.fn(async () => {});
jest.mock("../../lib/organizer-xlsx-export", () => ({ exportPendingRsvpsXlsx: (...a: unknown[]) => mockExport(...(a as [])) }));

const LOVIN = event("ev-lovin", "Lovin Sunset", 5, { requires_rsvp: true, pending_rsvps: 2, organization_id: "org-1" } as never);
const PLAIN = event("ev-plain", "Kora Night", 3);
const OLD = event("ev-old", "Kora Open", -30, { requires_rsvp: true } as never);

const rsvp = (id: string, first: string, status: string, extra = {}) => ({
  id,
  status,
  requested_quantity: 2,
  requested_at: inDays(-1),
  base_price_cents: 5000,
  registration_data: { ig: `@${first.toLowerCase()}` },
  users: { first_name: first, last_name: "Ruiz", email: `${first.toLowerCase()}@x.com`, document_id: "0912345678" },
  ticket_tiers: { name: "General", price_cents: 2500 },
  ...extra,
});
let rsvps: unknown[] = [];

class FakeApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

beforeEach(() => {
  [mockPush, mockApiClient, mockExport].forEach((m) => m.mockReset());
  mockApiClient.mockResolvedValue({});
  rsvps = [rsvp("r-ana", "Ana", "pending"), rsvp("r-luis", "Luis", "pending", { base_price_cents: 0 }), rsvp("r-eva", "Eva", "approved")];
  mockApiGet.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/organizer/data")) return { organization: {}, events: [LOVIN, PLAIN, OLD], cohost_events: [], owner_cohost_assignments: [] };
    if (url.includes("event-assignments")) return { assignments: [{ event_id: "ev-lovin" }] };
    if (url.startsWith("/api/organizer/rsvps")) return { rsvps, registration_form_config: [{ id: "ig", label: "Instagram", required: true }, { id: "mesa", label: "Mesa" }] };
    throw new Error(url);
  });
});

describe("RSVP events", () => {
  it("only RSVP events, current/past, pending count, search and open", async () => {
    await renderV2(<RsvpEvents organization={org("owner")} />);
    expect(await screen.findByText("Lovin Sunset")).toBeTruthy();
    expect(screen.queryByText("Kora Night")).toBeNull(); // not an RSVP event
    expect(screen.queryByText("Kora Open")).toBeNull(); // past
    expect(screen.getByLabelText("Lovin Sunset, 2 pending")).toBeTruthy();

    await fireEvent.press(screen.getByRole("tab", { name: /Past events/ }));
    expect(screen.getByText("Kora Open")).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: /Current/ }));

    await fireEvent.changeText(screen.getByLabelText("Search by event name"), "zzz");
    expect(screen.getByText("No events match “zzz”.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Search by event name"), "lovin");
    await fireEvent.press(screen.getByText("Lovin Sunset"));
    expect(mockPush).toHaveBeenCalledWith("/v2/organizer/rsvps/ev-lovin?org=kora");
  });
});

describe("RSVP requests of an event", () => {
  it("opens on Pending with counts; approve asks first (card charged) and PATCHes with a long timeout", async () => {
    await renderV2(<RsvpEventDetail eventId="ev-lovin" organization={org("owner")} />);
    expect(await screen.findByText("Ana Ruiz")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Pending 2" }).props.accessibilityState.selected).toBe(true);
    expect(screen.queryByText("Eva Ruiz")).toBeNull();
    expect(screen.getByText("2 requests waiting")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Approve Ana Ruiz"));
    expect(screen.getByText(/Their card is charged now/)).toBeTruthy();
    expect(mockApiClient).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByText("Approve").at(-1)!);
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith("/api/organizer/rsvps/r-ana/approve", expect.objectContaining({ method: "PATCH", timeoutMs: 60_000 })),
    );
    expect(await screen.findByText("Ana Ruiz approved")).toBeTruthy();
  });

  it("reject: release-the-hold confirmation; someone else already handled it → notice", async () => {
    mockApiClient.mockRejectedValueOnce(new FakeApiError(409, "already"));
    await renderV2(<RsvpEventDetail eventId="ev-lovin" organization={org("admin")} />);
    await fireEvent.press(await screen.findByLabelText("Reject Luis Ruiz"));
    expect(screen.getByText(/the hold is released/)).toBeTruthy();
    await fireEvent.press(screen.getAllByText("Reject").at(-1)!);
    expect(await screen.findByText(/Someone else already handled this request/)).toBeTruthy();
  });

  it("no answer in time → 'may have gone through' instead of a plain error", async () => {
    mockApiClient.mockRejectedValueOnce(new FakeApiError(0, "Request timed out"));
    await renderV2(<RsvpEventDetail eventId="ev-lovin" organization={org("owner")} />);
    await fireEvent.press(await screen.findByLabelText("Approve Ana Ruiz"));
    await fireEvent.press(screen.getAllByText("Approve").at(-1)!);
    expect(await screen.findByText(/It may have gone through/)).toBeTruthy();
  });

  it("approve all: one by one, total in the confirmation, result summary", async () => {
    await renderV2(<RsvpEventDetail eventId="ev-lovin" organization={org("owner")} />);
    await fireEvent.press(await screen.findByText("Approve all"));
    expect(screen.getByText("Approve all 2 requests?")).toBeTruthy();
    expect(screen.getByText(/1 of them are paid.*\$50\.00/)).toBeTruthy();
    await fireEvent.press(screen.getAllByText("Approve all").at(-1)!);
    expect(await screen.findByText("2 requests approved")).toBeTruthy();
    expect(mockApiClient.mock.calls.map((c) => c[0])).toEqual(["/api/organizer/rsvps/r-ana/approve", "/api/organizer/rsvps/r-luis/approve"]);
  });

  it("registration details sheet and export of pending", async () => {
    await renderV2(<RsvpEventDetail eventId="ev-lovin" organization={org("owner")} />);
    await fireEvent.press(await screen.findByLabelText("View details Ana Ruiz"));
    expect(screen.getByText("Registration details")).toBeTruthy();
    expect(screen.getByText("Instagram *")).toBeTruthy();
    expect(screen.getByText("@ana")).toBeTruthy();
    expect(screen.getByText("Not provided")).toBeTruthy();

    await fireEvent.press(screen.getByText("Export pending"));
    await waitFor(() => expect(mockExport).toHaveBeenCalled());
    const arg = (mockExport.mock.calls[0] as unknown as [{ eventName: string; rows: Array<{ personName: string; priceCents: number }> }])[0];
    expect(arg.eventName).toBe("Lovin Sunset");
    expect(arg.rows.map((r) => [r.personName, r.priceCents])).toEqual([["Ana Ruiz", 5000], ["Luis Ruiz", 0]]);
  });

  it("ended event: notice and no approve/reject", async () => {
    const ended = event("ev-lovin", "Lovin Sunset", -2, { requires_rsvp: true, organization_id: "org-1" } as never);
    mockApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/organizer/data")) return { organization: {}, events: [ended], cohost_events: [] };
      if (url.startsWith("/api/organizer/rsvps")) return { rsvps, registration_form_config: null };
      throw new Error(url);
    });
    await renderV2(<RsvpEventDetail eventId="ev-lovin" organization={org("owner")} />);
    expect(await screen.findByText(/This event has ended/)).toBeTruthy();
    expect(screen.queryByLabelText("Approve Ana Ruiz")).toBeNull();
    expect(screen.queryByText("Approve all")).toBeNull();
  });

  it("an event outside the organization → no access", async () => {
    await renderV2(<RsvpEventDetail eventId="ev-other" organization={org("owner")} />);
    expect(await screen.findByText("You don’t have access to this event’s requests.")).toBeTruthy();
  });
});
