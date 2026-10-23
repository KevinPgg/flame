/**
 * Organizer dashboard v2 in the app (fase 1b.1): same rules as the web dashboard test
 * (apps/web/__tests__/v2/Dashboard.test.tsx): KPIs of owned events only, organizer sees only
 * assigned events, search without accents across tabs, errors, language.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { OrganizerDashboard } from "../../components/v2/OrganizerDashboard";
import { event, org, renderV2 } from "./helpers";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => false }),
}));

const mockApiGet = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiClient: jest.fn(),
}));

jest.mock("../../hooks/useStripeConnect", () => ({
  useStripeConnect: (id?: string) => ({
    status: id ? { connected: true, chargesEnabled: true, payoutsEnabled: true } : null,
    isLoading: false,
  }),
}));

const DATA = {
  organization: { id: "org-1", name: "Kora Club", slug: "kora" },
  events: [
    event("e-carnaval", "Carnával Night", 3, { totalRevenue: 12_500, totalAttendees: 40, requires_rsvp: true, pending_rsvps: 2 }),
    event("e-later", "Later Party", 10, { totalRevenue: 2_500 }),
    event("e-old", "Old Fest", -20, { totalRevenue: 1_000 }),
    event("e-older", "Older Fest", -40),
  ],
  cohost_events: [
    {
      assignment_id: "a1",
      owner_org_name: "Partner",
      owner_org_slug: "partner",
      event: event("e-cohost", "Cohost Jam", 5, { totalRevenue: 99_999 }),
    },
  ],
  owner_cohost_assignments: [],
};

function serve({ assigned = [] as string[], fail = false } = {}) {
  mockApiGet.mockImplementation(async (url: string) => {
    if (fail) throw new Error("boom");
    if (url.startsWith("/api/organizer/data")) return DATA;
    if (url.includes("/event-assignments")) return { assignments: assigned.map((event_id) => ({ event_id })) };
    throw new Error(`unexpected ${url}`);
  });
}

beforeEach(() => {
  mockPush.mockReset();
  mockApiGet.mockReset();
});

it("owner: KPIs count owned + co-hosted events, revenue only owned; current events by date", async () => {
  serve();
  await renderV2(<OrganizerDashboard organization={org("owner")} />);
  expect(await screen.findByText("Carnával Night")).toBeTruthy();
  expect(screen.getByText("5")).toBeTruthy(); // 4 owned + 1 co-hosted
  expect(screen.getByText("$160.00")).toBeTruthy(); // 125 + 25 + 10, co-host revenue excluded
  expect(screen.getByLabelText("Create event")).toBeTruthy();
  expect(screen.getByText("2 pending requests")).toBeTruthy();
  expect(screen.getByText("Co-host with Partner")).toBeTruthy();
  expect(screen.queryByText("Old Fest")).toBeNull(); // past tab

  await fireEvent.press(screen.getByText("Carnával Night"));
  expect(mockPush).toHaveBeenCalledWith("/v2/organizer/event/e-carnaval?org=kora");
});

it("organizer: only assigned events, no KPIs, no create button", async () => {
  serve({ assigned: ["e-later"] });
  await renderV2(<OrganizerDashboard organization={org("organizer")} />);
  expect(await screen.findByText("Later Party")).toBeTruthy();
  expect(screen.queryByText("Carnával Night")).toBeNull();
  expect(screen.getByText("You see the events assigned to you.")).toBeTruthy();
  expect(screen.queryByText("Total revenue")).toBeNull();
  expect(screen.queryByLabelText("Create event")).toBeNull();
  expect(screen.queryByLabelText("Search events")).toBeNull(); // only 1 event in scope
  expect(mockApiGet).toHaveBeenCalledWith("/api/organizations/org-1/event-assignments?mine=true", expect.any(Function));
});

it("search ignores accents both ways and points to the other tab", async () => {
  serve();
  await renderV2(<OrganizerDashboard organization={org("owner")} />);
  await screen.findByText("Carnával Night");
  const input = screen.getByLabelText("Search events");

  await fireEvent.changeText(input, "carnaval");
  expect(screen.getByText("Carnával Night")).toBeTruthy();
  expect(screen.queryByText("Later Party")).toBeNull();

  await fireEvent.changeText(input, "öldér");
  expect(screen.getByText("1 match in Past events.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Show"));
  expect(screen.getByText("Older Fest")).toBeTruthy();
});

it("error → retry", async () => {
  serve({ fail: true });
  await renderV2(<OrganizerDashboard organization={org("owner")} />);
  expect(await screen.findByText("Try again")).toBeTruthy();
  serve();
  await fireEvent.press(screen.getByText("Try again"));
  expect(await screen.findByText("Carnával Night")).toBeTruthy();
});

it("Spanish", async () => {
  serve();
  await renderV2(<OrganizerDashboard organization={org("admin")} />, "es");
  await screen.findByText("Carnával Night");
  expect(screen.getByLabelText("Crear evento")).toBeTruthy();
  expect(screen.getByText("Admin")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("Actuales y próximos")).toBeTruthy());
});

it("small organizer: no Current/Past toggle and no search, just the list with its count", async () => {
  mockApiGet.mockImplementation(async (url: string) =>
    url.startsWith("/api/organizer/data") ? { ...DATA, events: [event("e1", "Only Party", 2)], cohost_events: [] } : { assignments: [] },
  );
  await renderV2(<OrganizerDashboard organization={org("owner")} />);
  expect(await screen.findByText("Only Party")).toBeTruthy();
  expect(screen.queryAllByRole("tab").filter((t) => /Past/.test(String(t.props.children)))).toHaveLength(0);
  expect(screen.queryByText("Past events")).toBeNull();
  expect(screen.queryByLabelText("Search events")).toBeNull();
  expect(screen.getByText(/Current & upcoming/)).toBeTruthy();
});
