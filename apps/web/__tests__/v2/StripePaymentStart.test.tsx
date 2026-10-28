/**
 * B3 (fase 3.1) on the web payment form: right before confirming with Stripe, the hold is marked
 * "payment in progress" (POST /api/holds/start-payment with the PaymentIntent). If that fails,
 * nothing is confirmed (no charge).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const st = vi.hoisted(() => ({ log: [] as string[] }));
vi.mock("@stripe/react-stripe-js", () => ({
  useStripe: () => ({
    confirmPayment: vi.fn(async () => {
      st.log.push("confirmPayment");
      return { paymentIntent: { id: "pi_77", status: "succeeded" } };
    }),
  }),
  useElements: () => ({
    submit: vi.fn(async () => {
      st.log.push("elements.submit");
      return {};
    }),
  }),
  PaymentElement: () => <div data-testid="payment-element" />,
}));
import StripePaymentForm from "../../app/components/StripePaymentForm";

function stubFetch(startStatus: number) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      st.log.push(`fetch ${url.split("?")[0]}`);
      if (url.startsWith("/api/holds/validate")) return new Response(JSON.stringify({ valid: true }));
      if (url === "/api/holds/start-payment")
        return startStatus === 200
          ? new Response(JSON.stringify({ ok: true }))
          : new Response(JSON.stringify({ error: "Your reservation expired", code: "HOLD_EXPIRED" }), { status: startStatus });
      return new Response("{}", { status: 599 });
    }),
  );
  return calls;
}

function renderForm(onSuccess = vi.fn(), onError = vi.fn()) {
  const view = render(
    <StripePaymentForm onSuccess={onSuccess} onError={onError} amount={1749} currency="USD" holdSessionId="h-1" paymentIntentId="pi_77" />,
  );
  return { ...view, onSuccess, onError };
}

beforeEach(() => {
  st.log = [];
});

describe("StripePaymentForm · B3", () => {
  it("marks the hold with the PaymentIntent before confirming", async () => {
    const calls = stubFetch(200);
    const { container, onSuccess } = renderForm();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(st.log).toEqual(["fetch /api/holds/validate", "elements.submit", "fetch /api/holds/start-payment", "confirmPayment"]);
    expect(calls.find((c) => c.url === "/api/holds/start-payment")?.body).toEqual({ hold_id: "h-1", payment_intent_id: "pi_77" });
  });

  it("if marking fails nothing is confirmed and the reason is shown", async () => {
    stubFetch(410);
    const { container, onError } = renderForm();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Your reservation expired"));
    expect(st.log).not.toContain("confirmPayment");
    expect(screen.getByText("Your reservation expired")).toBeInTheDocument();
  });
});
