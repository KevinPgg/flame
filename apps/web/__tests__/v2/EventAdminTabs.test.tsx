import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TiersTab from "../../app/v2/organizer/event/[id]/tabs/TiersTab";
import PromotersTab from "../../app/v2/organizer/event/[id]/tabs/PromotersTab";
import PromotionsTab from "../../app/v2/organizer/event/[id]/tabs/PromotionsTab";
import { renderV2, mockFetch } from "./helpers";

// Many clicks per test: slower machines (Windows) needed > 5 s with the default per-key delay.
vi.setConfig({ testTimeout: 20_000 });

afterEach(() => vi.unstubAllGlobals());

const event = {
  id: "ev1",
  slug: "biblos",
  currency: "USD",
  ticket_tiers: [
    { id: "ga", name: "General", price_cents: 2000, quantity_total: 100, quantity_sold: 40, quantity_reserved: 5 },
    { id: "gl", name: "Guest list", price_cents: 0, quantity_total: 20, quantity_sold: 0, is_hidden: true, is_manually_sold_out: true },
  ],
  promoter_links: [
    { id: "p1", promoter_code: "LUIS", promoter_name: "Luis", total_tickets_sold: 3, total_revenue_cents: 6000 },
    { id: "p2", promoter_code: "ANA", promoter_name: null, total_tickets_sold: 9, total_revenue_cents: 18000 },
  ],
  promotional_codes: [
    { id: "d1", code: "VIP10", discount_percentage: 10, usage_limit: 50, usage_count: 50 },
    { id: "d2", code: "EARLY", discount_percentage: 20, usage_limit: 10, usage_count: 2 },
  ],
} as never;

const purchases = [
  { id: "x", userName: "A", email: "a@x.com", tierName: "General", stageName: null, quantity: 2, totalPrice: 4600, basePrice: 4000, scanned: false, createdAt: "2026-10-01T00:00:00Z" },
] as never;

describe("TiersTab", () => {
  it("shows sold / pending / left / revenue per tier", () => {
    mockFetch([]);
    renderV2(<TiersTab event={event} purchases={purchases} canEdit={false} slug="kora" onChanged={vi.fn()} />);
    const general = screen.getByRole("heading", { name: "General" }).closest("article")!;
    expect(within(general).getByText("40 / 100 sold")).toBeInTheDocument();
    expect(within(general).getByText("5 pending")).toBeInTheDocument();
    expect(within(general).getByText("55 left")).toBeInTheDocument();
    expect(within(general).getByText("$40.00")).toBeInTheDocument();
    const guest = screen.getByRole("heading", { name: "Guest list" }).closest("article")!;
    expect(within(guest).getByText("Free")).toBeInTheDocument();
  });

  it("read-only: badges instead of switches, no edit link", () => {
    mockFetch([]);
    renderV2(<TiersTab event={event} purchases={purchases} canEdit={false} slug="kora" onChanged={vi.fn()} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.queryByText("Add or edit tiers")).not.toBeInTheDocument();
  });

  it("switches PATCH the tier and refresh; edit link goes to v1", async () => {
    const f = mockFetch([{ match: (u) => u === "/api/ticket-tiers", body: {} }]);
    const onChanged = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderV2(<TiersTab event={event} purchases={purchases} canEdit slug="kora" onChanged={onChanged} />);
    const general = screen.getByRole("heading", { name: "General" }).closest("article")!;
    await user.click(within(general).getByRole("switch", { name: "Sold out" }));
    const guest = screen.getByRole("heading", { name: "Guest list" }).closest("article")!;
    expect(within(guest).getByRole("switch", { name: "Hidden" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(guest).getByRole("switch", { name: "Hidden" }));
    expect(f.posts()).toEqual([
      { url: "/api/ticket-tiers", method: "PATCH", body: { id: "ga", is_manually_sold_out: true } },
      { url: "/api/ticket-tiers", method: "PATCH", body: { id: "gl", is_hidden: false } },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "New tier" })).toHaveAttribute("href", "/v2/organizer/event/ev1/tiers/new?org=kora");
    expect(screen.getAllByRole("link", { name: /^Edit / })[0]).toHaveAttribute("href", expect.stringMatching(/^\/v2\/organizer\/event\/ev1\/tiers\/.+\?org=kora$/));
  });

  it("a failed PATCH shows the error and does not refresh", async () => {
    mockFetch([{ match: () => true, status: 403, body: { error: "Insufficient permissions" } }]);
    const onChanged = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderV2(<TiersTab event={event} purchases={purchases} canEdit slug="kora" onChanged={onChanged} />);
    await user.click(screen.getAllByRole("switch", { name: "Sold out" })[0]);
    expect(await screen.findByText("Insufficient permissions")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("warns when every tier is hidden (event page shows no tickets)", () => {
    const hidden = { ...(event as object), ticket_tiers: ((event as unknown as { ticket_tiers: Array<Record<string, unknown>> }).ticket_tiers).map((x) => ({ ...x, is_hidden: true })) };
    renderV2(<TiersTab event={hidden as never} purchases={[]} canEdit slug="kora" onChanged={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Every tier is hidden");
  });

  it("no warning while one tier is visible", () => {
    renderV2(<TiersTab event={event as never} purchases={purchases} canEdit slug="kora" onChanged={vi.fn()} />);
    expect(screen.queryByText(/Every tier is hidden/)).not.toBeInTheDocument();
  });

  it("no tiers", () => {
    mockFetch([]);
    renderV2(<TiersTab event={{ ...(event as object), ticket_tiers: [] } as never} purchases={[]} canEdit={false} slug="kora" onChanged={vi.fn()} />);
    expect(screen.getByText("No tiers yet.")).toBeInTheDocument();
  });
});

describe("PromotersTab", () => {
  it("leaderboard: most tickets first", () => {
    mockFetch([]);
    renderV2(<PromotersTab event={event} canEdit={false} onChanged={vi.fn()} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("ANA");
    expect(items[1]).toContain("LUIS");
    expect(screen.queryByPlaceholderText("Code")).not.toBeInTheDocument();
  });

  it("validates like the API before calling it", async () => {
    const f = mockFetch([]);
    const user = userEvent.setup({ delay: null });
    renderV2(<PromotersTab event={event} canEdit onChanged={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Code"), "ab");
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    expect(screen.getByText("At least 3 characters.")).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText("Code"));
    await user.type(screen.getByPlaceholderText("Code"), "luis");
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    expect(screen.getByText("That code already exists for this event.")).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText("Code"));
    await user.type(screen.getByPlaceholderText("Code"), "va-le");
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    expect(screen.getByText("Letters and numbers only.")).toBeInTheDocument();
    expect(f.fn).not.toHaveBeenCalled();
  });

  it("creates with the uppercased code and optional name", async () => {
    const f = mockFetch([{ match: (u) => u === "/api/organizer/promoter-links", body: {} }]);
    const onChanged = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderV2(<PromotersTab event={event} canEdit onChanged={onChanged} />);
    await user.type(screen.getByPlaceholderText("Code"), "vale10");
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    expect(f.posts()[0].body).toEqual({ event_id: "ev1", promoter_code: "VALE10", promoter_name: null });
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Code")).toHaveValue("");
  });

  it("copies the same URL as v1", async () => {
    mockFetch([]);
    const user = userEvent.setup({ delay: null });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    // __tests__/setup.ts replaces window.location with an object without `origin`.
    Object.assign(window.location, { origin: "https://flme.test" });
    renderV2(<PromotersTab event={event} canEdit={false} onChanged={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "Copy link" })[0]);
    expect(writeText).toHaveBeenCalledWith("https://flme.test/events/biblos?promoter=ANA");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("deleting asks first; cancel does nothing, confirm calls DELETE", async () => {
    const f = mockFetch([{ match: (u, i) => i?.method === "DELETE", body: {} }]);
    const onChanged = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderV2(<PromotersTab event={event} canEdit onChanged={onChanged} />);
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete promoter link ANA?");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(f.fn).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(f.posts()).toEqual([{ url: "/api/organizer/promoter-links/p2", method: "DELETE", body: undefined }]);
    expect(onChanged).toHaveBeenCalled();
  });
});

describe("PromotionsTab", () => {
  it("cards show usage and Active / Used up", () => {
    mockFetch([]);
    renderV2(<PromotionsTab event={event} canEdit={false} onChanged={vi.fn()} />);
    const vip = screen.getByText("VIP10").closest("article")!;
    expect(within(vip).getByText("Used up")).toBeInTheDocument();
    expect(within(vip).getByText("50 / 50 used")).toBeInTheDocument();
    const early = screen.getByText("EARLY").closest("article")!;
    expect(within(early).getByText("Active")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("creates a code with discount and usage limit", async () => {
    const f = mockFetch([{ match: (u) => u === "/api/organizer/promotional-codes", body: {} }]);
    const onChanged = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderV2(<PromotionsTab event={event} canEdit onChanged={onChanged} />);
    await user.type(screen.getByRole("textbox", { name: "Code" }), "summer");
    await user.selectOptions(screen.getByRole("combobox", { name: "Discount" }), "25");
    const limit = screen.getByRole("spinbutton", { name: "Usage limit" });
    await user.clear(limit);
    await user.type(limit, "100");
    await user.click(screen.getByRole("button", { name: "Add code" }));
    expect(f.posts()[0].body).toEqual({ event_id: "ev1", code: "SUMMER", discount_percentage: 25, usage_limit: 100 });
    expect(onChanged).toHaveBeenCalled();
  });

  it("rejects a duplicate code, an empty limit or a limit below 1 without calling the API", async () => {
    const f = mockFetch([]);
    const user = userEvent.setup({ delay: null });
    renderV2(<PromotionsTab event={event} canEdit onChanged={vi.fn()} />);
    const code = screen.getByRole("textbox", { name: "Code" });
    const limit = screen.getByRole("spinbutton", { name: "Usage limit" });
    await user.type(code, "early");
    await user.click(screen.getByRole("button", { name: "Add code" }));
    expect(screen.getByText("That code already exists for this event.")).toBeInTheDocument();

    await user.clear(code);
    await user.type(code, "NEW1");
    await user.clear(limit);
    await user.click(screen.getByRole("button", { name: "Add code" }));
    expect(screen.getByText("The usage limit must be at least 1.")).toBeInTheDocument();

    // 0 is stopped by the browser itself (min=1): the form never submits.
    await user.type(limit, "0");
    expect(limit).toBeInvalid();
    await user.click(screen.getByRole("button", { name: "Add code" }));
    expect(f.fn).not.toHaveBeenCalled();
  });

  it("delete: confirm calls DELETE; a failure is shown", async () => {
    mockFetch([{ match: (u, i) => i?.method === "DELETE", status: 404, body: { error: "Code not found" } }]);
    const onChanged = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderV2(<PromotionsTab event={event} canEdit onChanged={onChanged} />);
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete code VIP10?");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Code not found")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
