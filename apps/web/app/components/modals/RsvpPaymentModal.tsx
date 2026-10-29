"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Elements } from "@stripe/react-stripe-js";
import {
  FiX,
  FiCalendar,
  FiMapPin,
  FiCheckCircle,
  FiAlertCircle,
} from "react-icons/fi";
import { flameCheckoutElementsAppearance } from "../../lib/stripe/checkout-elements-appearance";
import { getStripe } from "../../lib/stripe/stripe-client";
import StripePaymentForm from "../StripePaymentForm";
import { formatCentsAsPrice } from "@project-flame/lib";
import type { RegistrationData } from "../EventDetail";

interface RsvpPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (
    paymentIntentId?: string,
    registrationData?: RegistrationData | null,
    secretCode?: string | null,
    promotionalCodeId?: string | null
  ) => void;
  eventId: string;
  eventName: string;
  eventDate: string;
  eventVenue: string;
  ticketTierId: string;
  ticketTierName: string;
  quantity: number;
  stageId?: string | null;
  stageName?: string | null;
  stagePrice?: number | null;
  tierPrice: number;
  currency?: string;
  registrationData?: RegistrationData | null;
  secretCode?: string | null;
  promoterCode?: string | null;
}

export default function RsvpPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  eventId,
  eventName,
  eventDate,
  eventVenue,
  ticketTierId,
  ticketTierName,
  quantity,
  stageId,
  stageName,
  stagePrice,
  tierPrice,
  currency = "usd",
  registrationData,
  secretCode,
  promoterCode,
}: RsvpPaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [promotionalCodeId, setPromotionalCodeId] = useState<string | null>(null);
  // Store amounts from API to ensure displayed price matches what Stripe charges
  const [amounts, setAmounts] = useState<{
    base: number;
    fee: number;
    total: number;
    discount?: number;
    currency?: string;
  } | null>(null);

  // Promo Code State
  const [promoCode, setPromoCode] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);


  const stripePromise = useMemo(() => getStripe(), []);

  // Track if a request is in flight to prevent concurrent invocations
  const requestInFlightRef = useRef(false);
  // Track if we've successfully created a PaymentIntent for this modal session
  const paymentIntentCreatedRef = useRef(false);
  // AbortController ref for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track promo request ID to handle race conditions
  const promoRequestIdRef = useRef(0);

  // Track isOpen state in a ref to access inside async callbacks
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      // Invalidate any in-flight promo requests when modal closes
      promoRequestIdRef.current++;
    }
  }, [isOpen]);

  // Generate a unique idempotency key for this payment session
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Date.now().toString(36)
  );

  const createPaymentIntent = useCallback(async () => {
    // Guard: Prevent concurrent requests
    if (requestInFlightRef.current) {
      console.log("PaymentIntent creation already in flight, skipping...");
      return;
    }

    // Guard: Don't create another PaymentIntent if one already exists for this session
    if (paymentIntentCreatedRef.current) {
      console.log(
        "PaymentIntent already created for this session, skipping..."
      );
      return;
    }

    // Calculate effective price: use stagePrice if available, otherwise tierPrice
    const effectiveUnitPrice = stagePrice ?? tierPrice;
    const totalAmount = effectiveUnitPrice * quantity;

    // Defensive validation: Don't create a $0 PaymentIntent
    if (totalAmount <= 0) {
      setError(
        "This ticket is free and does not require payment authorization. Please close this modal and submit your RSVP directly."
      );
      return;
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      requestInFlightRef.current = true;
      setLoading(true);
      setError(null);

      const response = await fetch("/api/purchase/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          ticketTierId,
          quantity,
          flow: "rsvp",
          stageId,
          idempotencyKey: idempotencyKeyRef.current,
          promoterCode,
        }),
        signal: controller.signal,
      });

      // Check if modal was closed while fetching
      if (!isOpenRef.current) {
        console.log("Modal closed during fetch, ignoring result");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to initialize payment");
      }

      const data = await response.json();

      // Check again if modal was closed while parsing JSON
      if (!isOpenRef.current) {
        console.log("Modal closed during parsing, ignoring result");
        return;
      }

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      if (data.promotionalCodeId) {
        setPromotionalCodeId(data.promotionalCodeId);
      }
      // Store the actual amounts from API (includes platform fee)
      setAmounts(data.amounts);
      // Mark that we've successfully created a PaymentIntent
      paymentIntentCreatedRef.current = true;
    } catch (err: unknown) {
      // Ignore errors if modal is closed or request was aborted
      if (!isOpenRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;

      console.error("Error creating payment intent:", err);
      setError(
        err instanceof Error ? err.message : "Failed to initialize payment"
      );
      // Don't set paymentIntentCreatedRef on error - allow retry
    } finally {
      // Only clear request flag if this is the current controller (not superseded)
      if (abortControllerRef.current === controller) {
        requestInFlightRef.current = false;
        abortControllerRef.current = null;
      }

      // Only turn off loading if modal is still open (otherwise cleanup handled it)
      if (isOpenRef.current) {
        setLoading(false);
      }
    }
  }, [eventId, ticketTierId, quantity, stageId, stagePrice, tierPrice, promoterCode]);

  useEffect(() => {
    if (isOpen) {
      // Preserve PaymentIntent across modal open/close cycles to avoid orphaned PIs.
      if (!paymentIntentCreatedRef.current) {
        createPaymentIntent();
      }
    } else {
      // On close, abort any in-flight requests to avoid wasted network work
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      requestInFlightRef.current = false;
      // On close, preserve PI state but clear transient UI state
      setLoading(false);
      setError(null);
      // Reset promo state on close
      setPromoCode("");
      setPromoError(null);
      setIsApplyingPromo(false);
    }
  }, [isOpen, createPaymentIntent]);

  // Effect to reset state ONLY when key payment parameters change
  useEffect(() => {
    // Check if we have an in-flight request and abort it
    if (requestInFlightRef.current && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset state
    setClientSecret(null);
    setPaymentIntentId(null);
    setPromotionalCodeId(null);
    setAmounts(null);
    setError(null);
    setLoading(false);
    paymentIntentCreatedRef.current = false;
    requestInFlightRef.current = false;
    // Reset promo state
    setPromoCode("");
    setAppliedPromo(null);
    setPromoError(null);

    // Generate new idempotency key for new parameters
    idempotencyKeyRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);

    // If modal is open, we must recreate the PaymentIntent with new parameters
    if (isOpen) {
      createPaymentIntent();
    }
  }, [eventId, ticketTierId, quantity, stageId, stagePrice, tierPrice, createPaymentIntent]);

  const handleApplyPromoCode = async () => {
    if (!promoCode.trim()) return;

    setIsApplyingPromo(true);
    setPromoError(null);

    const requestId = ++promoRequestIdRef.current;

    try {
      const response = await fetch("/api/purchase/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          ticketTierId,
          quantity,
          flow: "rsvp",
          stageId,
          idempotencyKey: idempotencyKeyRef.current,
          promoterCode,
          promoCode: promoCode.trim(),
          oldPaymentIntentId: paymentIntentId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to apply discount code");
      }

      const {
        clientSecret: newClientSecret,
        paymentIntentId: newPaymentIntentId,
        amounts: newAmounts,
        promotionalCodeId: newPromotionalCodeId,
      } = await response.json();

      // Guard: Check if modal is still open and this is the latest request
      if (!isOpenRef.current || promoRequestIdRef.current !== requestId) return;

      if (newAmounts.total === 0) {
        setClientSecret(null);
        setPaymentIntentId(null);
      } else {
        setClientSecret(newClientSecret);
        setPaymentIntentId(newPaymentIntentId);
      }
      setAmounts(newAmounts);
      if (newPromotionalCodeId) {
        setPromotionalCodeId(newPromotionalCodeId);
      }
      setAppliedPromo(promoCode.trim());
      setPromoCode("");

    } catch (err) {
      // Guard: Check if modal is still open and this is the latest request
      if (!isOpenRef.current || promoRequestIdRef.current !== requestId) return;
      console.error("Error applying promo code:", err);
      setPromoError(err instanceof Error ? err.message : "Invalid discount code");
    } finally {
      if (isOpenRef.current && promoRequestIdRef.current === requestId) {
        setIsApplyingPromo(false);
      }
    }
  };

  const handleRemovePromoCode = async () => {
    setIsApplyingPromo(true);
    setPromoError(null);

    const requestId = ++promoRequestIdRef.current;

    try {
      const response = await fetch("/api/purchase/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          ticketTierId,
          quantity,
          flow: "rsvp",
          stageId,
          idempotencyKey: idempotencyKeyRef.current,
          promoterCode,
          oldPaymentIntentId: paymentIntentId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove discount code");
      }

      const {
        clientSecret: newClientSecret,
        paymentIntentId: newPaymentIntentId,
        amounts: newAmounts,
      } = await response.json();

      // Guard: Check if modal is still open and this is the latest request
      if (!isOpenRef.current || promoRequestIdRef.current !== requestId) return;

      if (newAmounts.total === 0) {
        setClientSecret(null);
        setPaymentIntentId(null);
      } else {
        setClientSecret(newClientSecret);
        setPaymentIntentId(newPaymentIntentId);
      }
      setAmounts(newAmounts);
      setPromotionalCodeId(null);
      setAppliedPromo(null);
      setPromoCode("");

    } catch (err) {
      // Guard: Check if modal is still open and this is the latest request
      if (!isOpenRef.current || promoRequestIdRef.current !== requestId) return;
      console.error("Error removing promo code:", err);
      setPromoError(err instanceof Error ? err.message : "Failed to remove discount code");
    } finally {
      if (isOpenRef.current && promoRequestIdRef.current === requestId) {
        setIsApplyingPromo(false);
      }
    }
  };

  const handlePaymentSuccess = (confirmedPaymentIntentId: string) => {
    if (!confirmedPaymentIntentId) {
      console.error("handlePaymentSuccess called without confirmedPaymentIntentId - halting flow");
      setError("Payment processing error: Missing payment identification. Please try again.");
      return;
    }

    const completedPaymentIntentId = confirmedPaymentIntentId;
    const completedPromotionalCodeId = promotionalCodeId;

    // Reset internal state so if the modal is opened again, we don't reuse the completed PI
    paymentIntentCreatedRef.current = false;
    setClientSecret(null);
    setPaymentIntentId(null);
    setPromotionalCodeId(null);
    setAmounts(null);
    setAppliedPromo(null);
    setPromoCode("");

    // Regenerate idempotency key
    idempotencyKeyRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);

    onSuccess(completedPaymentIntentId, registrationData, secretCode, completedPromotionalCodeId);
  };

  const handleRetry = () => {
    paymentIntentCreatedRef.current = false;
    createPaymentIntent();
  };

  const handleBeforePayment = async () => {
    if (typeof window === "undefined") return;
    if (!paymentIntentId) {
      throw new Error("Payment is not ready yet. Please try again.");
    }

    const response = await fetch("/api/rsvp/pending", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventId,
        ticketTierId,
        quantity,
        stageId,
        secretCode,
        promoterCode,
        registrationData,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to save RSVP details");
    }

    const data = await response.json();
    const pendingRsvpData = {
      pendingRsvpId: data.pendingRsvpId,
      paymentIntentId,
    };
    try {
      sessionStorage.setItem("pendingRsvpData", JSON.stringify(pendingRsvpData));
    } catch (err) {
      console.warn("Failed to save pendingRsvpData to sessionStorage (likely private browsing):", err);
    }
  };

  const handleFreeRsvp = async () => {
    try {
      setLoading(true);
      onSuccess(undefined, registrationData, secretCode, promotionalCodeId);
    } catch (err) {
      console.error("Error submitting free RSVP:", err);
      setError(err instanceof Error ? err.message : "Failed to submit RSVP");
      setLoading(false);
    }
  };

  const handlePaymentError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    requestInFlightRef.current = false;
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        requestInFlightRef.current = false;
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Use API amounts when available
  const localUnitPrice = stagePrice ?? tierPrice;
  const baseAmount = amounts?.base ?? localUnitPrice * quantity;
  const displayTotal = amounts?.total ?? baseAmount;
  const displayCurrency = amounts?.currency || currency;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4"
      onClick={handleClose}
    >
      <div
        className="bg-surface border border-white-20 rounded-t-[24px] sm:rounded-card w-full max-w-[600px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag indicator */}
        <div className="flex justify-center pt-4">
          <div className="w-10 h-1 rounded-full bg-white-20" />
        </div>

        {/* Header */}
        <div className="flex justify-between items-center px-6 pt-4 pb-2">
          <h2 className="text-white-100 text-lg font-poppins-semibold m-0">Order Summary</h2>
          <button
            className="text-white-100 bg-transparent border-none cursor-pointer p-1"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <FiX size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-10 flex flex-col gap-4">
          {/* Event name */}
          <p className="text-white-50 text-xs font-poppins-light uppercase m-0">
            {eventName}
          </p>

          {/* Ticket summary card */}
          <div className="bg-white-5 rounded-card p-4">
            <p className="text-white-100 text-sm font-poppins-medium m-0">
              {ticketTierName}
              {stageName && ` - ${stageName}`}
            </p>
            <p className="text-white-50 text-xs font-poppins-light m-0 mt-1">
              {quantity} x {formatCentsAsPrice(localUnitPrice, displayCurrency)}
            </p>
          </div>

          {/* Event details */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                <FiCalendar size={18} className="text-white-100" />
              </div>
              <span className="text-white-100 text-sm font-poppins-light">
                {new Date(eventDate).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                <FiMapPin size={18} className="text-white-100" />
              </div>
              <span className="text-white-100 text-sm font-poppins-light">{eventVenue}</span>
            </div>
          </div>

          {/* Access Code Section — W4-C3 (Jun 2026). Read-only "applied"
              indicator mirroring StripePurchaseFlow + the Promo/Promoter green
              blocks below. The code was entered + verified during the
              event-page unlock flow and is passed in via the `secretCode` prop
              (it survives the registration-form detour). This modal already
              forwards the code to the server but never displayed it — parity
              gap that made paid RSVP (incl. reg-form events) the only checkout
              surface missing the green state. No edit/clear here: to change the
              code, the buyer closes the modal and re-enters it on the event
              page's access-code input. */}
          {secretCode && (
            <div className="pt-4 border-t border-white-10">
              <p className="text-white-70 text-xs font-poppins-medium uppercase m-0 mb-3">
                Access Code
              </p>
              <div className="bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3 flex items-center gap-2">
                <FiCheckCircle size={16} className="text-[#5DDBB1]" />
                <span className="text-[#5DDBB1] text-sm font-poppins-medium">
                  {secretCode}
                </span>
              </div>
            </div>
          )}

          {/* Promo Code Section */}
          <div className="pt-4 border-t border-white-10">
            <p className="text-white-70 text-xs font-poppins-medium uppercase m-0 mb-3">Discount Code</p>
            {!appliedPromo ? (
              <div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter code"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      setPromoError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && promoCode.trim() && amounts) {
                        e.preventDefault();
                        handleApplyPromoCode();
                      }
                    }}
                    disabled={isApplyingPromo || !amounts}
                    className="flex-1 bg-white-5 border border-white-20 rounded-card px-4 py-3 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors"
                  />
                  <button
                    onClick={handleApplyPromoCode}
                    disabled={!promoCode.trim() || isApplyingPromo || !amounts}
                    className="bg-white-10 border border-white-20 rounded-card px-4 py-3 text-white-100 text-sm font-poppins-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors hover:bg-white-20"
                    type="button"
                  >
                    {isApplyingPromo ? (
                      <div className="animate-spin rounded-full w-4 h-4 border-2 border-white-20 border-t-white-100" />
                    ) : (
                      "Apply"
                    )}
                  </button>
                </div>
                {promoError && (
                  <div className="flex items-center gap-2 mt-2 text-error text-xs font-poppins">
                    <FiAlertCircle size={14} />
                    <span>{promoError}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FiCheckCircle size={16} className="text-[#5DDBB1]" />
                  <span className="text-[#5DDBB1] text-sm font-poppins-medium">{appliedPromo}</span>
                </div>
                <button
                  onClick={handleRemovePromoCode}
                  disabled={isApplyingPromo}
                  className="text-[#5DDBB1] bg-transparent border-none cursor-pointer p-1 disabled:opacity-40"
                  aria-label="Remove discount code"
                  type="button"
                >
                  {isApplyingPromo ? (
                    <div className="animate-spin rounded-full w-4 h-4 border-2 border-[#5DDBB1]/30 border-t-[#5DDBB1]" />
                  ) : (
                    <FiX size={18} />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Promoter — read-only (fase 3.4, 2026-10-28): it's chosen before this step (event page
              / RSVP sheet) and that value is what the RSVP and the PaymentIntent carry. The old
              field here started from the value at the modal's first mount (it showed "None" when
              the link's promoter was confirmed later) and a code typed here never reached the
              RSVP — same problem as B1 on /purchase. */}
          {promoterCode ? (
            <div className="pt-4 border-t border-white-10">
              <p className="text-white-70 text-xs font-poppins-medium uppercase m-0 mb-3">Promoter</p>
              <div className="bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3 flex items-center gap-2">
                <FiCheckCircle size={16} className="text-[#5DDBB1]" />
                <span className="text-[#5DDBB1] text-sm font-poppins-medium">{promoterCode}</span>
              </div>
            </div>
          ) : null}

          {/* Price Breakdown */}
          {amounts && (
            <div className="flex flex-col gap-3 pt-4 border-t border-white-10">
              <div className="flex justify-between items-center">
                <span className="text-white-50 text-sm font-poppins">Subtotal</span>
                <span className="text-white-100 text-sm font-poppins">
                  {formatCentsAsPrice(amounts.base, displayCurrency)}
                </span>
              </div>

              {amounts.discount != null && amounts.discount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[#5DDBB1] text-sm font-poppins">Discount</span>
                  <span className="text-[#5DDBB1] text-sm font-poppins">
                    -{formatCentsAsPrice(amounts.discount, displayCurrency)}
                  </span>
                </div>
              )}

              {amounts.fee > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-white-50 text-sm font-poppins">Service Fee</span>
                  <span className="text-white-100 text-sm font-poppins">
                    {formatCentsAsPrice(amounts.fee, displayCurrency)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center pt-3 border-t border-white-10">
            <span className="text-white-100 text-lg font-poppins-semibold">Total to Authorize</span>
            <span className="text-white-100 text-lg font-poppins-semibold">
              {formatCentsAsPrice(displayTotal, displayCurrency)}
            </span>
          </div>

          {/* Payment Authorization Notice */}
          <div className="bg-[rgba(234,51,112,0.1)] rounded-card px-4 py-3">
            <p className="text-white-80 text-xs font-poppins-light m-0 leading-5">
              <strong className="text-white-100 font-poppins-medium">Payment Authorization:</strong>{" "}
              Your payment method will be authorized but not charged yet. The charge will only be
              processed if your RSVP is approved by the organizer.
            </p>
          </div>

          {/* Loading */}
          {loading && !clientSecret && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="animate-spin rounded-full w-8 h-8 border-2 border-white-20 border-t-white-100" />
              <p className="text-white-70 text-sm font-poppins-light m-0">Preparing Payment...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-[rgba(234,51,112,0.1)] rounded-card px-4 py-3">
              <p className="text-error text-sm font-poppins m-0">{error}</p>
              {!error.includes("Missing payment identification") && (
                <button
                  onClick={handleRetry}
                  className="mt-3 bg-transparent border border-white-30 text-white-100 rounded-pill px-4 py-2 text-xs font-poppins-medium cursor-pointer"
                >
                  Try Again
                </button>
              )}
            </div>
          )}

          {/* Stripe Payment Form */}
          {clientSecret && stripePromise ? (
            <div className="flex flex-col gap-4">
              <Elements
                key={clientSecret}
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: flameCheckoutElementsAppearance,
                }}
              >
                <StripePaymentForm
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                  onBeforePayment={handleBeforePayment}
                  amount={displayTotal}
                  currency={displayCurrency}
                  isRsvp={true}
                />
              </Elements>

              {/* Cancel Button */}
              <button
                onClick={handleClose}
                className="bg-transparent border border-white-30 text-white-100 rounded-pill px-6 py-3 font-poppins-medium text-sm cursor-pointer w-full"
                type="button"
              >
                Cancel
              </button>
            </div>
          ) : amounts?.total === 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-white-50 text-sm font-poppins-light m-0">
                This ticket is free with your discount code. No payment is required.
              </p>
              <button
                onClick={handleFreeRsvp}
                disabled={loading}
                className="bg-white-100 text-dark rounded-pill px-6 py-4 font-poppins-semibold text-sm cursor-pointer border-none w-full disabled:opacity-50"
              >
                {loading ? "Processing..." : "Complete RSVP"}
              </button>

              <button
                onClick={handleClose}
                disabled={loading}
                className="bg-transparent border border-white-30 text-white-100 rounded-pill px-6 py-3 font-poppins-medium text-sm cursor-pointer w-full disabled:opacity-40"
                type="button"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
