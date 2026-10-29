/**
 * Fase 3.3 (app): the payment screen after "Checkout" on the event screen — same server calls as
 * the web: hold details, PaymentIntent (re-created for a discount or a promoter typed here),
 * validate + start-payment (B3) → PaymentSheet, free tickets, countdown (B7).
 */
import type { ReactNode } from "react";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2 } from "./helpers";
import { usePaymentScreen } from "../../hooks/usePaymentScreen";
import { PaymentScreenView } from "../../components/v2/attendee/checkout/PaymentScreen";
import { hidesAttendeeTabBar } from "../../components/v2/attendee/AttendeeTabBar";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }) }));
jest.mock("../../hooks/useOptionalAuth", () => ({
  useOptionalAuth: () => ({ getToken: async () => "tok", isSignedIn: true, isConfigured: true, userId: "u1" }),
}));

const HOLD = "h-1";
const details = (extra: Record<string, unknown> = {}) => ({
  mode: "hold",
  event: { id: "e1", name: "White Party", slug: "white-party", starts_at: "2026-11-14T03:00:00Z", venue: "Club", city: "Guayaquil", timezone: "America/Guayaquil", currency: "USD" },
  ticket_tier: { id: "t1", name: "Tier 1", price_cents: 1500 },
  quantity: 2,
  expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
  stage_id: null,
  stage_name: null,
  stage_price_cents: null,
  promoter_code: null,
  secret_code: null,
  ...extra,
});
const pi = (id: string, extra: Record<string, unknown> = {}) => ({
  clientSecret: `${id}_secret`,
  paymentIntentId: id,
  amounts: { base: 3000, fee: 399, total: 3399, discount: 0, currency: "usd", ...extra },
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function setup(o: { details?: Record<string, unknown>; presentCode?: string; initErrors?: string[] } = {}) {
  const log: string[] = [];
  const posts: Array<{ url: string; body: any }> = [];
  const apiGet = jest.fn(async (url: string) => {
    log.push(`GET ${url.split("?")[0]}`);
    if (url.startsWith("/api/holds/details")) return details(o.details);
    if (url.startsWith("/api/holds/validate")) return { valid: true };
    throw new Error("unmocked");
  });
  const apiPost = jest.fn(async (url: string, body: any) => {
    log.push(`POST ${url}`);
    posts.push({ url, body });
    if (url === "/api/purchase/create-payment-intent") return body.promoCode ? pi("pi_3", { discount: 300, total: 3069 }) : pi(body.promoterCode ? "pi_2" : "pi_1");
    if (url === "/api/holds/start-payment") return { ok: true, expires_at: new Date(Date.now() + 39 * 60_000).toISOString() };
    return {};
  });
  const apiGetPublic = jest.fn(async (url: string) => ({ valid: url.includes("code=JUAN") }));
  const stripe = {
    initPaymentSheet: jest.fn(async (p: Record<string, unknown>): Promise<{ error?: { message: string } }> => {
      log.push(`initPaymentSheet ${String(p.paymentIntentClientSecret)}`);
      const err = o.initErrors?.shift();
      return err ? { error: { message: err } } : {};
    }),
    presentPaymentSheet: jest.fn(async () => {
      log.push("presentPaymentSheet");
      return o.presentCode ? { error: { message: "closed", code: o.presentCode } } : {};
    }),
  };
  return { log, posts, deps: { apiGet: apiGet as never, apiPost: apiPost as never, apiGetPublic: apiGetPublic as never, getStripe: async () => stripe }, stripe };
}

describe("usePaymentScreen (app)", () => {
  it("loads the reservation and creates the payment; Pay = validate → start-payment (B3) → PaymentSheet → You're in", async () => {
    const { log, posts, deps } = setup();
    const { result } = await renderHook(() => usePaymentScreen(HOLD, deps), { wrapper });
    await waitFor(() => expect(result.current.step).toBe("ready"));
    expect(result.current.amounts?.total).toBe(3399);
    expect(posts[0]).toMatchObject({ url: "/api/purchase/create-payment-intent", body: { holdId: HOLD, flow: "hold", quantity: 2 } });
    const before = result.current.expiresAt;
    await act(async () => {
      await result.current.pay();
    });
    expect(result.current.step).toBe("paid");
    const order = ["GET /api/holds/validate", "POST /api/holds/start-payment", "initPaymentSheet pi_1_secret", "presentPaymentSheet"];
    expect(log.filter((l) => order.includes(l))).toEqual(order);
    expect(posts.find((p) => p.url === "/api/holds/start-payment")?.body).toEqual({ hold_id: HOLD, payment_intent_id: "pi_1" });
    expect(result.current.expiresAt).not.toBe(before); // the countdown follows the +10 min
  });

  it("closing Stripe's sheet charges nothing and keeps the reservation (back to ready, no cancel)", async () => {
    const { log, deps } = setup({ presentCode: "Canceled" });
    const { result } = await renderHook(() => usePaymentScreen(HOLD, deps), { wrapper });
    await waitFor(() => expect(result.current.step).toBe("ready"));
    await act(async () => {
      await result.current.pay();
    });
    expect(result.current.step).toBe("ready");
    expect(log).not.toContain("POST /api/holds/cancel");
  });

  it("closing the sheet also clears the 'payment in progress' mark (the server checks with Stripe) — Kevin 10-29", async () => {
    const { posts, deps } = setup({ presentCode: "Canceled" });
    const { result } = await renderHook(() => usePaymentScreen(HOLD, deps), { wrapper });
    await waitFor(() => expect(result.current.step).toBe("ready"));
    await act(async () => {
      await result.current.pay();
    });
    expect(posts.filter((p) => p.url === "/api/holds/start-payment").map((p) => p.body)).toEqual([
      { hold_id: HOLD, payment_intent_id: "pi_1" },
      { hold_id: HOLD, payment_intent_id: "pi_1", abort: true },
    ]);
  });

  it("the payment was replaced elsewhere (cancelled PaymentIntent): a fresh one is made and the sheet opens with it", async () => {
    const { log, posts, deps } = setup({ initErrors: ["PaymentSheet cannot set up a PaymentIntent in status 'canceled'"] });
    const { result } = await renderHook(() => usePaymentScreen(HOLD, deps), { wrapper });
    await waitFor(() => expect(result.current.step).toBe("ready"));
    await act(async () => {
      await result.current.pay();
    });
    expect(result.current.step).toBe("paid");
    expect(log.filter((l) => l.startsWith("initPaymentSheet"))).toEqual(["initPaymentSheet pi_1_secret", "initPaymentSheet pi_1_secret"]);
    const created = posts.filter((p) => p.url === "/api/purchase/create-payment-intent");
    expect(created).toHaveLength(2);
    expect(created[1]?.body.oldPaymentIntentId).toBeUndefined();
  });

  it("promoter typed here: checked by the server, then the payment is re-created carrying it; the discount keeps it", async () => {
    const { posts, deps } = setup();
    const { result } = await renderHook(() => usePaymentScreen(HOLD, deps), { wrapper });
    await waitFor(() => expect(result.current.step).toBe("ready"));
    await act(async () => {
      await result.current.applyPromoter("nope");
    });
    expect(result.current.promoter.status).toBe("invalid");
    await act(async () => {
      await result.current.applyPromoter("juan");
    });
    expect(result.current.promoterCode).toBe("JUAN");
    expect(posts.at(-1)?.body).toMatchObject({ promoterCode: "JUAN", oldPaymentIntentId: "pi_1" });
    await act(async () => {
      await result.current.applyPromo("save10");
    });
    expect(result.current.promo.applied).toBe("SAVE10");
    expect(result.current.amounts?.total).toBe(3069);
    expect(posts.at(-1)?.body).toMatchObject({ promoCode: "SAVE10", promoterCode: "JUAN", oldPaymentIntentId: "pi_2" });
  });

  it("a free ticket: no payment is created; Claim → complete-hold-free with the hold's promoter", async () => {
    const { posts, deps } = setup({ details: { ticket_tier: { id: "t1", name: "Free", price_cents: 0 }, promoter_code: "PIRILIN" } });
    const { result } = await renderHook(() => usePaymentScreen(HOLD, deps), { wrapper });
    await waitFor(() => expect(result.current.step).toBe("ready"));
    expect(result.current.isFree).toBe(true);
    expect(posts.some((p) => p.url === "/api/purchase/create-payment-intent")).toBe(false);
    await act(async () => {
      await result.current.claimFree();
    });
    expect(result.current.step).toBe("claimed");
    expect(posts.at(-1)).toEqual({ url: "/api/purchase/complete-hold-free", body: { holdSessionId: HOLD, promoter_code: "PIRILIN" } });
  });
});

describe("PaymentScreenView (app)", () => {
  it("countdown, order with the promoter ✓, breakdown and Pay $X", async () => {
    const { deps } = setup({ details: { promoter_code: "PIRILIN" } });
    function Screen() {
      const s = usePaymentScreen(HOLD, deps);
      return <PaymentScreenView s={s} onBack={jest.fn()} onDone={jest.fn()} onViewTickets={jest.fn()} />;
    }
    await renderV2(<Screen />);
    expect(await screen.findByText("Pay $33.99")).toBeTruthy();
    expect(screen.getByTestId("hold-timer")).toBeTruthy();
    expect(screen.getByText(/Tickets reserved for (28|29):\d\d/)).toBeTruthy();
    expect(screen.getByText("2 × Tier 1")).toBeTruthy();
    expect(screen.getByTestId("order-promoter")).toBeTruthy();
    expect(screen.queryByLabelText("Promoter code (optional)")).toBeNull();
    expect(screen.getByText("$3.99")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Service fee" }));
    expect(screen.getByText(/covers secure payments/)).toBeTruthy();
  });

  it("an access code that unlocked the tier shows in the order (parity with the web)", async () => {
    const { deps } = setup({ details: { secret_code: "WHITEVIP" } });
    function Screen() {
      const s = usePaymentScreen(HOLD, deps);
      return <PaymentScreenView s={s} onBack={jest.fn()} onDone={jest.fn()} onViewTickets={jest.fn()} />;
    }
    await renderV2(<Screen />);
    expect(await screen.findByTestId("order-access-code")).toBeTruthy();
    expect(screen.getByText("WHITEVIP")).toBeTruthy();
  });

  it("'Cancel reservation' is its own button (back never releases the reservation)", async () => {
    const { deps } = setup();
    const onBack = jest.fn();
    const onCancel = jest.fn();
    function Screen() {
      const s = usePaymentScreen(HOLD, deps);
      return <PaymentScreenView s={s} onBack={onBack} onDone={jest.fn()} onViewTickets={jest.fn()} onCancelReservation={onCancel} />;
    }
    await renderV2(<Screen />);
    await screen.findByText("Pay $33.99");
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("cancel-reservation"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("the island hides on the payment screen too", () => {
    expect(hidesAttendeeTabBar("/checkout/h-1")).toBe(true);
  });
});
