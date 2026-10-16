import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

const nav = vi.hoisted(() => ({ event: null as string | null, replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, back: vi.fn() }),
  usePathname: () => "/v2/scanner",
  useSearchParams: () => new URLSearchParams(nav.event ? `event=${nav.event}` : ""),
  redirect: vi.fn(),
}));
// The camera is a browser API; tests feed QR text straight into the callback the hook received.
const cam = vi.hoisted(() => ({ onText: null as null | ((t: string) => void), active: false }));
vi.mock("../../app/v2/scanner/useQrCamera", () => ({
  useQrCamera: (_v: unknown, active: boolean, onText: (t: string) => void) => {
    cam.onText = onText;
    cam.active = active;
    return { state: active ? "on" : "off", error: null, torchSupported: false, torch: false, toggleTorch: vi.fn() };
  },
}));
import ScannerApp from "../../app/v2/scanner/ScannerApp";
import ScannersTab from "../../app/v2/organizer/event/[id]/tabs/ScannersTab";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => {
  nav.event = null;
  nav.replace.mockReset();
  cam.onText = null;
});
afterEach(() => vi.unstubAllGlobals());

const h = 3_600_000;
const ev = (id: string, name: string, startInH: number, lenH = 6) => ({
  id,
  name,
  starts_at: new Date(Date.now() + startInH * h).toISOString(),
  ends_at: new Date(Date.now() + (startInH + lenH) * h).toISOString(),
  venue: "Bar",
  city: "Guayaquil",
  timezone: "America/Guayaquil",
  image_url: null,
  organization_name: "Kora",
});
const qr = (eventId: string, n = 1) => JSON.stringify({ orderId: "o1", eventId, ticketNumber: n });
const ticket = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  attendee_name: "Ana Pérez",
  status: "valid",
  checked_in_at: null,
  ticket_tier: { name: "General" },
  order: { quantity: 2 },
  sequence_number: 1,
  ...over,
});

function app(routes: Route[], events = [ev("e1", "Salsa", -1), ev("e2", "Carnaval", 48)]) {
  const f = mockFetch([...routes, { match: (u) => u === "/api/qr-scanner/events", body: { events } }]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderV2(
    <QueryClientProvider client={qc}>
      <ScannerApp />
    </QueryClientProvider>
  );
  return f;
}

async function startScanning(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Activate camera" }));
  await waitFor(() => expect(cam.active).toBe(true));
}
const scan = (text: string) => act(async () => cam.onText?.(text));

describe("ScannerApp — event picker", () => {
  it("lists the events I can scan, soonest first, marks the one on now and opens it directly when it is the only one", async () => {
    app([]);
    expect(await screen.findByRole("button", { name: /Salsa/ })).toHaveTextContent("Now");
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons.findIndex((t) => t?.includes("Salsa"))).toBeLessThan(buttons.findIndex((t) => t?.includes("Carnaval")));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/v2/scanner?event=e1"));
    expect(screen.getByRole("link", { name: /access code/ })).toHaveAttribute("href", "/qr-scanner");
  });

  it("does not auto-open when two events are on, and leaves out events that ended long ago", async () => {
    const user = userEvent.setup();
    app([], [ev("e1", "Salsa", -1), ev("e3", "Rock", -2), ev("old", "Old party", -48)]);
    await screen.findByRole("button", { name: /Salsa/ });
    expect(screen.queryByText("Old party")).not.toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Rock/ }));
    expect(nav.replace).toHaveBeenCalledWith("/v2/scanner?event=e3");
  });

  it("explains how to get access when there is nothing to scan; shows an error with retry if loading fails", async () => {
    app([], []);
    expect(await screen.findByText(/Ask the organizer to add you/)).toBeInTheDocument();
  });

  it("load error → retry box", async () => {
    mockFetch([{ match: (u) => u === "/api/qr-scanner/events", status: 500, body: {} }]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderV2(
      <QueryClientProvider client={qc}>
        <ScannerApp />
      </QueryClientProvider>
    );
    expect(await screen.findByText("We couldn’t load your events.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry|Try again/ })).toBeInTheDocument();
  });
});

describe("ScannerApp — scanning", () => {
  it("valid ticket → green result with name, tier and n of total → check in → logged", async () => {
    nav.event = "e1";
    const user = userEvent.setup();
    const f = app([
      { match: (u) => u === "/api/qr-scanner/verify", body: { ticket: ticket(), isPromotionalTicket: false } },
      { match: (u) => u === "/api/qr-scanner/checkin", body: { checked_in_at: new Date().toISOString() } },
    ]);
    await startScanning(user);
    await scan(qr("e1"));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Valid ticket");
    expect(status).toHaveTextContent("Ana Pérez");
    expect(status).toHaveTextContent("General · Ticket 1 of 2");
    expect(f.posts()[0]).toMatchObject({ url: "/api/qr-scanner/verify", body: { qrData: { orderId: "o1", eventId: "e1", ticketNumber: 1 } } });
    expect(typeof f.posts()[0]!.body.deviceId).toBe("string");

    await user.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Checked in"));
    expect(f.posts()[1]).toMatchObject({ url: "/api/qr-scanner/checkin", body: { ticketId: "t1", isPromotionalTicket: false } });
    expect(screen.getByRole("list")).toHaveTextContent("Ana Pérez");

    await user.click(screen.getByRole("button", { name: "Scan next" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("already checked in → amber with the time; the camera seeing the same QR again does not call the API twice", async () => {
    nav.event = "e1";
    const user = userEvent.setup();
    const f = app([{ match: (u) => u === "/api/qr-scanner/verify", body: { ticket: ticket({ checked_in_at: "2026-10-16T23:05:00Z" }) } }]);
    await startScanning(user);
    await scan(qr("e1"));
    expect(await screen.findByRole("status")).toHaveTextContent("Already checked in");
    expect(screen.getByRole("status")).toHaveTextContent(/Checked in at 6:05/);
    expect(screen.queryByRole("button", { name: "Check in" })).not.toBeInTheDocument();
    await scan(qr("e1"));
    expect(f.posts()).toHaveLength(1);
  });

  it("ticket of another event → red, without calling the API", async () => {
    nav.event = "e1";
    const user = userEvent.setup();
    const f = app([]);
    await startScanning(user);
    await scan(qr("other"));
    expect(await screen.findByRole("status")).toHaveTextContent("This ticket is for another event");
    expect(f.posts()).toHaveLength(0);
  });

  it("random QR (a URL) is ignored", async () => {
    nav.event = "e1";
    const user = userEvent.setup();
    const f = app([]);
    await startScanning(user);
    await scan("https://example.com");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(f.posts()).toHaveLength(0);
  });

  it("verify 404 → not valid; 403 (no access) → scanner error with the server message", async () => {
    nav.event = "e1";
    const user = userEvent.setup();
    let status = 404;
    app([{ match: (u) => u === "/api/qr-scanner/verify", get status() { return status; }, body: { error: "You can't scan tickets for this event" } } as Route]);
    await startScanning(user);
    await scan(qr("e1", 1));
    expect(await screen.findByRole("status")).toHaveTextContent("Not a valid ticket");
    await user.click(screen.getByRole("button", { name: "Scan next" }));
    status = 403;
    await scan(qr("e1", 2));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Couldn’t check this ticket"));
    expect(screen.getByRole("status")).toHaveTextContent("You can't scan tickets for this event");
  });

  it("check-in 409 (someone else let them in a second ago) → already", async () => {
    nav.event = "e1";
    const user = userEvent.setup();
    app([
      { match: (u) => u === "/api/qr-scanner/verify", body: { ticket: ticket() } },
      { match: (u) => u === "/api/qr-scanner/checkin", status: 409, body: { error: "Already" } },
    ]);
    await startScanning(user);
    await scan(qr("e1"));
    await user.click(await screen.findByRole("button", { name: "Check in" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Already checked in"));
  });

  it("promotional ticket: check-in sends isPromotionalTicket", async () => {
    nav.event = "e1";
    const user = userEvent.setup();
    const f = app([
      { match: (u) => u === "/api/qr-scanner/verify", body: { ticket: ticket({ id: "p1" }), isPromotionalTicket: true } },
      { match: (u) => u === "/api/qr-scanner/checkin", body: {} },
    ]);
    await startScanning(user);
    await scan(JSON.stringify({ eventId: "e1", qrToken: "tok" }));
    await user.click(await screen.findByRole("button", { name: "Check in" }));
    await waitFor(() => expect(f.posts()[1]?.body).toMatchObject({ ticketId: "p1", isPromotionalTicket: true }));
  });

  it("change event goes back to the picker", async () => {
    nav.event = "e1";
    const user = userEvent.setup();
    app([]);
    await user.click(await screen.findByRole("button", { name: "Change event" }));
    expect(nav.replace).toHaveBeenCalledWith("/v2/scanner");
  });
});

describe("ScannersTab", () => {
  const event = { id: "e1", name: "Salsa" } as never;
  function tab(routes: Route[], canEdit = true, language: "en" | "es" = "en") {
    const f = mockFetch(routes);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderV2(
      <QueryClientProvider client={qc}>
        <ScannersTab event={event} organizationName="Kora" canEdit={canEdit} />
      </QueryClientProvider>,
      language
    );
    return f;
  }
  const list = (scanners: unknown[]): Route => ({ match: (u, i) => u === "/api/organizer/events/e1/scanners" && (i?.method ?? "GET") === "GET", body: { scanners } });

  it("explains the default (whole org scans), links the scanner for this event and lists designated people", async () => {
    tab([list([{ id: "s1", user_id: "u9", email: "luis@x.com", first_name: "Luis", last_name: "Mora" }])]);
    expect(screen.getByText(/Everyone in Kora/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open scanner" })).toHaveAttribute("href", "/v2/scanner?event=e1");
    expect(await screen.findByText("Luis Mora")).toBeInTheDocument();
  });

  it("adds by e-mail (normalized) and maps API codes to clear messages", async () => {
    const user = userEvent.setup();
    let code = "NOT_FOUND";
    const f = tab([
      list([]),
      { match: (u, i) => u === "/api/organizer/events/e1/scanners" && i?.method === "POST", status: 409, get body() { return { code, error: "x" }; } } as Route,
    ]);
    await screen.findByText("Nobody else yet.");
    await user.type(screen.getByLabelText("E-mail of their Flame account"), "  Luis@X.com ");
    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("They need to sign up first");
    expect(f.posts()[0]!.body).toEqual({ email: "luis@x.com" });
    code = "ALREADY_MEMBER";
    await user.click(screen.getByRole("button", { name: "Add person" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("they can already scan"));
  });

  it("invalid e-mail never reaches the API", async () => {
    const user = userEvent.setup();
    const f = tab([list([])]);
    await user.type(screen.getByLabelText("E-mail of their Flame account"), "luis");
    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email");
    expect(f.posts()).toHaveLength(0);
  });

  it("removes after confirming", async () => {
    const user = userEvent.setup();
    const f = tab([
      list([{ id: "s1", user_id: "u9", email: "luis@x.com", first_name: "Luis", last_name: null }]),
      { match: (u, i) => u.startsWith("/api/organizer/events/e1/scanners?scannerId=") && i?.method === "DELETE", body: { success: true } },
    ]);
    await user.click(await screen.findByRole("button", { name: "Remove Luis" }));
    expect(screen.getByText("Stop Luis from scanning this event?")).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "Remove" }).at(-1)!;
    await user.click(confirm);
    await waitFor(() => expect(f.posts()[0]).toMatchObject({ url: "/api/organizer/events/e1/scanners?scannerId=s1", method: "DELETE" }));
  });

  it("read-only roles see the explanation but no form, and the list is not fetched", async () => {
    const f = tab([], false, "es");
    expect(screen.getByText(/Todos en Kora/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar persona" })).not.toBeInTheDocument();
    expect(f.calls).toHaveLength(0);
  });
});
