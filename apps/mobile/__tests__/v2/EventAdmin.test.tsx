/**
 * Event management v2 in the app (fase 1b.2a): header and KPIs, tiers (switches, permissions,
 * errors), purchases (search, export), breakdown, co-hosted read-only, tabs not moved yet.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { EventAdmin } from "../../components/v2/event/EventAdmin";
import { event, org, renderV2 } from "./helpers";

const mockPush = jest.fn();
const mockRoute: { tab?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true, setParams: (p: { tab: string }) => (mockRoute.tab = p.tab) }),
  useLocalSearchParams: () => mockRoute,
}));

const mockApiGet = jest.fn();
const mockApiPatch = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiPatch: (...a: unknown[]) => mockApiPatch(...a),
  apiClient: jest.fn(),
}));
jest.mock("../../hooks/useStripeConnect", () => ({ useStripeConnect: () => ({ status: null, isLoading: false }) }));
const mockExport = jest.fn(async () => {});
jest.mock("../../lib/organizer-xlsx-export", () => ({ exportPurchasesXlsx: (...a: unknown[]) => mockExport(...(a as [])) }));

const purchase = (id: string, name: string, tier: string, qty: number, base: number, total: number, scanned = false) => ({
  id, userName: name, email: `${id}@x.com`, tierName: tier, stageName: null, quantity: qty,
  pricePerTicket: base / qty, totalPrice: total, basePrice: base, scanned, rsvpStatus: "", createdAt: "2026-10-01T15:00:00Z",
});
const tier = (id: string, name: string, extra = {}) => ({
  id, name, price_cents: 1000, quantity_total: 100, quantity_sold: 0, per_user_limit: 10,
  sales_start: "", sales_end: "", order_index: 0, quantity_reserved: 0, is_hidden: false, is_manually_sold_out: false, ...extra,
});

const OWNED = event("ev-1", "Hallowen Pt II", 5, {
  organization_id: "org-1",
  ticket_tiers: [tier("t-ga", "General", { quantity_sold: 3, quantity_reserved: 2 }), tier("t-vip", "VIP", { quantity_total: 20 })],
  purchases: [purchase("p1", "Ana Ruiz", "General", 2, 2000, 2300, true), purchase("p2", "Luis Paz", "General", 1, 1000, 1150)],
  pending_rsvps: 4,
  requires_rsvp: true,
} as never);
const COHOSTED = event("ev-2", "Partner Night", 6, { organization_id: "org-9", ticket_tiers: [tier("t-x", "Entry")] } as never);
const DATA = {
  organization: { id: "org-1", name: "Kora", slug: "kora" },
  events: [OWNED],
  cohost_events: [{ assignment_id: "a", owner_org_name: "Partner Org", owner_org_slug: "p", event: COHOSTED }],
  owner_cohost_assignments: [],
};

beforeEach(() => {
  mockPush.mockReset();
  mockApiPatch.mockReset();
  mockExport.mockClear();
  delete mockRoute.tab;
  mockApiGet.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/organizer/data")) return DATA;
    if (url.includes("event-assignments")) return { assignments: [{ event_id: "ev-1" }] };
    if (url.includes("cohost-assignments")) return { assignments: [] };
    throw new Error(url);
  });
});

it("header, KPIs and tiers for the owner", async () => {
  await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
  expect((await screen.findAllByText("Hallowen Pt II")).length).toBeGreaterThan(0);
  expect(screen.getByText("120")).toBeTruthy(); // capacity 100 + 20
  expect(screen.getByText("3")).toBeTruthy(); // sold (card purchases)
  expect(screen.getAllByText("$30.00").length).toBeGreaterThan(0); // net revenue
  expect(screen.getByText("3 / 100 sold")).toBeTruthy();
  expect(screen.getByText("2 pending")).toBeTruthy();
  expect(screen.getByText("Edit event")).toBeTruthy();
  expect(screen.getByText("Co-hosts")).toBeTruthy();
  await fireEvent.press(screen.getByText("Manage RSVPs"));
  expect(mockPush).toHaveBeenCalledWith("/rsvp-detail?eventId=ev-1&orgId=org-1");
});

it("tier switches PATCH /api/ticket-tiers and refresh; a 4xx shows the server's message", async () => {
  mockApiPatch.mockResolvedValueOnce({});
  await renderV2(<EventAdmin eventId="ev-1" organization={org("admin")} />);
  const soldOut = await screen.findAllByLabelText("Sold out");
  await fireEvent(soldOut[0], "valueChange", true);
  expect(mockApiPatch).toHaveBeenCalledWith("/api/ticket-tiers", { id: "t-ga", is_manually_sold_out: true }, expect.any(Function));
  await waitFor(() => expect(mockApiGet.mock.calls.filter(([u]) => String(u).startsWith("/api/organizer/data")).length).toBeGreaterThan(1));

  mockApiPatch.mockRejectedValueOnce(Object.assign(new Error("Tier has sales"), { status: 400 }));
  await fireEvent(screen.getAllByLabelText("Hidden")[1], "valueChange", true);
  expect(await screen.findByText("Tier has sales")).toBeTruthy();
});

it("organizer assigned can edit tiers; viewer only sees tags", async () => {
  await renderV2(<EventAdmin eventId="ev-1" organization={org("organizer")} />);
  expect((await screen.findAllByLabelText("Sold out")).length).toBe(2);
});

it("viewer: no switches, no edit", async () => {
  await renderV2(<EventAdmin eventId="ev-1" organization={org("viewer")} />);
  await screen.findByText("3 / 100 sold");
  expect(screen.queryByLabelText("Sold out")).toBeNull();
  expect(screen.queryByText("Edit event")).toBeNull();
});

it("purchases: search and export with fresh data", async () => {
  mockRoute.tab = "purchases";
  await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
  expect(await screen.findByText("Ana Ruiz")).toBeTruthy();
  expect(screen.getByLabelText("Scanned 1/2")).toBeTruthy(); // old API response: boolean only → at most 1
  await fireEvent.changeText(screen.getByLabelText("Search buyers"), "luis");
  expect(screen.queryByText("Ana Ruiz")).toBeNull();
  expect(screen.getByText("Luis Paz")).toBeTruthy();
  await fireEvent.press(screen.getByText("Export XLSX"));
  await waitFor(() => expect(mockExport).toHaveBeenCalledWith(expect.objectContaining({ eventName: "Hallowen Pt II", currency: "USD" })));
});

it("breakdown: card gross, fees and net", async () => {
  mockRoute.tab = "breakdown";
  await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
  expect(await screen.findByText("Card (Stripe)")).toBeTruthy();
  expect(screen.getByText("$34.50")).toBeTruthy(); // buyers paid 23 + 11.50
  expect(screen.getByText("− $4.50")).toBeTruthy();
});

it("co-hosted event: read-only note, no sales data, no edit", async () => {
  mockRoute.tab = "purchases";
  await renderV2(<EventAdmin eventId="ev-2" organization={org("owner")} />);
  expect(await screen.findByText(/You co-host this event/)).toBeTruthy();
  expect(screen.getByText("Sales details are only visible to the organizer that owns the event.")).toBeTruthy();
  expect(screen.queryByText("Edit event")).toBeNull();
});

it("tab bar switches tabs through the URL", async () => {
  await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
  await screen.findByText("3 / 100 sold");
  await fireEvent.press(screen.getByRole("tab", { name: "Promoter links" }));
  expect(mockRoute.tab).toBe("promoters");
});

it("unknown event → not available", async () => {
  await renderV2(<EventAdmin eventId="nope" organization={org("owner")} />);
  expect(await screen.findByText("This event isn’t available for this organizer.")).toBeTruthy();
});
