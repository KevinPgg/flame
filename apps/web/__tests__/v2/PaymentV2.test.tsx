/**
 * Fase 3.3 (web): the Flame 2.0 payment screen on /purchase (same logic as v1) and "You're in"
 * on /purchase/success with B5 (no error for a slow webhook).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderV2 } from "./helpers";

const st = vi.hoisted(() => ({ q: "session=11111111-1111-4111-8111-111111111111" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(st.q),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="stripe-elements">{children}</div>,
  useStripe: () => ({ confirmPayment: vi.fn() }),
  useElements: () => ({ submit: vi.fn(async () => ({})) }),
  PaymentElement: () => <div data-testid="payment-element" />,
}));
vi.mock("../../app/lib/stripe/stripe-client", () => ({ getStripe: () => Promise.resolve({}) }));

import StripePurchaseFlow from "../../app/components/StripePurchaseFlow";
import { PurchaseSuccessV2, successPollDelay } from "../../app/v2/attendee/purchase/success/PurchaseSuccessV2";

const HOLD = "11111111-1111-4111-8111-111111111111";
const DETAILS = {
  mode: "hold",
  event: { id: "e1", name: "White Party", slug: "white-party", starts_at: "2026-11-14T03:00:00Z", venue: "Club", city: "Guayaquil", timezone: "America/Guayaquil" },
  ticket_tier: { id: "t1", name: "Tier 1", price_cents: 1500 },
  quantity: 2,
  stage_id: null,
  stage_name: null,
  stage_price_cents: null,
  promoter_code: null,
  secret_code: null,
  expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
  user: { email: "a@b.c", first_name: "Kevin", last_name: null },
};
const PI = (id: string, extra: Record<string, unknown> = {}) => ({
  clientSecret: `${id}_secret_x`,
  paymentIntentId: id,
  amounts: { base: 3000, fee: 399, total: 3399, discount: 0, currency: "usd", ...extra },
});

type Call = { url: string; body: any };
function stub(handler: (url: string, body: any) => Response | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, body });
      return handler(url, body) ?? new Response(JSON.stringify({ error: `unmocked ${url}` }), { status: 599 });
    }),
  );
  return calls;
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe("payment screen v2 (/purchase)", () => {
  beforeEach(() => {
    st.q = `session=${HOLD}`;
  });

  it("countdown, event, order, breakdown with the service fee, and Pay $X", async () => {
    stub((url) => {
      if (url.startsWith("/api/holds/details")) return json(DETAILS);
      if (url === "/api/purchase/create-payment-intent") return json(PI("pi_1"));
    });
    renderV2(<StripePurchaseFlow v2 />);
    expect(await screen.findByRole("heading", { name: "Checkout" })).toBeInTheDocument();
    expect(screen.getByTestId("hold-timer")).toHaveTextContent(/Tickets reserved for (28|29):\d\d/);
    expect(screen.getByText("White Party")).toBeInTheDocument();
    expect(screen.getByText("2 × Tier 1")).toBeInTheDocument();
    expect(screen.getByText("$3.99")).toBeInTheDocument();
    expect(screen.getByText("$33.99")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay $33.99" })).toBeInTheDocument();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Service fee" }));
    expect(screen.getByText(/covers secure payments/)).toBeInTheDocument();
  });

  it("no promoter on the hold → it can be added here: checked by the server, then the payment is re-created carrying it", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = stub((url, body) => {
      if (url.startsWith("/api/holds/details")) return json(DETAILS);
      if (url.startsWith("/api/promoter-validate")) return json({ valid: url.includes("code=JUAN") });
      if (url === "/api/purchase/create-payment-intent") return json(PI(body?.promoterCode ? "pi_2" : "pi_1"));
    });
    renderV2(<StripePurchaseFlow v2 />);
    const input = await screen.findByRole("textbox", { name: "Promoter code (optional)" });
    await user.type(input, "nope");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("That promoter code isn’t valid for this event.")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "juan");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByTestId("order-promoter")).toHaveTextContent("JUAN");
    const recreate = calls.filter((c) => c.url === "/api/purchase/create-payment-intent")[1];
    expect(recreate?.body).toMatchObject({ holdId: HOLD, promoterCode: "JUAN", oldPaymentIntentId: "pi_1" });
    expect(screen.queryByRole("textbox", { name: "Promoter code (optional)" })).not.toBeInTheDocument();
  });

  it("a promoter that came with the hold shows checked (no field); the discount applies and shows in the breakdown", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = stub((url, body) => {
      if (url.startsWith("/api/holds/details")) return json({ ...DETAILS, promoter_code: "PIRILIN" });
      if (url === "/api/purchase/create-payment-intent") return json(body?.promoCode ? PI("pi_2", { discount: 300, total: 3069 }) : PI("pi_1"));
    });
    renderV2(<StripePurchaseFlow v2 />);
    expect(await screen.findByTestId("order-promoter")).toHaveTextContent("PIRILIN");
    expect(screen.queryByRole("textbox", { name: "Promoter code (optional)" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Discount code" }), "save10");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("−$3.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay $30.69" })).toBeInTheDocument();
    expect(calls.filter((c) => c.url === "/api/purchase/create-payment-intent")[1]?.body).toMatchObject({ promoCode: "SAVE10", promoterCode: "PIRILIN" });
  });

  it("Pay waits while a discount is being applied (it replaces the payment) — Kevin 10-29", async () => {
    const user = userEvent.setup({ delay: null });
    const gate = { release: () => {} };
    stub((url, body) => {
      if (url.startsWith("/api/holds/details")) return json(DETAILS);
      if (url === "/api/purchase/create-payment-intent") {
        if (!body?.promoCode) return json(PI("pi_1"));
        return undefined;
      }
    });
    // the discount call hangs until released
    const orig = globalThis.fetch as unknown as (i: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn(async (i: RequestInfo | URL, init?: RequestInit) => {
      const b = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      if (String(i) === "/api/purchase/create-payment-intent" && b?.promoCode) {
        await new Promise<void>((r) => (gate.release = r));
        return json(PI("pi_2", { discount: 300, total: 3069 }));
      }
      return orig(i, init);
    }));
    renderV2(<StripePurchaseFlow v2 />);
    await user.type(await screen.findByRole("textbox", { name: "Discount code" }), "save10");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("button", { name: "Pay $33.99" })).toBeDisabled();
    await act(async () => gate.release());
    expect(await screen.findByRole("button", { name: "Pay $30.69" })).toBeEnabled();
  });

  it("back only navigates; releasing the reservation is an explicit, confirmed 'Cancel reservation'", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = stub((url) => {
      if (url.startsWith("/api/holds/details")) return json(DETAILS);
      if (url === "/api/purchase/create-payment-intent") return json(PI("pi_1"));
      if (url === "/api/holds/cancel") return json({ ok: true });
    });
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    renderV2(<StripePurchaseFlow v2 />);
    await user.click(await screen.findByRole("button", { name: "Back" }));
    expect(back).toHaveBeenCalled();
    expect(calls.some((c) => c.url === "/api/holds/cancel")).toBe(false);
    await user.click(screen.getAllByRole("button", { name: "Cancel reservation" })[0]!);
    expect(screen.getByText("Cancel this reservation?")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/holds/cancel")).toBe(false);
    const dialogButtons = screen.getAllByRole("button", { name: "Cancel reservation" });
    await user.click(dialogButtons[dialogButtons.length - 1]!);
    await waitFor(() => expect(calls.find((c) => c.url === "/api/holds/cancel")?.body).toEqual({ holdSessionId: HOLD }));
  });

  it("expired reservation: says so, Pay is blocked, 'Choose again' goes back to the event", async () => {
    stub((url) => {
      if (url.startsWith("/api/holds/details")) return json({ ...DETAILS, expires_at: new Date(Date.now() + 1500).toISOString() });
      if (url === "/api/purchase/create-payment-intent") return json(PI("pi_1"));
    });
    renderV2(<StripePurchaseFlow v2 />);
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert).toHaveTextContent("Your reservation expired");
    expect(within(alert).getByRole("link", { name: "Choose again" })).toHaveAttribute("href", "/events/white-party");
    expect(screen.getByRole("button", { name: "Pay $33.99" })).toBeDisabled();
  });
});

describe("You're in (/purchase/success) · B5", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    st.q = "pi=pi_9";
  });
  afterEach(() => vi.useRealTimers());

  it("backs off 1 s → 8 s", () => {
    expect([0, 1, 2, 5, 10].map(successPollDelay)).toEqual([1000, 1500, 2250, 7593.75, 8000]);
  });

  it("the order appears late: honest 'payment received' after 10 s (no error), then You're in", async () => {
    let ready = false;
    stub((url) => {
      if (url === "/api/orders/pi_9")
        return ready ? json({ order: { event: { name: "White Party", slug: "white-party" }, tickets: [{ id: "tk1" }, { id: "tk2" }] } }) : json({ error: "Order not found" }, 404);
    });
    renderV2(<PurchaseSuccessV2 />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(screen.getByTestId("success-preparing")).toHaveTextContent("Your tickets are being prepared");
    expect(screen.getByRole("link", { name: "Go to my tickets" })).toHaveAttribute("href", "/account");
    ready = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "You’re in" })).toBeInTheDocument());
    expect(screen.getByText("2 tickets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View tickets" })).toHaveAttribute("href", "/account/ticket/tk1");
  });

  it("after ~2 minutes without the order it keeps the honest message (never an error)", async () => {
    stub((url) => (url === "/api/orders/pi_9" ? json({ error: "Order not found" }, 404) : undefined));
    renderV2(<PurchaseSuccessV2 />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(130_000);
    });
    expect(screen.getByTestId("success-preparing")).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});
