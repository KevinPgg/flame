/**
 * Flame 2.0 payment screen, app (fase 3.3 — 3.2 merged into it, Kevin 2026-10-28). The hold is
 * created on the event screen ("Checkout"); this screen loads it and runs the SAME server calls
 * as the web payment page and the old checkout sheet:
 *  - GET  /api/holds/details           → the order + the reservation end (countdown, B7)
 *  - POST /api/purchase/create-payment-intent (re-created when a discount or a promoter is added)
 *  - GET  /api/promoter-validate       → a promoter typed here (B10), carried in the PaymentIntent
 *  - GET  /api/holds/validate + POST /api/holds/start-payment (B3) → PaymentSheet (Stripe)
 *  - POST /api/purchase/complete-hold-free for free tickets
 *  - POST /api/holds/cancel to release the tickets
 * The order is created by the Stripe webhook as always.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiGet, apiGetPublic, apiPost, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

const detailsSchema = z.object({
  mode: z.literal("hold"),
  event: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string().nullish(),
    starts_at: z.string(),
    venue: z.string().nullish(),
    city: z.string().nullish(),
    image_url: z.string().nullish(),
    timezone: z.string().nullish(),
    currency: z.string().nullish(),
  }),
  ticket_tier: z.object({ id: z.string(), name: z.string(), price_cents: z.number() }),
  quantity: z.number(),
  expires_at: z.string().nullish(),
  stage_id: z.string().nullish(),
  stage_name: z.string().nullish(),
  stage_price_cents: z.number().nullish(),
  promoter_code: z.string().nullish(),
  secret_code: z.string().nullish(),
});
export type HoldDetails = z.infer<typeof detailsSchema>;

const piSchema = z.object({
  clientSecret: z.string().nullable(),
  paymentIntentId: z.string(),
  amounts: z.object({ base: z.number(), fee: z.number(), total: z.number(), discount: z.number().optional(), currency: z.string().optional() }),
  promotionalCodeId: z.string().optional(),
});
type Pi = z.infer<typeof piSchema>;

export type PaymentStep = "loading" | "error" | "ready" | "paying" | "paid" | "claimed";
export type CodeStatus = "idle" | "validating" | "valid" | "invalid" | "error";

type StripeFns = {
  initPaymentSheet: (p: Record<string, unknown>) => Promise<{ error?: { message: string } }>;
  presentPaymentSheet: () => Promise<{ error?: { message: string; code?: string } }>;
};

async function defaultStripe(): Promise<StripeFns | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const s = require("@stripe/stripe-react-native");
    return { initPaymentSheet: s.initPaymentSheet, presentPaymentSheet: s.presentPaymentSheet };
  } catch {
    return null;
  }
}

export function usePaymentScreen(
  holdId: string,
  deps: { apiGet?: typeof apiGet; apiPost?: typeof apiPost; apiGetPublic?: typeof apiGetPublic; getStripe?: () => Promise<StripeFns | null> } = {},
) {
  const get = deps.apiGet ?? apiGet;
  const post = deps.apiPost ?? apiPost;
  const getPublic = deps.apiGetPublic ?? apiGetPublic;
  const getStripe = deps.getStripe ?? defaultStripe;
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<PaymentStep>("loading");
  const [error, setError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [details, setDetails] = useState<HoldDetails | null>(null);
  const [pi, setPi] = useState<Pi | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ applied: string | null; promotionalCodeId: string | null; busy: boolean; error: string | null }>({ applied: null, promotionalCodeId: null, busy: false, error: null });
  const [promoter, setPromoter] = useState<{ code: string; status: CodeStatus }>({ code: "", status: "idle" });
  const detailsRef = useRef<HoldDetails | null>(null);

  const unitCents = details ? details.stage_price_cents ?? details.ticket_tier.price_cents : 0;
  const baseCents = unitCents * (details?.quantity ?? 0);
  const isFree = !!details && (baseCents === 0 || (pi !== null && pi.clientSecret === null && pi.amounts.total === 0));
  const promoterCode = details?.promoter_code || (promoter.status === "valid" ? promoter.code : null);

  const createPi = useCallback(
    async (opts: { promoCode?: string | null; promoterCode?: string | null; old?: string | null }) => {
      const d = detailsRef.current;
      if (!d) throw new Error("No reservation");
      const raw = await post<unknown>(
        "/api/purchase/create-payment-intent",
        {
          eventId: d.event.id,
          ticketTierId: d.ticket_tier.id,
          quantity: d.quantity,
          flow: "hold",
          holdId,
          ...(d.stage_id ? { stageId: d.stage_id } : {}),
          ...(opts.promoterCode ? { promoterCode: opts.promoterCode } : {}),
          ...(opts.promoCode ? { promoCode: opts.promoCode } : {}),
          ...(opts.old ? { oldPaymentIntentId: opts.old } : {}),
        },
        getToken,
      );
      return piSchema.parse(raw);
    },
    [post, getToken, holdId],
  );

  const load = useCallback(async () => {
    setStep("loading");
    setError(null);
    try {
      const d = detailsSchema.parse(await get<unknown>(`/api/holds/details?session=${encodeURIComponent(holdId)}`, getToken));
      detailsRef.current = d;
      setDetails(d);
      setExpiresAt(d.expires_at ?? null);
      const unit = d.stage_price_cents ?? d.ticket_tier.price_cents;
      if (unit * d.quantity > 0) setPi(await createPi({ promoterCode: d.promoter_code }));
      setStep("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStep("error");
    }
  }, [get, getToken, holdId, createPi]);

  // Load once per reservation (getToken and friends are new functions on every render).
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void loadRef.current();
  }, [holdId]);

  const applyPromo = useCallback(
    async (code: string) => {
      const c = code.trim().toUpperCase();
      if (!c || !pi) return;
      setPromo((p) => ({ ...p, busy: true, error: null }));
      try {
        const next = await createPi({ promoCode: c, promoterCode, old: pi.paymentIntentId });
        setPi(next);
        setPromo({ applied: c, promotionalCodeId: next.promotionalCodeId ?? null, busy: false, error: null });
      } catch (e) {
        setPromo((p) => ({ ...p, busy: false, error: e instanceof Error ? e.message : "Invalid discount code" }));
      }
    },
    [pi, createPi, promoterCode],
  );

  const removePromo = useCallback(async () => {
    if (!pi) return;
    setPromo((p) => ({ ...p, busy: true, error: null }));
    try {
      setPi(await createPi({ promoterCode, old: pi.paymentIntentId }));
      setPromo({ applied: null, promotionalCodeId: null, busy: false, error: null });
    } catch (e) {
      setPromo((p) => ({ ...p, busy: false, error: e instanceof Error ? e.message : "Something went wrong" }));
    }
  }, [pi, createPi, promoterCode]);

  /** B10: a promoter typed here is checked by the server, then the PaymentIntent carries it. */
  const applyPromoter = useCallback(
    async (code: string) => {
      const c = code.trim().toUpperCase();
      const d = detailsRef.current;
      if (!d || c.length < 3) {
        setPromoter({ code: c, status: c ? "invalid" : "idle" });
        return;
      }
      setPromoter({ code: c, status: "validating" });
      try {
        const r = await getPublic<{ valid?: boolean }>(`/api/promoter-validate?event_id=${encodeURIComponent(d.event.id)}&code=${encodeURIComponent(c)}`);
        if (typeof r?.valid !== "boolean") return setPromoter({ code: c, status: "error" });
        if (!r.valid) return setPromoter({ code: c, status: "invalid" });
        if (pi) setPi(await createPi({ promoterCode: c, promoCode: promo.applied, old: pi.paymentIntentId }));
        setPromoter({ code: c, status: "valid" });
      } catch {
        setPromoter({ code: c, status: "error" });
      }
    },
    [getPublic, pi, createPi, promo.applied],
  );

  const pay = useCallback(async () => {
    if (!pi?.clientSecret || step !== "ready" || promoter.status === "validating") return;
    setPayError(null);
    setStep("paying");
    try {
      await get<unknown>(`/api/holds/validate?session=${encodeURIComponent(holdId)}`, getToken);
      // B3: mark the reservation "payment in progress" (+10 min) before Stripe takes over.
      const started = await post<{ expires_at?: string | null }>("/api/holds/start-payment", { hold_id: holdId, payment_intent_id: pi.paymentIntentId }, getToken);
      if (started?.expires_at) setExpiresAt(started.expires_at);
      const stripe = await getStripe();
      if (!stripe) throw new Error("Stripe is not available. Please use a development build for payments.");
      const init = await stripe.initPaymentSheet({
        paymentIntentClientSecret: pi.clientSecret,
        merchantDisplayName: "Flame",
        returnURL: "project-flame://stripe-redirect",
        style: "alwaysDark",
        applePay: { merchantCountryCode: "US" },
        allowsDelayedPaymentMethods: false,
        link: { display: "never" },
      });
      if (init.error) throw new Error(init.error.message);
      const res = await stripe.presentPaymentSheet();
      if (res.error) {
        // Closed the sheet: nothing charged, the reservation stays (the countdown keeps going).
        if (res.error.code === "Canceled") {
          setStep("ready");
          return;
        }
        throw new Error(res.error.message);
      }
      setStep("paid");
      void queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
    } catch (e) {
      setPayError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setStep("ready");
    }
  }, [pi, step, promoter.status, get, post, getToken, getStripe, holdId, queryClient]);

  const claimFree = useCallback(async () => {
    if (step !== "ready" || promoter.status === "validating") return;
    setPayError(null);
    setStep("paying");
    try {
      await post<unknown>(
        "/api/purchase/complete-hold-free",
        {
          holdSessionId: holdId,
          ...(promo.promotionalCodeId ? { promotional_code_id: promo.promotionalCodeId } : {}),
          ...(promoterCode ? { promoter_code: promoterCode } : {}),
        },
        getToken,
      );
      setStep("claimed");
      void queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setStep("ready");
    }
  }, [step, promoter.status, post, holdId, promo.promotionalCodeId, promoterCode, getToken, queryClient]);

  /** Release the tickets (back / cancel). Fire and forget: the reservation expires anyway. */
  const cancel = useCallback(() => {
    if (step === "paid" || step === "claimed" || step === "paying") return;
    post<unknown>("/api/holds/cancel", { holdSessionId: holdId }, getToken).catch(() => {});
  }, [step, post, holdId, getToken]);

  return {
    step,
    error,
    payError,
    details,
    amounts: pi?.amounts ?? null,
    baseCents,
    isFree,
    expiresAt,
    promo,
    promoter,
    promoterCode,
    reload: load,
    applyPromo,
    removePromo,
    applyPromoter,
    setPromoterInput: (v: string) => setPromoter((p) => ({ code: v, status: p.status === "validating" ? p.status : "idle" })),
    pay,
    claimFree,
    cancel,
  };
}
