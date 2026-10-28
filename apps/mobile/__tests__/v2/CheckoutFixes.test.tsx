/**
 * Fase 3.1 in the app's checkout hook (useCheckout):
 *  - B10: the promoter code is checked by the server (/api/promoter-validate, public GET), not
 *    by a direct Supabase read.
 *  - B2: while it's being checked, checkout() does nothing (no hold without the promoter); a
 *    failed check is "error" (shown with Retry), not a silent "invalid".
 *  - B3: the hold is marked "payment in progress" (/api/holds/start-payment) before the
 *    PaymentSheet opens; if that fails nothing is presented and the hold is released.
 */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCheckout } from "../../hooks/useCheckout";
import { ApiError } from "../../lib/api";

jest.mock("../../hooks/useOptionalAuth", () => ({
  useOptionalAuth: () => ({ getToken: async () => "tok", isSignedIn: true, isConfigured: true, userId: "u1" }),
}));

const EVENT = { id: "e1", name: "Ev", currency: "USD", requires_rsvp: false, ticket_tiers: [] } as never;
const TIER = {
  id: "t1",
  name: "GA",
  price_cents: 1500,
  displayPrice: 1500,
  status: "available",
  quantity_total: 100,
  quantity_sold: 0,
  quantity_reserved: 0,
  per_user_limit: 10,
  ticket_stages: [],
} as never;

const HOLD = {
  hold_session_id: "h1",
  expires_at: "2026-10-28T20:00:00Z",
  ticket_tier: { id: "t1", name: "GA", price_cents: 1500 },
  quantity: 1,
  stage_name: null,
  stage_price_cents: null,
  promoter_code: null,
};
const PI = { clientSecret: "pi_9_secret_x", paymentIntentId: "pi_9", amounts: { base: 1500, fee: 249, total: 1749, discount: 0, currency: "USD" } };

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

async function setup(opts: { promoter?: string; getPublic?: jest.Mock; startPaymentFails?: boolean } = {}) {
  const log: string[] = [];
  const apiPost = jest.fn(async (url: string, body: Record<string, unknown>) => {
    log.push(`POST ${url}`);
    if (url === "/api/holds/create") return HOLD;
    if (url === "/api/purchase/create-payment-intent") return PI;
    if (url === "/api/holds/start-payment") {
      if (opts.startPaymentFails) throw new ApiError(410, "Your reservation expired", "HOLD_EXPIRED");
      return { ok: true, expires_at: "x", extended: true, body };
    }
    return {};
  });
  const apiGet = jest.fn(async (url: string) => {
    log.push(`GET ${url}`);
    return { valid: true };
  });
  const apiGetPublic = opts.getPublic ?? jest.fn(async (url: string) => {
    log.push(`GET-PUBLIC ${url}`);
    return { valid: url.includes("code=JUAN") };
  });
  const stripe = {
    initPaymentSheet: jest.fn(async () => {
      log.push("initPaymentSheet");
      return {};
    }),
    presentPaymentSheet: jest.fn(async () => {
      log.push("presentPaymentSheet");
      return {};
    }),
  };
  // RNTL 14: renderHook is async.
  const hook = await renderHook(
    () =>
      useCheckout({
        event: EVENT,
        tier: TIER,
        quantity: 1,
        isRsvp: false,
        promoterCode: opts.promoter,
        apiPost: apiPost as never,
        apiGet: apiGet as never,
        apiGetPublic: apiGetPublic as never,
        getStripeFunctions: (async () => stripe) as never,
      }),
    { wrapper },
  );
  return { ...hook, log, apiPost, apiGetPublic, stripe };
}

describe("useCheckout · fase 3.1", () => {
  it("B10: a promoter link is checked by the server, not Supabase", async () => {
    const { result, apiGetPublic } = await setup({ promoter: "juan" });
    await waitFor(() => expect(result.current.promoterStatus).toBe("valid"));
    expect(apiGetPublic).toHaveBeenCalledWith("/api/promoter-validate?event_id=e1&code=JUAN");
    expect(result.current.promoterCode).toBe("JUAN");
  });

  it("B2: while the code is being checked, checkout does nothing; a failed check is 'error', and paying still works", async () => {
    const gate = { release: (_v: unknown) => {}, fail: (_e: unknown) => {} };
    const getPublic = jest.fn(
      () =>
        new Promise((resolve, reject) => {
          gate.release = resolve;
          gate.fail = reject;
        }),
    );
    const { result, apiPost } = await setup({ promoter: "juan", getPublic });
    await waitFor(() => expect(getPublic).toHaveBeenCalled());
    expect(result.current.promoterStatus).toBe("validating");
    await act(async () => {
      await result.current.checkout();
    });
    expect(apiPost).not.toHaveBeenCalled();

    await act(async () => {
      gate.fail(new ApiError(0, "Network request failed"));
    });
    await waitFor(() => expect(result.current.promoterStatus).toBe("error"));

    await act(async () => {
      await result.current.checkout();
    });
    // paid without a promoter (it couldn't be checked), as the buyer was told
    expect(apiPost.mock.calls[0]![0]).toBe("/api/holds/create");
    expect(apiPost.mock.calls[0]![1]).not.toHaveProperty("promoter_code");
  });

  it("B3: the hold is marked 'payment in progress' with the PaymentIntent before the PaymentSheet opens", async () => {
    const { result, log, apiPost } = await setup();
    await act(async () => {
      await result.current.checkout();
    });
    expect(result.current.step).toBe("success");
    const i = log.indexOf("POST /api/holds/start-payment");
    expect(i).toBeGreaterThan(log.indexOf("POST /api/purchase/create-payment-intent"));
    expect(i).toBeLessThan(log.indexOf("initPaymentSheet"));
    expect(apiPost).toHaveBeenCalledWith("/api/holds/start-payment", { hold_id: "h1", payment_intent_id: "pi_9" }, expect.any(Function));
  });

  it("B3: if marking fails (reservation expired) nothing is presented and the hold is released", async () => {
    const { result, log, stripe } = await setup({ startPaymentFails: true });
    await act(async () => {
      await result.current.checkout();
    });
    expect(stripe.presentPaymentSheet).not.toHaveBeenCalled();
    expect(log).toContain("POST /api/holds/cancel");
    expect(result.current.step).toBe("error");
    expect(result.current.error).toBe("Your reservation expired");
  });
});
