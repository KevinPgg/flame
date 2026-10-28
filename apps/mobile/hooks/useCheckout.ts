import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  calculateFee,
  findFirstAvailableStage,
  isFreePrice,
  DEFAULT_PLATFORM_FEE_PERCENT,
  DEFAULT_FIXED_FEE_CENTS,
  normalizeTicketTierSecretCode,
} from "@project-flame/lib";
import type { FeeCalculation } from "@project-flame/lib";
import type { TicketTierWithStatus, EventDetail } from "./useEventDetails";
import { apiPost, apiGet, apiGetPublic, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckoutStep =
  | "idle"
  | "creating_hold"
  | "creating_payment_intent"
  | "presenting_sheet"
  | "submitting_rsvp"
  | "completing_free"
  | "success"
  | "error";

const holdResponseSchema = z.object({
  hold_session_id: z.string(),
  expires_at: z.string(),
  ticket_tier: z.object({
    id: z.string(),
    name: z.string(),
    price_cents: z.number(),
  }),
  quantity: z.number(),
  stage_name: z.string().nullable(),
  stage_price_cents: z.number().nullable(),
  promoter_code: z.string().nullable(),
});

const paymentIntentResponseSchema = z.object({
  clientSecret: z.string().nullable(),
  paymentIntentId: z.string(),
  amounts: z.object({
    base: z.number(),
    fee: z.number(),
    total: z.number(),
    discount: z.number(),
    currency: z.string(),
  }),
  promotionalCodeId: z.string().optional(),
  promoCode: z.string().optional(),
  promoterCode: z.string().optional(),
  connectedAccountId: z.string().optional(),
});

const promoValidationValidSchema = z.object({
  valid: z.literal(true),
  promotional_code: z.object({
    id: z.string(),
    code: z.string(),
    discount_percentage: z.number(),
    usage_remaining: z.number(),
  }),
  discount_amount_cents: z.number(),
  final_total_cents: z.number(),
});

const promoValidationInvalidSchema = z.object({
  valid: z.literal(false),
  error: z.string().optional(),
  promotional_code: z
    .object({
      id: z.string(),
      code: z.string(),
      discount_percentage: z.number(),
      usage_remaining: z.number(),
    })
    .nullable()
    .optional(),
  discount_amount_cents: z.number().optional(),
  final_total_cents: z.number().optional(),
});

const promoValidationResponseSchema = z.discriminatedUnion("valid", [
  promoValidationValidSchema,
  promoValidationInvalidSchema,
]);

const freeCheckoutResponseSchema = z.object({
  success: z.boolean(),
  order_id: z.string(),
});

export interface RsvpResponse {
  rsvp: {
    id: string;
    status: string;
  };
}

const rsvpResponseSchema = z.object({
  rsvp: z.object({
    id: z.string(),
    status: z.string(),
  }),
});

type HoldResponse = z.infer<typeof holdResponseSchema>;
type PaymentIntentResponse = z.infer<typeof paymentIntentResponseSchema>;
type PromoValidationResponse = z.infer<typeof promoValidationResponseSchema>;

export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  rsvpId?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Stripe helpers — dynamically required to avoid crash in Expo Go
// ---------------------------------------------------------------------------

async function getStripeFunctions() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const stripe = require("@stripe/stripe-react-native");
    return {
      initPaymentSheet: stripe.initPaymentSheet as (params: {
        paymentIntentClientSecret: string;
        merchantDisplayName: string;
        returnURL?: string;
        style?: "alwaysDark" | "alwaysLight" | "automatic";
        applePay?: { merchantCountryCode: string };
        allowsDelayedPaymentMethods?: boolean;
        link?: { display: "automatic" | "never" };
      }) => Promise<{ error?: { message: string } }>,
      presentPaymentSheet: stripe.presentPaymentSheet as () => Promise<{
        error?: { message: string; code?: string };
      }>,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * "error" (B2, fase 3.1) = the check itself failed (network / server): shown with Retry and it
 * does not block paying; "validating" does block the pay button so a fast tap can't drop it.
 */
export type PromoterValidationStatus = "idle" | "validating" | "valid" | "invalid" | "error";

interface UseCheckoutOptions {
  event: EventDetail | undefined;
  tier: TicketTierWithStatus | undefined;
  quantity: number;
  isRsvp: boolean;
  promoterCode?: string;
  apiPost?: typeof apiPost;
  apiGet?: typeof apiGet;
  apiGetPublic?: typeof apiGetPublic;
  getStripeFunctions?: typeof getStripeFunctions;
}

export function useCheckout({
  event,
  tier,
  quantity,
  isRsvp,
  promoterCode: initialPromoterCode,
  apiPost: injectedApiPost = apiPost,
  apiGet: injectedApiGet = apiGet,
  apiGetPublic: injectedApiGetPublic = apiGetPublic,
  getStripeFunctions: injectedGetStripeFunctions = getStripeFunctions,
}: UseCheckoutOptions) {
  const { getToken, isSignedIn, userId } = useOptionalAuth();
  const queryClient = useQueryClient();

  // --- State ---
  const [step, setStep] = useState<CheckoutStep>("idle");
  const stepInProgressRef = useRef<CheckoutStep>("idle");
  // Tracks the hold session ID so it can be cancelled on cancellation / error.
  // Only set during the direct-purchase flow; null for RSVP flows (no hold).
  const activeHoldIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [promoValidation, setPromoValidation] =
    useState<PromoValidationResponse | null>(null);
  const [serverAmounts, setServerAmounts] = useState<
    PaymentIntentResponse["amounts"] | null
  >(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [secretCode, setSecretCodeState] = useState("");
  const setSecretCode = useCallback((s: string) => {
    setSecretCodeState(normalizeTicketTierSecretCode(s));
  }, []);
  const [registrationData, setRegistrationData] = useState<Record<string, unknown> | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Live: tracks the active RSVP PaymentIntent across retries so we can reuse
  // it (oldPaymentIntentId) instead of creating a new PI on each attempt —
  // prevents double-authorization on paid-RSVP retry.
  const activeRsvpPiRef = useRef<string | null>(null);

  // --- Promoter code state (attribution tracking, separate from promo/discount codes) ---
  const [promoterCode, setPromoterCode] = useState(initialPromoterCode ?? "");
  const [promoterStatus, setPromoterStatus] = useState<PromoterValidationStatus>(
    initialPromoterCode ? "validating" : "idle"
  );

  // Sync promoter state when initialPromoterCode changes (e.g. route/deep link change)
  const hasAutoValidatedRef = useRef(false);
  const validationIdRef = useRef(0);
  useEffect(() => {
    validationIdRef.current += 1;
    setPromoterCode(initialPromoterCode ?? "");
    setPromoterStatus(initialPromoterCode ? "validating" : "idle");
    hasAutoValidatedRef.current = false;
  }, [initialPromoterCode]);

  const validatePromoter = useCallback(
    async (code: string) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed || trimmed.length < 3 || !event) {
        setPromoterStatus(trimmed ? "invalid" : "idle");
        return;
      }
      validationIdRef.current += 1;
      const token = validationIdRef.current;
      setPromoterStatus("validating");
      try {
        // B10 (fase 3.1): the server's rule (/api/promoter-validate), not a direct Supabase read
        // (that needs promoter_links open to anon — B11, closed at release).
        const data = await injectedApiGetPublic<{ valid?: boolean }>(
          `/api/promoter-validate?event_id=${encodeURIComponent(event.id)}&code=${encodeURIComponent(trimmed)}`,
        );
        if (token !== validationIdRef.current) return;
        if (typeof data?.valid !== "boolean") {
          setPromoterStatus("error");
          return;
        }
        if (data.valid) {
          setPromoterCode(trimmed);
          setPromoterStatus("valid");
        } else {
          setPromoterStatus("invalid");
        }
      } catch (err) {
        if (token !== validationIdRef.current) return;
        console.error("[useCheckout] promoter validation failed:", err);
        // B2: a failed check is not an invalid code — say so and let them retry.
        setPromoterStatus("error");
      }
    },
    [event, injectedApiGetPublic],
  );

  const clearPromoter = useCallback(() => {
    setPromoterCode("");
    setPromoterStatus("idle");
  }, []);

  // Auto-validate when initialPromoterCode is provided from deep link
  useEffect(() => {
    if (initialPromoterCode && event && !hasAutoValidatedRef.current) {
      hasAutoValidatedRef.current = true;
      validatePromoter(initialPromoterCode);
    }
  }, [initialPromoterCode, event, validatePromoter]);

  // W0-Q5: refresh My Tickets after a successful purchase/RSVP. The
  // ["user-tickets", userId] query has a 5m staleTime and dashboard mounts
  // from cache, so without invalidation the new ticket is missing until
  // pull-to-refresh. Prefix-match covers the userId suffix. Mirrors the
  // invalidation pattern in useRsvpManagement.ts.
  useEffect(() => {
    if (step === "success") {
      queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
    }
  }, [step, queryClient]);

  // --- Estimated amounts (client-side, for display before PaymentIntent) ---
  const estimates = useMemo(() => {
    if (!tier) return { subtotal: 0, fee: 0, total: 0, discount: 0 };

    const unitPrice = tier.displayPrice;
    const subtotal = unitPrice * quantity;

    // Apply promo discount if validated
    let discount = 0;
    if (promoValidation?.valid && promoValidation.promotional_code) {
      discount = Math.round((subtotal * promoValidation.promotional_code.discount_percentage) / 100);
    }
    const afterDiscount = Math.max(0, subtotal - discount);

    // Pre-PaymentIntent estimate must use this event's markup (events.markup_percent /
    // events.markup_fixed_cents) — NOT the system defaults — or the sheet diverges
    // from what create-payment-intent will authorize via getEventMarkup() and what
    // gets stored in rsvps.total_amount_cents. Falling back to defaults is only safe
    // when the RPC didn't include the columns (older clients / unmigrated rows).
    const feePercent = event?.markup_percent ?? DEFAULT_PLATFORM_FEE_PERCENT;
    const feeFixedCents = event?.markup_fixed_cents ?? DEFAULT_FIXED_FEE_CENTS;
    let feeCalc: FeeCalculation | null = null;
    try {
      if (afterDiscount > 0) {
        feeCalc = calculateFee(afterDiscount, feePercent, feeFixedCents);
      }
    } catch (calcErr) {
      if (__DEV__)
        console.warn("[useCheckout] Fee calculation error:", calcErr);
    }

    const fee = feeCalc?.platformFeeCents ?? 0;
    const total = afterDiscount + fee;

    return { subtotal, fee, total, discount };
  }, [tier, quantity, promoValidation, event?.markup_percent, event?.markup_fixed_cents]);

  const isFree = useMemo(() => {
    if (serverAmounts) return serverAmounts.total === 0;
    return isFreePrice(estimates.total);
  }, [estimates.total, serverAmounts]);

  // Use server amounts when available, otherwise client estimates
  const displayAmounts = useMemo(
    () =>
      serverAmounts
        ? {
            subtotal: serverAmounts.base,
            fee: serverAmounts.fee,
            total: serverAmounts.total,
            discount: serverAmounts.discount,
          }
        : estimates,
    [serverAmounts, estimates],
  );

  const isProcessing =
    step !== "idle" && step !== "success" && step !== "error";

  // --- Actions ---

  const resetCheckout = useCallback(() => {
    // Cancel any live direct-purchase hold so inventory is released immediately
    // when the user navigates away — mirrors the Canceled / error paths.
    const holdToCancel = activeHoldIdRef.current;
    stepInProgressRef.current = "idle";
    activeHoldIdRef.current = null;
    if (holdToCancel) {
      injectedApiPost<unknown>(
        "/api/holds/cancel",
        { holdSessionId: holdToCancel },
        getToken,
      ).catch((cancelErr: unknown) => {
        console.error("[useCheckout] hold cancel failed on reset", {
          action: "hold_cancel",
          userId: userId ?? null,
          eventId: event?.id,
          holdSessionId: holdToCancel,
          cancelErr,
        });
      });
    }
    setStep("idle");
    setError(null);
    setErrorCode(null);
    setPromoCode("");
    setPromoValidation(null);
    setServerAmounts(null);
    setResult(null);
    setSecretCode("");
    setRegistrationData(null);
    activeRsvpPiRef.current = null;
    // Preserve promoter code from deep link across resets; only clear manual entries
    if (!initialPromoterCode) {
      setPromoterCode("");
      setPromoterStatus("idle");
    }
  }, [injectedApiPost, getToken, userId, event, initialPromoterCode]);

  /**
   * Soft reset: cancels any active hold and clears step/error/result state,
   * but deliberately preserves promo and promoter codes so pre-applied codes
   * survive opening the checkout sheet.
   */
  const resetStep = useCallback(() => {
    const holdToCancel = activeHoldIdRef.current;
    stepInProgressRef.current = "idle";
    activeHoldIdRef.current = null;
    if (holdToCancel) {
      injectedApiPost<unknown>(
        "/api/holds/cancel",
        { holdSessionId: holdToCancel },
        getToken,
      ).catch((cancelErr: unknown) => {
        console.error("[useCheckout] hold cancel failed on resetStep", {
          action: "hold_cancel",
          userId: userId ?? null,
          eventId: event?.id,
          holdSessionId: holdToCancel,
          cancelErr,
        });
      });
    }
    setStep("idle");
    setError(null);
    setErrorCode(null);
    setServerAmounts(null);
    setResult(null);
    activeRsvpPiRef.current = null;
    // Intentionally do NOT reset: promoCode, promoValidation, promoterCode,
    // promoterStatus, secretCode, registrationData — these survive sheet re-opens.
  }, [injectedApiPost, getToken, userId, event]);

  /**
   * Validate a promo code against the web API.
   */
  const validatePromo = useCallback(
    async (code: string) => {
      if (!code.trim() || !event || !tier) return;

      setError(null);
      setIsValidatingPromo(true);

      try {
        const unitPrice = tier.displayPrice;
        const subtotal = unitPrice * quantity;

        const raw = await injectedApiPost<unknown>(
          "/api/purchase/validate-promo-code",
          {
            code: code.trim(),
            event_id: event.id,
            subtotal_cents: subtotal,
          },
          getToken,
        );
        const response = promoValidationResponseSchema.parse(raw);

        if (response.valid) {
          setPromoValidation(response);
          setPromoCode(code.trim());
          setServerAmounts(null);
        } else {
          setError(response.error ?? "Discount code is not valid");
          setPromoValidation(null);
          setPromoCode("");
          setServerAmounts(null);
        }
      } catch (err: unknown) {
        const apiErr = err as { message?: string; status?: number };
        console.error("[useCheckout] validatePromo failed", {
          action: "validatePromo",
          userId: userId ?? null,
          eventId: event.id,
          code: code.trim(),
          err,
        });
        // Client-side validation rejection (4xx): clear the code so the user re-enters
        const isClientError =
          typeof apiErr?.status === "number" &&
          apiErr.status >= 400 &&
          apiErr.status < 500;
        if (isClientError) {
          setError(apiErr?.message || "Invalid discount code");
          setPromoValidation(null);
          setPromoCode("");
          setServerAmounts(null);
        } else {
          // Network or server error: preserve user-entered code so they can retry
          setError(apiErr?.message || "Something went wrong. Please try again.");
          setPromoValidation(null);
          // Do NOT call setPromoCode("") — keep the user's input intact
        }
      } finally {
        setIsValidatingPromo(false);
      }
    },
    [event, tier, quantity, getToken, userId, injectedApiPost],
  );

  const clearPromo = useCallback(() => {
    setPromoCode("");
    setPromoValidation(null);
    setServerAmounts(null);
    setError(null);
  }, []);

  /**
   * Execute the full checkout flow.
   *
   * Direct purchase: hold → PI → PaymentSheet → success
   * RSVP free:       submit RSVP → success
   * RSVP paid:       PI (manual capture) → PaymentSheet → submit RSVP → success
   * Free (promo):    hold → PI → complete-hold-free → success
   */
  const checkout = useCallback(async () => {
    if (!event || !tier || !isSignedIn) return;
    // B2 (fase 3.1): never create the hold / RSVP while the promoter code is still being checked.
    if (promoterStatus === "validating") return;

    // Prevent double-submissions before React state batch flushes
    if (
      stepInProgressRef.current !== "idle" &&
      stepInProgressRef.current !== "success" &&
      stepInProgressRef.current !== "error"
    ) {
      return;
    }

    setError(null);
    setErrorCode(null);
    setResult(null);

    try {
      const effectiveSecretCode = normalizeTicketTierSecretCode(secretCode);

      // For stage-expanded entries, tier.id is a synthetic composite key.
      // Use the real DB tier ID (tierId) for all API payloads.
      const realTierId = tier.tierId ?? tier.id;

      // Only include promoter_code when successfully validated
      const checkoutPromoter =
        promoterStatus === "valid" && promoterCode.trim()
          ? promoterCode.trim().toUpperCase()
          : undefined;

      // --- RSVP Free Flow (no payment needed) ---
      const stageId = getStageId(tier);
      if (isRsvp && isFreePrice(tier.displayPrice * quantity)) {
        stepInProgressRef.current = "submitting_rsvp";
        setStep("submitting_rsvp");
        const rawRsvp = await injectedApiPost<unknown>(
          "/api/rsvp",
          {
            event_id: event.id,
            ticket_tier_id: realTierId,
            quantity,
            ...(stageId !== undefined ? { stage_id: stageId } : {}),
            ...(effectiveSecretCode ? { secret_code: effectiveSecretCode } : {}),
            ...(registrationData ? { registration_data: registrationData } : {}),
            ...(checkoutPromoter ? { promoter_code: checkoutPromoter } : {}),
          },
          getToken,
        );
        const rsvpResponse = rsvpResponseSchema.parse(rawRsvp);
        stepInProgressRef.current = "success";
        setStep("success");
        setResult({
          success: true,
          rsvpId: rsvpResponse.rsvp.id,
          message: "RSVP submitted! Awaiting approval.",
        });
        return;
      }

      // --- RSVP Paid Flow ---
      if (isRsvp) {
        // Step 1: Create PaymentIntent with manual capture
        stepInProgressRef.current = "creating_payment_intent";
        setStep("creating_payment_intent");
        const piRaw = await injectedApiPost<unknown>(
          "/api/purchase/create-payment-intent",
          {
            flow: "rsvp",
            eventId: event.id,
            ticketTierId: realTierId,
            quantity,
            ...(stageId !== undefined ? { stageId } : {}),
            ...(promoCode ? { promoCode } : {}),
            ...(checkoutPromoter ? { promoterCode: checkoutPromoter } : {}),
            ...(activeRsvpPiRef.current ? { oldPaymentIntentId: activeRsvpPiRef.current } : {}),
          },
          getToken,
        );
        const piResponse = paymentIntentResponseSchema.parse(piRaw);
        activeRsvpPiRef.current = piResponse.paymentIntentId;

        setServerAmounts(piResponse.amounts);

        // Free via promo code (100% discount)
        if (!piResponse.clientSecret) {
          stepInProgressRef.current = "submitting_rsvp";
          setStep("submitting_rsvp");
          const rawRsvp = await injectedApiPost<unknown>(
            "/api/rsvp",
            {
              event_id: event.id,
              ticket_tier_id: realTierId,
              quantity,
              paymentIntentId: piResponse.paymentIntentId,
              ...(stageId !== undefined ? { stage_id: stageId } : {}),
              ...(effectiveSecretCode ? { secret_code: effectiveSecretCode } : {}),
              ...(registrationData ? { registration_data: registrationData } : {}),
              ...(piResponse.promotionalCodeId
                ? { promotional_code_id: piResponse.promotionalCodeId }
                : {}),
              ...(checkoutPromoter ? { promoter_code: checkoutPromoter } : {}),
            },
            getToken,
          );
          const rsvpResponse = rsvpResponseSchema.parse(rawRsvp);
          activeRsvpPiRef.current = null;
          stepInProgressRef.current = "success";
          setStep("success");
          setResult({
            success: true,
            rsvpId: rsvpResponse.rsvp.id,
            message: "RSVP submitted! Awaiting approval.",
          });
          return;
        }

        // Step 2: Present PaymentSheet (authorizes but doesn't charge)
        const stripe = await injectedGetStripeFunctions();
        if (!stripe) {
          throw new Error(
            "Stripe is not available. Please use a development build for payments.",
          );
        }

        stepInProgressRef.current = "presenting_sheet";
        setStep("presenting_sheet");
        const { error: initError } = await stripe.initPaymentSheet({
          paymentIntentClientSecret: piResponse.clientSecret,
          merchantDisplayName: "Flame",
          returnURL: "project-flame://stripe-redirect",
          style: "alwaysDark",
          applePay: { merchantCountryCode: "US" },
          allowsDelayedPaymentMethods: false,
          link: { display: "never" },
        });
        if (initError) throw new Error(initError.message);

        const { error: presentError } = await stripe.presentPaymentSheet();
        if (presentError) {
          if (presentError.code === "Canceled") {
            setServerAmounts(null);
            stepInProgressRef.current = "idle";
            setStep("idle");
            return;
          }
          throw new Error(presentError.message);
        }

        // Step 3: Submit RSVP with payment intent
        stepInProgressRef.current = "submitting_rsvp";
        setStep("submitting_rsvp");
        const rawRsvp = await injectedApiPost<unknown>(
          "/api/rsvp",
          {
            event_id: event.id,
            ticket_tier_id: realTierId,
            quantity,
            paymentIntentId: piResponse.paymentIntentId,
            ...(stageId !== undefined ? { stage_id: stageId } : {}),
            ...(effectiveSecretCode ? { secret_code: effectiveSecretCode } : {}),
            ...(registrationData ? { registration_data: registrationData } : {}),
            ...(piResponse.promotionalCodeId
              ? { promotional_code_id: piResponse.promotionalCodeId }
              : {}),
            ...(checkoutPromoter ? { promoter_code: checkoutPromoter } : {}),
          },
          getToken,
        );
        const rsvpResponse = rsvpResponseSchema.parse(rawRsvp);

        activeRsvpPiRef.current = null;
        stepInProgressRef.current = "success";
        setStep("success");
        setResult({
          success: true,
          rsvpId: rsvpResponse.rsvp.id,
          message: "RSVP submitted! Awaiting approval.",
        });
        return;
      }

      // --- Direct Purchase Flow ---

      // Step 1: Create hold
      stepInProgressRef.current = "creating_hold";
      setStep("creating_hold");
      const holdRaw = await injectedApiPost<unknown>(
        "/api/holds/create",
        {
          event_id: event.id,
          ticket_tier_id: realTierId,
          quantity,
          ...(stageId !== undefined ? { stage_id: stageId } : {}),
          ...(effectiveSecretCode ? { secret_code: effectiveSecretCode } : {}),
          ...(checkoutPromoter ? { promoter_code: checkoutPromoter } : {}),
        },
        getToken,
      );
      const holdResponse = holdResponseSchema.parse(holdRaw);
      activeHoldIdRef.current = holdResponse.hold_session_id;

      // Early free-ticket exit — mirrors web EventDetail.tsx which checks
      // hold response price before redirecting to purchase page.
      const holdPrice =
        holdResponse.stage_price_cents ?? holdResponse.ticket_tier.price_cents ?? 0;
      if (holdPrice === 0 && !promoCode) {
        stepInProgressRef.current = "completing_free";
        setStep("completing_free");
        const freeRaw = await injectedApiPost<unknown>(
          "/api/purchase/complete-hold-free",
          {
            holdSessionId: holdResponse.hold_session_id,
            ...(checkoutPromoter ? { promoter_code: checkoutPromoter } : {}),
          },
          getToken,
        );
        const freeResponse = freeCheckoutResponseSchema.parse(freeRaw);
        activeHoldIdRef.current = null;
        stepInProgressRef.current = "success";
        setStep("success");
        setResult({
          success: true,
          orderId: freeResponse.order_id,
          message: "Tickets claimed successfully!",
        });
        return;
      }

      // Step 2: Create PaymentIntent
      stepInProgressRef.current = "creating_payment_intent";
      setStep("creating_payment_intent");
      const piRawDirect = await injectedApiPost<unknown>(
        "/api/purchase/create-payment-intent",
        {
          holdId: holdResponse.hold_session_id,
          ...(promoCode ? { promoCode } : {}),
        },
        getToken,
      );
      const piResponse = paymentIntentResponseSchema.parse(piRawDirect);

      setServerAmounts(piResponse.amounts);

      // Free via promo code (100% discount)
      if (!piResponse.clientSecret) {
        stepInProgressRef.current = "completing_free";
        setStep("completing_free");
        const freeRaw = await injectedApiPost<unknown>(
          "/api/purchase/complete-hold-free",
          {
            holdSessionId: holdResponse.hold_session_id,
            ...(piResponse.promotionalCodeId
              ? { promotional_code_id: piResponse.promotionalCodeId }
              : {}),
            ...((piResponse.promoterCode ?? checkoutPromoter)
              ? { promoter_code: piResponse.promoterCode ?? checkoutPromoter }
              : {}),
          },
          getToken,
        );
        const freeResponse = freeCheckoutResponseSchema.parse(freeRaw);

        activeHoldIdRef.current = null;
        stepInProgressRef.current = "success";
        setStep("success");
        setResult({
          success: true,
          orderId: freeResponse.order_id,
          message: "Tickets claimed successfully!",
        });
        return;
      }

      // Step 3: Validate hold before presenting PaymentSheet
      // Mirrors web StripePaymentForm.tsx — prevents paying for an expired hold
      try {
        await injectedApiGet<unknown>(
          `/api/holds/validate?session=${encodeURIComponent(holdResponse.hold_session_id)}`,
          getToken,
        );
      } catch (validateErr) {
        // Only cancel when error explicitly indicates expired/invalid hold (404, 410, 400).
        // For network/5xx/401 errors, rethrow without cancelling so the hold remains retryable.
        const isHoldExpiredOrInvalid =
          validateErr instanceof ApiError &&
          (validateErr.status === 404 ||
            validateErr.status === 410 ||
            validateErr.status === 400);

        if (isHoldExpiredOrInvalid) {
          const holdToCancel = activeHoldIdRef.current;
          if (holdToCancel) {
            try {
              await injectedApiPost<unknown>(
                "/api/holds/cancel",
                { holdSessionId: holdToCancel },
                getToken,
              );
            } catch (cancelErr) {
              console.error("[useCheckout] hold cancel failed after validate error", {
                action: "hold_cancel",
                userId: userId ?? null,
                eventId: event?.id,
                holdSessionId: holdToCancel,
                validateErr: validateErr instanceof Error ? validateErr.message : String(validateErr),
                cancelErr,
              });
            }
            activeHoldIdRef.current = null;
          }
        }

        throw new Error(
          validateErr instanceof Error
            ? validateErr.message
            : "Your reservation has expired. Please restart checkout.",
        );
      }

      const stripe = await injectedGetStripeFunctions();
      if (!stripe) {
        throw new Error(
          "Stripe is not available. Please use a development build for payments.",
        );
      }

      // B3 (fase 3.1): mark the hold "payment in progress" (+10 min, cleanup grace) before the
      // PaymentSheet opens, so it can't expire and be deleted while Stripe processes the payment.
      // If it fails nothing was charged; the catch below releases the hold as for any error.
      await injectedApiPost<unknown>(
        "/api/holds/start-payment",
        { hold_id: holdResponse.hold_session_id, payment_intent_id: piResponse.paymentIntentId },
        getToken,
      );

      stepInProgressRef.current = "presenting_sheet";
      setStep("presenting_sheet");
      const { error: initError } = await stripe.initPaymentSheet({
        paymentIntentClientSecret: piResponse.clientSecret,
        merchantDisplayName: "Flame",
        returnURL: "project-flame://stripe-redirect",
        style: "alwaysDark",
        applePay: { merchantCountryCode: "US" },
        allowsDelayedPaymentMethods: false,
        link: { display: "never" },
      });
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await stripe.presentPaymentSheet();
      if (presentError) {
        if (presentError.code === "Canceled") {
          // Cancel the hold so inventory is released immediately.
          // Mirrors web's handleCancelPurchase → POST /api/holds/cancel.
          const holdToCancel = activeHoldIdRef.current;
          activeHoldIdRef.current = null;
          if (holdToCancel) {
            injectedApiPost<unknown>(
              "/api/holds/cancel",
              { holdSessionId: holdToCancel },
              getToken,
            ).catch((err: unknown) => {
              console.error("[useCheckout] hold cancel failed on PaymentSheet dismiss", {
                action: "hold_cancel",
                userId: userId ?? null,
                eventId: event.id,
                holdSessionId: holdToCancel,
                err,
              });
            });
          }
          setServerAmounts(null);
          stepInProgressRef.current = "idle";
          setStep("idle");
          return;
        }
        throw new Error(presentError.message);
      }

      // Payment succeeded — webhook will create the order server-side.
      // Hold is now "committed" to Stripe; clear ref without cancelling.
      activeHoldIdRef.current = null;
      stepInProgressRef.current = "success";
      setStep("success");
      setResult({
        success: true,
        message:
          "Payment successful! Your tickets are being prepared. Once ready you will find them in your tickets section.",
      });
    } catch (err: unknown) {
      const phase = stepInProgressRef.current;
      const holdToCancel = activeHoldIdRef.current;

      const code = err instanceof ApiError ? err.code ?? null : null;

      // W4-C3 (Jun 2026): Server can still reject hidden-tier purchases with
      // MISSING/INVALID_SECRET_CODE if the access-code state got out of sync
      // (e.g. tier-switch effect wiped secretCode while accessCodeStatus stayed
      // "valid"). Pre-W4-C3 this re-opened TicketAccessCodeModal, but that
      // modal is gone — now we clear the stale code, set an inline error, and
      // let the user close the sheet to re-enter the code on the event page.
      const accessCodeRejected =
        (code === "MISSING_SECRET_CODE" || code === "INVALID_SECRET_CODE") &&
        (phase === "creating_hold" || phase === "submitting_rsvp");

      if (accessCodeRejected) {
        activeHoldIdRef.current = null;
        if (holdToCancel) {
          injectedApiPost<unknown>(
            "/api/holds/cancel",
            { holdSessionId: holdToCancel },
            getToken,
          ).catch((cancelErr: unknown) => {
            console.error("[useCheckout] hold cancel failed after access-code reject", {
              action: "hold_cancel",
              userId: userId ?? null,
              eventId: event?.id,
              holdSessionId: holdToCancel,
              cancelErr,
            });
          });
        }
        stepInProgressRef.current = "idle";
        setStep("idle");
        setErrorCode(code);
        setSecretCode("");
        setServerAmounts(null);
        setError(
          "Access code was rejected. Close this sheet and re-enter the access code on the event page.",
        );
        return;
      }

      const context = {
        userId: userId ?? null,
        eventId: event?.id,
        tierId: tier?.id,
        tierName: tier?.name,
        actionName: phase,
      };
      console.error("[useCheckout] Error:", { err, context });

      // Cancel any active hold so inventory is released immediately.
      // Only fires for direct-purchase flows; activeHoldIdRef is null for RSVP flows.
      activeHoldIdRef.current = null;
      if (holdToCancel) {
        injectedApiPost<unknown>(
          "/api/holds/cancel",
          { holdSessionId: holdToCancel },
          getToken,
        ).catch((cancelErr: unknown) => {
          console.error("[useCheckout] hold cancel failed on checkout error", {
            action: "hold_cancel",
            userId: userId ?? null,
            eventId: event?.id,
            holdSessionId: holdToCancel,
            cancelErr,
          });
        });
      }

      const errCode =
        err instanceof ApiError ? err.code ?? null : (err as { code?: string }).code ?? null;
      const errMessage =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.";
      stepInProgressRef.current = "error";
      setStep("error");
      setServerAmounts(null);
      setError(errMessage);
      setErrorCode(errCode);

      if (errCode === "INVALID_SECRET_CODE") {
        setSecretCode("");
      }
    }
  }, [
    event,
    tier,
    quantity,
    isRsvp,
    isSignedIn,
    userId,
    getToken,
    promoCode,
    secretCode,
    registrationData,
    promoterCode,
    promoterStatus,
    injectedApiPost,
    injectedApiGet,
    injectedGetStripeFunctions,
  ]);

  return {
    // State
    step,
    error,
    errorCode,
    isProcessing,
    isFree,
    result,

    // Secret code (access code)
    secretCode,
    setSecretCode,

    // Registration form data
    registrationData,
    setRegistrationData,

    // Promo
    promoCode,
    setPromoCode,
    promoValidation,
    isValidatingPromo,
    validatePromo,
    clearPromo,

    // Promoter (attribution tracking)
    promoterCode,
    setPromoterCode,
    promoterStatus,
    validatePromoter,
    clearPromoter,

    // Amounts
    displayAmounts,
    serverAmounts,

    // Actions
    checkout,
    resetCheckout,
    resetStep,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the current active stage ID from a tier.
 * For stage-expanded entries (tier.stageId is set), returns it directly.
 * Falls back to shared findFirstAvailableStage (waterfall logic) for non-expanded tiers.
 */
function getStageId(tier: TicketTierWithStatus): string | undefined {
  if (tier.stageId) return tier.stageId;
  return findFirstAvailableStage(tier).stageId;
}
