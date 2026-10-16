import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";
import ScannersTab from "../../app/v2/organizer/event/[id]/tabs/ScannersTab";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());

const SCANNERS = "/api/organizer/events/e1/scanners";
const CODE = "/api/organizer/events/e1/scanner-code";

function tab(
  routes: Route[],
  { canEdit = true, canManageCode = true, code = null as string | null, language = "en" as "en" | "es", onCodeChanged = vi.fn() } = {}
) {
  const f = mockFetch(routes);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderV2(
    <QueryClientProvider client={qc}>
      <ScannersTab
        event={{ id: "e1", name: "Salsa", qr_scanner_code: code ?? undefined } as never}
        organizationName="Kora"
        canEdit={canEdit}
        canManageCode={canManageCode}
        onCodeChanged={onCodeChanged}
      />
    </QueryClientProvider>,
    language
  );
  return { f, onCodeChanged };
}
const list = (scanners: unknown[]): Route => ({ match: (u, i) => u === SCANNERS && (i?.method ?? "GET") === "GET", body: { scanners } });
const putCode = (body: unknown, status = 200): Route => ({ match: (u, i) => u === CODE && i?.method === "PUT", status, body });

describe("ScannersTab — accounts", () => {
  it("says scanning happens in the phone app (no scanner link on the web) and lists designated people", async () => {
    tab([list([{ id: "s1", user_id: "u9", email: "luis@x.com", first_name: "Luis", last_name: "Mora" }])]);
    expect(screen.getByText(/scanned with the Flame app on a phone/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /scanner/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accounts that can scan" })).toBeInTheDocument();
    expect(screen.getByText(/Everyone in Kora/)).toBeInTheDocument();
    expect(await screen.findByText("Luis Mora")).toBeInTheDocument();
  });

  it("adds by e-mail (normalized) and maps API codes to clear messages", async () => {
    const user = userEvent.setup();
    let code = "NOT_FOUND";
    const { f } = tab([
      list([]),
      { match: (u, i) => u === SCANNERS && i?.method === "POST", status: 409, get body() { return { code, error: "x" }; } } as Route,
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
    const { f } = tab([list([])]);
    await user.type(screen.getByLabelText("E-mail of their Flame account"), "luis");
    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email");
    expect(f.posts()).toHaveLength(0);
  });

  it("removes after confirming", async () => {
    const user = userEvent.setup();
    const { f } = tab([
      list([{ id: "s1", user_id: "u9", email: "luis@x.com", first_name: "Luis", last_name: null }]),
      { match: (u, i) => u.startsWith(`${SCANNERS}?scannerId=`) && i?.method === "DELETE", body: { success: true } },
    ]);
    await user.click(await screen.findByRole("button", { name: "Remove Luis" }));
    expect(screen.getByText("Stop Luis from scanning this event?")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Remove" }).at(-1)!);
    await waitFor(() => expect(f.posts()[0]).toMatchObject({ url: `${SCANNERS}?scannerId=s1`, method: "DELETE" }));
  });

  it("read-only roles see the explanation but no form, the list is not fetched and the code is hidden", async () => {
    const { f } = tab([], { canEdit: false, canManageCode: false, code: "DOOR1", language: "es" });
    expect(screen.getByText(/Todos en Kora/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar persona" })).not.toBeInTheDocument();
    expect(screen.queryByText("DOOR1")).not.toBeInTheDocument();
    expect(screen.getByText(/Solo dueños y admins pueden ver y cambiar el código/)).toBeInTheDocument();
    expect(f.calls).toHaveLength(0);
  });
});

describe("ScannersTab — access code (separate from accounts)", () => {
  it("no code → explains it and creates one without asking", async () => {
    const user = userEvent.setup();
    const { f, onCodeChanged } = tab([list([]), putCode({ code: "K7Q2MX" })]);
    expect(screen.getByRole("heading", { name: "Access code" })).toBeInTheDocument();
    expect(screen.getByText(/Settings → Scan Tickets/)).toBeInTheDocument();
    expect(screen.getByText("No code. Only the accounts above can scan.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create code" }));
    expect(await screen.findByTestId("access-code")).toHaveTextContent("K7Q2MX");
    expect(f.posts().at(-1)).toMatchObject({ url: CODE, method: "PUT", body: { action: "generate" } });
    expect(onCodeChanged).toHaveBeenCalled();
  });

  it("existing code: shown with copy; a new code and removing ask first", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    let next: unknown = { code: "NEW123" };
    const { f } = tab([list([]), { match: (u, i) => u === CODE && i?.method === "PUT", get body() { return next; } } as Route], { code: "DOOR1" });
    expect(screen.getByTestId("access-code")).toHaveTextContent("DOOR1");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("DOOR1");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New code" }));
    expect(screen.getByText("Replace the access code?")).toBeInTheDocument();
    expect(f.posts().filter((p) => p.url === CODE)).toHaveLength(0);
    await user.click(screen.getAllByRole("button", { name: "New code" }).at(-1)!);
    await waitFor(() => expect(screen.getByTestId("access-code")).toHaveTextContent("NEW123"));

    next = { code: null };
    await user.click(screen.getByRole("button", { name: "Remove code" }));
    expect(screen.getByText("Remove the access code?")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Remove code" }).at(-1)!);
    expect(await screen.findByText("No code. Only the accounts above can scan.")).toBeInTheDocument();
    expect(f.posts().filter((p) => p.url === CODE).map((p) => p.body)).toEqual([{ action: "generate" }, { action: "clear" }]);
  });

  it("choose my own: normalized, validated locally, and a taken code is explained", async () => {
    const user = userEvent.setup();
    const { f } = tab([list([]), putCode({ code: "CODE_TAKEN", error: "x" }, 409)]);
    await user.click(screen.getByRole("button", { name: "Choose my own" }));
    const input = screen.getByLabelText("Your code (4–8 letters or numbers)");
    await user.type(input, "ab");
    await user.click(screen.getByRole("button", { name: "Save code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use 4 to 8 letters or numbers");
    expect(f.posts().filter((p) => p.url === CODE)).toHaveLength(0);

    await user.clear(input);
    await user.type(input, "door-12");
    await user.click(screen.getByRole("button", { name: "Save code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another event already uses this code");
    expect(f.posts().at(-1)!.body).toEqual({ action: "set", code: "DOOR12" });
  });
});
