/**
 * Event tools v2 in the app (fase 1b.2b): promoter links, discount codes, send tickets, scanners
 * and co-hosts — same endpoints, payloads and rules as the web v2.
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
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();
const mockApiClient = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiPost: (...a: unknown[]) => mockApiPost(...a),
  apiDelete: (...a: unknown[]) => mockApiDelete(...a),
  apiPatch: jest.fn(),
  apiClient: (...a: unknown[]) => mockApiClient(...a),
}));
jest.mock("../../hooks/useStripeConnect", () => ({ useStripeConnect: () => ({ status: null, isLoading: false }) }));
const mockCopy = jest.fn(async () => true);
jest.mock("expo-clipboard", () => ({ setStringAsync: (...a: unknown[]) => mockCopy(...(a as [])) }));
jest.mock("react-native-qrcode-svg", () => {
  const { Text } = jest.requireActual("react-native");
  return ({ value }: { value: string }) => <Text testID="promoter-qr">{value}</Text>;
});

const tier = (id: string, name: string, extra = {}) => ({
  id, name, price_cents: 1500, quantity_total: 100, quantity_sold: 10, per_user_limit: 10,
  sales_start: "", sales_end: "", order_index: 0, quantity_reserved: 0, is_hidden: false, is_manually_sold_out: false, ...extra,
});
const EV = event("ev-1", "Hallowen Pt II", 5, {
  slug: "hallowen-pt-ii",
  organization_id: "org-1",
  qr_scanner_code: null,
  ticket_tiers: [tier("t-ga", "General")],
  promoter_links: [{ id: "pl-1", promoter_code: "ANA", promoter_name: "Ana", created_at: "", total_tickets_sold: 4, total_revenue_cents: 6000 }],
  promotional_codes: [{ id: "pc-1", code: "HALLO10", discount_percentage: 10, usage_limit: 50, usage_count: 50, created_at: "" }],
} as never);

let scanners: unknown[] = [];
let cohosts: unknown[] = [];
beforeEach(() => {
  [mockPush, mockApiPost, mockApiDelete, mockApiClient, mockCopy].forEach((m) => m.mockReset());
  mockApiPost.mockResolvedValue({});
  mockApiClient.mockResolvedValue({});
  mockApiDelete.mockResolvedValue({});
  scanners = [{ id: "s-1", user_id: "u-9", email: "door@x.com", first_name: "Door", last_name: "Staff" }];
  cohosts = [{ id: "a-1", cohost_organization_id: "o-sol", cohost_org: { id: "o-sol", name: "Sol Club", slug: "sol", logo_url: null } }];
  delete mockRoute.tab;
  mockApiGet.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/organizer/data")) return { organization: {}, events: [EV], cohost_events: [], owner_cohost_assignments: [] };
    if (url.includes("event-assignments")) return { assignments: [{ event_id: "ev-1" }] };
    if (url.includes("cohost-assignments?search=")) return { organizations: [{ id: "o-luna", name: "Luna Club", slug: "luna", logo_url: null, city: "Quito" }] };
    if (url.includes("cohost-assignments")) return { assignments: cohosts };
    if (url.endsWith("/scanners")) return { scanners };
    if (url.startsWith("/api/organizer/people")) return url.includes("q=an") ? { people: [{ id: "u-ana", email: "ana@x.com", first_name: "Ana", last_name: "Ruiz", related: true }] } : { people: [] };
    throw new Error(url);
  });
});

describe("promoter links", () => {
  beforeEach(() => (mockRoute.tab = "promoters"));

  it("validates, creates, copies the public link and deletes after confirming", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
    await fireEvent.changeText(await screen.findByLabelText("Code"), "a");
    await fireEvent.press(screen.getByText("Generate link"));
    expect(mockApiPost).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Code"), "luis20");
    await fireEvent.changeText(screen.getByLabelText("Name (optional)"), "Luis");
    await fireEvent.press(screen.getByText("Generate link"));
    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/organizer/promoter-links",
      { event_id: "ev-1", promoter_code: "LUIS20", promoter_name: "Luis" },
      expect.any(Function),
    );

    await fireEvent.press(screen.getByLabelText("Copy link ANA"));
    expect(mockCopy).toHaveBeenCalledWith(expect.stringMatching(/\/events\/hallowen-pt-ii\?promoter=ANA$/));

    await fireEvent.press(screen.getByLabelText("Delete ANA"));
    await fireEvent.press(screen.getByText("Delete"));
    expect(mockApiDelete).toHaveBeenCalledWith("/api/organizer/promoter-links/pl-1", expect.any(Function));
  });

  it("'Paste a list' sends the parsed names to the bulk endpoint; 'Copy all' copies name: link per line", async () => {
    mockApiPost.mockResolvedValueOnce({
      promoter_links: [
        { id: "n1", promoter_code: "DAVIDC", promoter_name: "David Camacho", total_tickets_sold: 0, total_revenue_cents: 0 },
        { id: "n2", promoter_code: "JUANL", promoter_name: "Juan León", total_tickets_sold: 0, total_revenue_cents: 0 },
      ],
    });
    await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
    await fireEvent.press(await screen.findByText("Paste a list"));
    await fireEvent.changeText(screen.getByLabelText("Promoter names"), "1. David Camacho\nJuan León, david camacho");
    expect(screen.getByText("Names detected: 2")).toBeTruthy();
    await fireEvent.press(screen.getByText("Create links"));
    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/organizer/promoter-links/bulk",
      { event_id: "ev-1", names: ["David Camacho", "Juan León"] },
      expect.any(Function),
    );
    expect(await screen.findByText("2 links ready")).toBeTruthy();
    await fireEvent.press(screen.getAllByText("Copy all")[0]);
    expect(mockCopy).toHaveBeenLastCalledWith(
      expect.stringMatching(/^David Camacho: .*\/events\/hallowen-pt-ii\?promoter=DAVIDC\nJuan León: .*\?promoter=JUANL$/),
    );
  });

  it("QR shows the promoter's link on screen", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("viewer")} />);
    await fireEvent.press(await screen.findByLabelText("QR ANA"));
    expect(screen.getByTestId("promoter-qr").props.children).toMatch(/\/events\/hallowen-pt-ii\?promoter=ANA$/);
  });

  it("viewer: list only", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("viewer")} />);
    expect(await screen.findByText("ANA")).toBeTruthy();
    expect(screen.queryByText("Generate link")).toBeNull();
    expect(screen.queryByLabelText("Delete ANA")).toBeNull();
  });
});

describe("discount codes", () => {
  beforeEach(() => (mockRoute.tab = "promotions"));

  it("used-up status, limit validation, create with the chosen discount", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("admin")} />);
    expect(await screen.findByText("Used up")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Code"), "vip25");
    await fireEvent.press(screen.getByRole("radio", { name: "25%" }));
    await fireEvent.changeText(screen.getByLabelText("Usage limit"), "0");
    await fireEvent.press(screen.getAllByText("Add code")[1]);
    expect(screen.getByText("The usage limit must be at least 1.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Usage limit"), "30");
    await fireEvent.press(screen.getAllByText("Add code")[1]);
    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/organizer/promotional-codes",
      { event_id: "ev-1", code: "VIP25", discount_percentage: 25, usage_limit: 30 },
      expect.any(Function),
    );
  });
});

describe("send tickets", () => {
  beforeEach(() => (mockRoute.tab = "send"));

  it("free: find account → ticket & quantity → confirm → POST promotional-tickets", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
    await fireEvent.changeText(await screen.findByLabelText("Name or e-mail"), "ana");
    await fireEvent.press(await screen.findByLabelText("Ana Ruiz ana@x.com", {}, { timeout: 2000 }));
    expect(mockApiGet).toHaveBeenCalledWith("/api/organizer/people?organizationId=org-1&q=ana", expect.any(Function));
    await fireEvent.press(screen.getByLabelText("More"));
    await fireEvent.press(screen.getByText("Continue"));
    await fireEvent.press(screen.getByText("Send 2 tickets"));
    expect(mockApiClient).toHaveBeenCalledWith(
      "/api/organizer/promotional-tickets",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ event_id: "ev-1", ticket_tier_id: "t-ga", quantity: 2, user_id: "u-ana" }) }),
    );
    expect(await screen.findByText(/2 tickets sent to Ana Ruiz/)).toBeTruthy();
  });

  it("bank transfer to an email without account, custom price", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
    await fireEvent.press(await screen.findByRole("tab", { name: "Bank transfers" }));
    await fireEvent.changeText(screen.getByLabelText("Name or e-mail"), "New@x.com");
    await fireEvent.press(await screen.findByText(/Create order without a Flame account/, {}, { timeout: 2000 }));
    await fireEvent(screen.getByLabelText("Set a custom price"), "valueChange", true);
    await fireEvent.changeText(screen.getByLabelText("Price per ticket"), "12,50");
    await fireEvent.press(screen.getByText("Continue"));
    expect(screen.getByText(/\$12\.50/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Create order"));
    expect(mockApiClient).toHaveBeenCalledWith(
      "/api/organizer/bank-transfer-tickets",
      expect.objectContaining({
        body: JSON.stringify({ event_id: "ev-1", ticket_tier_id: "t-ga", quantity: 1, recipient_email: "new@x.com", unit_price_cents: 1250 }),
      }),
    );
  });
});

describe("scanners", () => {
  beforeEach(() => (mockRoute.tab = "scanners"));

  it("accounts: list, server error codes, remove; access code: generate", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
    expect(await screen.findByText("Door Staff")).toBeTruthy();
    // Restricted search: someone already connected to the organization, picked from the suggestions.
    mockApiPost.mockRejectedValueOnce(Object.assign(new Error("x"), { status: 409, code: "ALREADY_SCANNER" }));
    await fireEvent.changeText(screen.getByLabelText("Name or e-mail"), "ana");
    await fireEvent.press(await screen.findByLabelText("Ana Ruiz ana@x.com", {}, { timeout: 2000 }));
    expect(mockApiPost).toHaveBeenCalledWith("/api/organizer/events/ev-1/scanners", { email: "ana@x.com" }, expect.any(Function));
    expect(await screen.findByText("This person can already scan this event.")).toBeTruthy();
    // A full e-mail with no Flame account → says so (nothing to add).
    await fireEvent.changeText(screen.getByLabelText("Name or e-mail"), "nobody@x.com");
    expect(await screen.findByText(/They need to sign up first/, {}, { timeout: 2000 })).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Remove Door Staff"));
    await fireEvent.press(screen.getAllByText("Remove").at(-1)!);
    await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith("/api/organizer/events/ev-1/scanners?scannerId=s-1", expect.any(Function)));

    mockApiClient.mockResolvedValueOnce({ code: "K7P2QX" });
    await fireEvent.press(screen.getByText("Create code"));
    expect(mockApiClient).toHaveBeenCalledWith(
      "/api/organizer/events/ev-1/scanner-code",
      expect.objectContaining({ method: "PUT", body: '{"action":"generate"}' }),
    );
    expect(await screen.findByText("K7P2QX")).toBeTruthy();

    await fireEvent.press(screen.getByText("Scan tickets now"));
    expect(mockPush).toHaveBeenCalledWith("/v2/scanner?org=kora&event=ev-1");
  });

  it("organizer: manages accounts but not the code", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("organizer")} />);
    expect(await screen.findByText("Door Staff")).toBeTruthy();
    expect(screen.queryByText("Create code")).toBeNull();
    expect(screen.getByText(/Only owners and admins/)).toBeTruthy();
  });
});

describe("co-hosts", () => {
  it("sheet: current co-hosts, search and add, remove after confirming", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
    await fireEvent.press(await screen.findByText("Co-hosts"));
    expect(await screen.findByText("Sol Club")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Search organizations"), "luna");
    await fireEvent.press(await screen.findByLabelText("Add Luna Club", {}, { timeout: 2000 }));
    expect(mockApiPost).toHaveBeenCalledWith("/api/organizations/org-1/cohost-assignments", { eventId: "ev-1", cohostOrgId: "o-luna" }, expect.any(Function));
    expect(mockApiGet).toHaveBeenCalledWith("/api/organizations/org-1/cohost-assignments?search=luna&event_id=ev-1", expect.any(Function));

    await fireEvent.press(screen.getByLabelText("Remove Sol Club"));
    await fireEvent.press(screen.getAllByText("Remove").at(-1)!);
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith("/api/organizations/org-1/cohost-assignments?id=a-1", expect.objectContaining({ method: "DELETE" })),
    );
  });

  it("organizer role: no co-hosts button", async () => {
    await renderV2(<EventAdmin eventId="ev-1" organization={org("organizer")} />);
    await screen.findByText("10 / 100 sold");
    expect(screen.queryByText("Co-hosts")).toBeNull();
  });
});

describe("purchases: everyone with tickets, origin and scanned / quantity", () => {
  it("sale, transfer and free tickets with totals", async () => {
    const data = {
      organization: {},
      events: [
        {
          ...(EV as object),
          purchases: [{ id: "p1", userName: "Ana Ruiz", email: "ana@x.com", tierName: "General", stageName: null, quantity: 3, pricePerTicket: 1000, totalPrice: 3450, basePrice: 3000, scanned: true, scannedCount: 2, rsvpStatus: "", createdAt: "2026-10-01T10:00:00Z" }],
          bank_transfer_orders: [{ id: "b1", email: "bea@x.com", customer_name: "Bea", created_at: "2026-10-02T10:00:00Z", order_quantity: 2, order_total_cents: 2000, checked_in_count: 0, ticket_tiers: { name: "VIP" } }],
          promotional_tickets: [{ id: "c1", email: "cris@x.com", customer_name: "Cris", created_at: "2026-10-03T10:00:00Z", checked_in_at: "2026-10-04T01:00:00Z", ticket_tiers: { name: "General" } }],
        },
      ],
      cohost_events: [],
      owner_cohost_assignments: [],
    };
    mockApiGet.mockImplementation(async (url: string) =>
      url.startsWith("/api/organizer/data") ? data : url.includes("cohost") ? { assignments: [] } : { assignments: [{ event_id: "ev-1" }] },
    );
    mockRoute.tab = "purchases";
    await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
    expect(await screen.findByText("Ana Ruiz")).toBeTruthy();
    expect(screen.getByLabelText("Scanned 2/3")).toBeTruthy();
    expect(screen.getByLabelText("Scanned 0/2")).toBeTruthy();
    expect(screen.getByLabelText("Scanned 1/1")).toBeTruthy();
    expect(screen.getByText(/^Sale · General/)).toBeTruthy();
    expect(screen.getByText(/^Transfer · VIP/)).toBeTruthy();
    expect(screen.getByText(/^Sent free · General/)).toBeTruthy();
    expect(screen.getByText("3 of 6 tickets scanned")).toBeTruthy();
  });
});

describe("send tickets: no answer in time", () => {
  it("says it may have gone through and refreshes 'Sent' instead of a generic error", async () => {
    mockRoute.tab = "send";
    mockApiClient.mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 0 }));
    await renderV2(<EventAdmin eventId="ev-1" organization={org("owner")} />);
    await fireEvent.changeText(await screen.findByLabelText("Name or e-mail"), "ana");
    await fireEvent.press(await screen.findByLabelText("Ana Ruiz ana@x.com", {}, { timeout: 2000 }));
    await fireEvent.press(screen.getByText("Continue"));
    const calls = mockApiGet.mock.calls.length;
    await fireEvent.press(screen.getByText("Send 1 ticket"));
    expect(mockApiClient).toHaveBeenCalledWith("/api/organizer/promotional-tickets", expect.objectContaining({ method: "POST", timeoutMs: 60000 }));
    expect(await screen.findByText(/couldn’t confirm the send in time/)).toBeTruthy();
    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(calls));
  });
});
