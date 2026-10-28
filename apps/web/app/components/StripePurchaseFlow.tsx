"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { useSearchParams, useRouter } from "next/navigation";
import {
  FiCalendar,
  FiMapPin,
  FiUsers,
  FiCheckCircle,
  FiAlertCircle,
  FiX,
} from "react-icons/fi";
import Image from "next/image";
import { flameCheckoutElementsAppearance } from "../lib/stripe/checkout-elements-appearance";
import { getStripe } from "../lib/stripe/stripe-client";
import StripePaymentForm from "./StripePaymentForm";
import { formatCentsAsPrice } from "@project-flame/lib";

interface PurchaseDetails {
  mode: "hold" | "rsvp";
  event: {
    id: string;
    name: string;
    slug: string;
    starts_at: string;
    venue: string;
    city: string;
    image_url?: string;
  };
  ticket_tier: {
    id: string;
    name: string;
    price_cents: number;
  };
  quantity: number;
  stage_id?: string | null;
  stage_name?: string | null;
  stage_price_cents?: number | null;
  user: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  rsvp_id?: string;
  promoter_code?: string;
  // W4-C3 (Jun 2026): echoed back so checkout can show the green "Access
  // Code applied" indicator (parity with promo + promoter).
  secret_code?: string | null;
}

export default function StripePurchaseFlow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const holdSessionId = searchParams.get("session");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseDetails, setPurchaseDetails] =
    useState<PurchaseDetails | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isFreePurchase, setIsFreePurchase] = useState(false);
  // Local payment error state to keep errors inline within the form
  const [paymentError, setPaymentError] = useState<string | null>(null);
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
  const [promotionalCodeId, setPromotionalCodeId] = useState<string | null>(null);

  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stripePromise = useMemo(() => getStripe(), []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  // Track the active request to prevent race conditions
  const activeRequestRef = useRef<string | null>(null);

  const fetchPurchaseDetails = useCallback(async () => {
    // Generate a unique ID for this request
    const requestId = `${token || ""}-${holdSessionId || ""}-${Date.now()}`;
    activeRequestRef.current = requestId;

    try {
      setLoading(true);
      setError(null);

      // Fetch purchase details
      const detailsEndpoint = token
        ? `/api/rsvp/details?token=${encodeURIComponent(token)}`
        : `/api/holds/details?session=${encodeURIComponent(holdSessionId || "")}`;

      const detailsResponse = await fetch(detailsEndpoint, {
        cache: "no-store",
      });

      // Check if this request is still active
      if (activeRequestRef.current !== requestId) return;

      if (!detailsResponse.ok) {
        throw new Error("Failed to load purchase details");
      }

      const details = await detailsResponse.json();

      // Check again after async JSON parse
      if (activeRequestRef.current !== requestId) return;

      setPurchaseDetails(details);

      // Calculate total price to check if it's free
      const unitPrice =
        details.stage_price_cents ?? details.ticket_tier.price_cents;
      const quantity = details.quantity;
      const totalCents = unitPrice * quantity;

      if (totalCents === 0) {
        setIsFreePurchase(true);
        setAmounts({
          base: 0,
          fee: 0,
          total: 0,
          currency: details.event.currency ?? "USD",
        });
        setLoading(false);
        return;
      }

      // Create payment intent
      // Include stageId for accurate stage pricing (if available)
      const paymentIntentResponse = await fetch(
        "/api/purchase/create-payment-intent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventId: details.event.id,
            ticketTierId: details.ticket_tier.id,
            quantity: details.quantity,
            flow: token ? "rsvp" : "hold",
            rsvpId: details.rsvp_id || undefined, // Pass RSVP ID explicitly for linking
            // Only include holdId if it's a string (not null/undefined)
            ...(typeof holdSessionId === "string" ? { holdId: holdSessionId } : {}),
            // Pass stageId for correct stage pricing - prevents mismatch between displayed and charged amount
            ...(details.stage_id && { stageId: details.stage_id }),
            promoterCode: details.promoter_code,
          }),
        }
      );

      // Check again after async fetch
      if (activeRequestRef.current !== requestId) return;

      if (!paymentIntentResponse.ok) {
        const errorData = await paymentIntentResponse.json();
        throw new Error(errorData.error || "Failed to initialize payment");
      }

      const {
        clientSecret,
        paymentIntentId,
        amounts: apiAmounts,
      } = await paymentIntentResponse.json();

      // Final check before setting state
      if (activeRequestRef.current !== requestId) return;

      setClientSecret(clientSecret);
      setPaymentIntentId(paymentIntentId);
      // Store the actual amounts from API (includes platform fee)
      setAmounts(apiAmounts);
    } catch (err) {
      // Only set error if this is still the active request
      if (activeRequestRef.current === requestId) {
        console.error("Error loading purchase:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load purchase details"
        );
      }
    } finally {
      // Only clear loading if this is still the active request
      if (activeRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [token, holdSessionId]);

  useEffect(() => {
    if (!token && !holdSessionId) {
      setError("Invalid purchase session");
      setLoading(false);
      return;
    }

    // Reset state when session params change
    setProcessingComplete(false);
    setIsFreePurchase(false);
    setClientSecret(null);
    setPaymentIntentId(null);
    setAmounts(null);
    setError(null);
    setPaymentError(null);
    setLoading(true);
    setAppliedPromo(null);
    setPromoCode("");
    setPromoError(null);

    fetchPurchaseDetails();
  }, [token, holdSessionId, fetchPurchaseDetails]);

  const handleApplyPromoCode = async (codeOverride?: string) => {
    const code = (typeof codeOverride === "string" ? codeOverride : promoCode).trim();
    if (!code || !purchaseDetails) return;

    setIsApplyingPromo(true);
    setPromoError(null);

    try {
      // Call create-payment-intent again with promo code
      // This will validate the code and update/create the PI
      const response = await fetch("/api/purchase/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: purchaseDetails.event.id,
          ticketTierId: purchaseDetails.ticket_tier.id,
          quantity: purchaseDetails.quantity,
          flow: token ? "rsvp" : "hold",
          rsvpId: purchaseDetails.rsvp_id || undefined,
          ...(typeof holdSessionId === "string" ? { holdId: holdSessionId } : {}),
          ...(purchaseDetails.stage_id && { stageId: purchaseDetails.stage_id }),
          promoterCode: purchaseDetails.promoter_code,
          promoCode: code, // Send the promo code
          oldPaymentIntentId: paymentIntentId, // Send old PI ID to cancel it
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

      setClientSecret(newClientSecret);
      setPaymentIntentId(newPaymentIntentId);
      setAmounts(newAmounts);
      if (newPromotionalCodeId) {
        setPromotionalCodeId(newPromotionalCodeId);
      }

      // Check if the new total is zero (free purchase)
      if (newAmounts.total === 0) {
        setIsFreePurchase(true);
        setClientSecret(null);
      } else {
        setIsFreePurchase(false);
      }

      setAppliedPromo(code);
      setPromoCode(""); // Clear input

    } catch (err) {
      console.error("Error applying promo code:", err);
      setPromoError(err instanceof Error ? err.message : "Invalid discount code");
    } finally {
      setIsApplyingPromo(false);
    }
  };

  // Flame 2.0 event-page sheet (2026-10-27): the discount already checked there arrives as
  // ?promo=CODE and is applied here once, as if typed (same create-payment-intent call).
  const urlPromo = searchParams.get("promo");
  const autoPromoTried = useRef(false);
  useEffect(() => {
    if (!urlPromo || autoPromoTried.current || !purchaseDetails || !paymentIntentId || appliedPromo) return;
    autoPromoTried.current = true;
    void handleApplyPromoCode(urlPromo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the payment is ready
  }, [urlPromo, purchaseDetails, paymentIntentId, appliedPromo]);

  const handleRemovePromoCode = async () => {
    if (!purchaseDetails) return;

    setIsApplyingPromo(true);
    setPromoError(null);

    try {
      // Call create-payment-intent without promo code to reset
      const response = await fetch("/api/purchase/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: purchaseDetails.event.id,
          ticketTierId: purchaseDetails.ticket_tier.id,
          quantity: purchaseDetails.quantity,
          flow: token ? "rsvp" : "hold",
          rsvpId: purchaseDetails.rsvp_id || undefined,
          ...(typeof holdSessionId === "string" ? { holdId: holdSessionId } : {}),
          ...(purchaseDetails.stage_id && { stageId: purchaseDetails.stage_id }),
          promoterCode: purchaseDetails.promoter_code,
          // No promoCode property sent = reset
          oldPaymentIntentId: paymentIntentId, // Send old PI ID to cancel it
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

      setClientSecret(newClientSecret);
      setPaymentIntentId(newPaymentIntentId);
      setAmounts(newAmounts);

      // Check if the new total is zero (free purchase)
      if (newAmounts.total === 0) {
        setIsFreePurchase(true);
        setClientSecret(null);
      } else {
        setIsFreePurchase(false);
      }

      setAppliedPromo(null);
      setPromoCode("");
      setPromotionalCodeId(null);

    } catch (err) {
      console.error("Error removing promo code:", err);
      setPromoError(err instanceof Error ? err.message : "Failed to remove discount code");
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleFreePurchase = async () => {
    try {
      setLoading(true);

      let response;
      if (token) {
        // RSVP flow
        response = await fetch("/api/purchase/complete-direct-free", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: token,
            promotional_code_id: promotionalCodeId,
          }),
        });
      } else {
        // Hold flow
        response = await fetch("/api/purchase/complete-hold-free", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            holdSessionId: holdSessionId,
            promotional_code_id: promotionalCodeId,
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to complete purchase");
      }

      setProcessingComplete(true);
    } catch (err) {
      console.error("Error completing free purchase:", err);
      setError(
        err instanceof Error ? err.message : "Failed to complete purchase"
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (confirmedPaymentIntentId: string) => {
    console.log("[StripePurchaseFlow] Payment success callback triggered", { confirmedPaymentIntentId });
    // Validate paymentIntentId before showing success state
    // Prioritize the ID passed from the form callback, fallback to state
    const finalPaymentIntentId = confirmedPaymentIntentId || paymentIntentId;

    if (!finalPaymentIntentId) {
      console.error(
        "Payment success callback triggered but missing PaymentIntent ID"
      );
      setError("Payment successful but session ID is missing.");
      return;
    }

    setProcessingComplete(true);
    console.log("[StripePurchaseFlow] Set processingComplete to true");

    // Redirect to success page with cleanup on unmount
    redirectTimeoutRef.current = setTimeout(() => {
      if (purchaseDetails?.mode === "rsvp") {
        router.push(`/rsvp/success?pi=${finalPaymentIntentId}`);
      } else {
        router.push(`/purchase/success?pi=${finalPaymentIntentId}`);
      }
    }, 1500);
  };

  const handlePaymentError = (errorMessage: string) => {
    setPaymentError(errorMessage);
  };

  const handleCancelPurchase = async () => {
    if (!holdSessionId) return; // Only for hold-based purchases

    try {
      setCancelling(true);
      const response = await fetch("/api/holds/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          holdSessionId: holdSessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to cancel purchase");
      }

      // Redirect back to event page
      if (purchaseDetails?.event.slug) {
        router.push(`/events/${purchaseDetails.event.slug}`);
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error("Error cancelling purchase:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to cancel purchase. Please try again."
      );
      setCancelling(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100" />
          <h2 className="text-white-100 text-lg font-poppins-semibold">Loading Purchase</h2>
          <p className="text-white-50 text-sm font-poppins-light">Please wait while we prepare your checkout...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !purchaseDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-white-5 border border-white-20 rounded-card p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
          <FiAlertCircle size={48} className="text-error" />
          <h2 className="text-white-100 text-xl font-poppins-semibold">Unable to Load Purchase</h2>
          <p className="text-white-50 text-sm font-poppins-light">{error || "An unexpected error occurred"}</p>
          <button
            onClick={() => router.push("/")}
            className="bg-white-100 text-dark rounded-pill px-6 py-3 font-poppins-semibold text-sm cursor-pointer border-none"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Success / processing complete state
  if (processingComplete) {
    if (isFreePurchase) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="bg-white-5 border border-white-20 rounded-card p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#5DDBB1]/20 flex items-center justify-center">
              <FiCheckCircle size={32} className="text-[#5DDBB1]" />
            </div>
            <h2 className="text-white-100 text-xl font-poppins-semibold">Free Ticket Claimed!</h2>
            <p className="text-white-70 text-sm font-poppins-light">Visit my account to see your ticket</p>
            <button
              onClick={() => router.push("/account")}
              className="bg-white-100 text-dark rounded-pill px-6 py-3 font-poppins-semibold text-sm cursor-pointer border-none w-full mt-2"
            >
              My Account
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-white-5 border border-white-20 rounded-card p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#5DDBB1]/20 flex items-center justify-center">
            <FiCheckCircle size={32} className="text-[#5DDBB1]" />
          </div>
          <h2 className="text-white-100 text-xl font-poppins-semibold">Payment Successful!</h2>
          <p className="text-white-70 text-sm font-poppins-light">Redirecting to confirmation...</p>
        </div>
      </div>
    );
  }

  // Local calculation as fallback (without fee) - API amounts take precedence
  const unitPrice =
    purchaseDetails.stage_price_cents ??
    purchaseDetails.ticket_tier.price_cents;
  const baseAmount = unitPrice * purchaseDetails.quantity;
  // Use API amounts (includes fee) if available, otherwise fallback to base calculation
  const displayTotal = amounts?.total ?? baseAmount;
  const currency = amounts?.currency?.toUpperCase() || "USD";

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-[600px] mx-auto flex flex-col gap-6">
        {/* Event Details */}
        <div className="flex flex-col gap-4">
          {purchaseDetails.event.image_url && (
            <div className="relative w-full aspect-[3/4] max-h-[480px] rounded-card overflow-hidden">
              <Image
                src={purchaseDetails.event.image_url}
                alt={purchaseDetails.event.name}
                fill
                sizes="(max-width: 600px) 100vw, 600px"
                className="object-cover"
              />
            </div>
          )}
          <h1 className="text-white-100 text-2xl font-poppins-semibold uppercase m-0">
            {purchaseDetails.event.name}
          </h1>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                <FiCalendar size={20} className="text-white-100" />
              </div>
              <span className="text-white-100 text-sm font-poppins-light">
                {new Date(purchaseDetails.event.starts_at).toLocaleString("en-US", {
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
                <FiMapPin size={20} className="text-white-100" />
              </div>
              <span className="text-white-100 text-sm font-poppins-light">
                {purchaseDetails.event.venue}, {purchaseDetails.event.city}
              </span>
            </div>
          </div>
        </div>

        {/* Order Summary Card */}
        <div className="bg-white-5 rounded-card p-4 flex flex-col gap-4">
          <h3 className="text-white-100 text-lg font-poppins-semibold m-0">Order Summary</h3>

          {/* Event name */}
          <p className="text-white-50 text-xs font-poppins-light uppercase m-0">
            {purchaseDetails.event.name}
          </p>

          {/* Ticket tier info */}
          <div className="bg-white-5 rounded-card p-4 flex justify-between items-center">
            <div>
              <p className="text-white-100 text-sm font-poppins-medium m-0">
                {purchaseDetails.ticket_tier.name}
                {purchaseDetails.stage_name && ` - ${purchaseDetails.stage_name}`}
              </p>
              <p className="text-white-50 text-xs font-poppins-light m-0 mt-1">
                {purchaseDetails.quantity}x
              </p>
            </div>
            <p className="text-white-100 text-sm font-poppins-medium m-0">
              {formatCentsAsPrice(baseAmount, currency)}
            </p>
          </div>

          {/* Attendee */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
              <FiUsers size={18} className="text-white-100" />
            </div>
            <span className="text-white-100 text-sm font-poppins-light">
              {purchaseDetails.user.first_name || purchaseDetails.user.last_name
                ? `${purchaseDetails.user.first_name ?? ""} ${purchaseDetails.user.last_name ?? ""}`.trim()
                : purchaseDetails.user.email}
            </span>
          </div>

          {/* Access Code Section — W4-C3 (Jun 2026). Rendered above promo +
              promoter to match mobile checkout order. Read-only indicator that
              an access code was applied during the upstream unlock flow. The
              value is echoed back from the hold/RSVP record on the server so
              the buyer sees what they entered (parity with promoter). No
              edit/clear — to change the code, buyer cancels purchase and
              re-enters via the event page's access-code input. */}
          {purchaseDetails.secret_code && (
            <div className="pt-4 border-t border-white-10">
              <p className="text-white-70 text-xs font-poppins-medium uppercase m-0 mb-3">
                Access Code
              </p>
              <div className="bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3 flex items-center gap-2">
                <FiCheckCircle size={16} className="text-[#5DDBB1]" />
                <span className="text-[#5DDBB1] text-sm font-poppins-medium">
                  {purchaseDetails.secret_code}
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
                      if (e.key === "Enter" && promoCode.trim()) {
                        e.preventDefault();
                        handleApplyPromoCode();
                      }
                    }}
                    disabled={isApplyingPromo}
                    className="flex-1 bg-white-5 border border-white-20 rounded-card px-4 py-3 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors"
                  />
                  <button
                    onClick={() => handleApplyPromoCode()}
                    disabled={!promoCode.trim() || isApplyingPromo}
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

          {/* Promoter — read-only here: it's entered before the hold (event page / sheet) and
              stored in it; a code typed on this page never reached the order (2026-10-27). */}
          {purchaseDetails?.promoter_code ? (
            <div className="pt-4 border-t border-white-10">
              <p className="text-white-70 text-xs font-poppins-medium uppercase m-0 mb-3">Promoter</p>
              <div className="bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3 flex items-center gap-2">
                <FiCheckCircle size={16} className="text-[#5DDBB1]" />
                <span className="text-[#5DDBB1] text-sm font-poppins-medium">{purchaseDetails.promoter_code}</span>
              </div>
            </div>
          ) : null}

          {/* Price Breakdown */}
          {amounts && (
            <div className="pt-4 border-t border-white-10 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-white-50 text-sm font-poppins">Subtotal</span>
                <span className="text-white-100 text-sm font-poppins">
                  {formatCentsAsPrice(amounts.base, currency)}
                </span>
              </div>

              {amounts.discount != null && amounts.discount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[#5DDBB1] text-sm font-poppins">Discount</span>
                  <span className="text-[#5DDBB1] text-sm font-poppins">
                    -{formatCentsAsPrice(amounts.discount, currency)}
                  </span>
                </div>
              )}

              {amounts.fee > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-white-50 text-sm font-poppins">Service Fee</span>
                  <span className="text-white-100 text-sm font-poppins">
                    {formatCentsAsPrice(amounts.fee, currency)}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-white-10">
                <span className="text-white-100 text-lg font-poppins-semibold">Total</span>
                <span className="text-white-100 text-lg font-poppins-semibold">
                  {formatCentsAsPrice(displayTotal, currency)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Payment Form or Free Claim Button */}
        {isFreePurchase ? (
          <div className="flex flex-col gap-4">
            <p className="text-white-50 text-sm font-poppins-light m-0">
              This is a free ticket. No payment is required.
            </p>
            <button
              onClick={handleFreePurchase}
              disabled={loading}
              className="bg-white-100 text-dark rounded-pill px-6 py-4 font-poppins-semibold text-sm cursor-pointer border-none w-full disabled:opacity-50"
            >
              {loading ? "Processing..." : "Claim Free Ticket"}
            </button>

            {/* Cancel Button (only for hold-based purchases) */}
            {holdSessionId && (
              <button
                onClick={handleCancelPurchase}
                disabled={cancelling || loading}
                className="bg-transparent border border-white-30 text-white-100 rounded-pill px-6 py-3 font-poppins-medium text-sm cursor-pointer disabled:opacity-40"
                type="button"
              >
                {cancelling ? "Cancelling..." : "Cancel Purchase"}
              </button>
            )}
          </div>
        ) : (
          clientSecret && stripePromise && (
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
                  amount={displayTotal}
                  currency={currency}
                  isRsvp={purchaseDetails.mode === "rsvp"}
                  holdSessionId={holdSessionId}
                  externalError={paymentError}
                />
              </Elements>

              {/* Cancel Button (only for hold-based purchases) */}
              {holdSessionId && !processingComplete && (
                <button
                  onClick={handleCancelPurchase}
                  disabled={cancelling}
                  className="bg-transparent border border-white-30 text-white-100 rounded-pill px-6 py-3 font-poppins-medium text-sm cursor-pointer disabled:opacity-40"
                  type="button"
                >
                  {cancelling ? "Cancelling..." : "Cancel Purchase"}
                </button>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
