"use client";

import { useState, useEffect } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import { formatCentsAsPrice } from "@project-flame/lib";

interface StripePaymentFormProps {
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
  amount: number;
  currency: string;
  isRsvp?: boolean;
  onBeforePayment?: () => void | Promise<void>;
  holdSessionId?: string | null;
  /** B3: the PaymentIntent about to be confirmed (recorded on the hold when the payment starts). */
  paymentIntentId?: string | null;
  externalError?: string | null;
}

export default function StripePaymentForm({
  onSuccess,
  onError,
  amount,
  currency,
  isRsvp = false,
  onBeforePayment,
  holdSessionId,
  paymentIntentId,
  externalError,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!stripe || !elements) {
      return;
    }
    setIsReady(true);
  }, [stripe, elements]);

  // Sync external error to local state
  useEffect(() => {
    if (externalError) {
      setErrorMessage(externalError);
    } else {
      setErrorMessage(null);
    }
  }, [externalError]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setErrorMessage(null);

    try {
      // Pre-flight check for hold expiration (prevents payments on expired sessions)
      if (!isRsvp && holdSessionId) {
        try {
          const validateRes = await fetch(
            `/api/holds/validate?session=${encodeURIComponent(holdSessionId)}`,
            { cache: "no-store" }
          );
          if (!validateRes.ok) {
            const errorData = await validateRes.json();
            throw new Error(
              errorData.error ||
                "Your reservation has expired (30-minute limit). Please restart your checkout."
            );
          }
        } catch (validationErr) {
          const message =
            validationErr instanceof Error
              ? validationErr.message
              : "Session validation failed";
          setErrorMessage(message);
          setProcessing(false);
          onError(message);
          return; // STOP PAYMENT
        }
      }

      const { error: submitError } = await elements.submit();
      if (submitError) {
        setErrorMessage(submitError.message || "An error occurred");
        setProcessing(false);
        onError(submitError.message || "An error occurred");
        return;
      }

      // B3 (fase 3.1): mark the hold "payment in progress" (+10 min, cleanup grace) right before
      // confirming, so it can't expire and be deleted while Stripe processes the payment.
      // After elements.submit() so a form error doesn't mark it for nothing.
      if (!isRsvp && holdSessionId && paymentIntentId) {
        try {
          const startRes = await fetch("/api/holds/start-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hold_id: holdSessionId, payment_intent_id: paymentIntentId }),
          });
          if (!startRes.ok) {
            const data = await startRes.json().catch(() => ({}));
            throw new Error(
              data.error ||
                "We couldn't start the payment. Your card was not charged — please try again."
            );
          }
        } catch (startErr) {
          const message =
            startErr instanceof Error
              ? startErr.message
              : "We couldn't start the payment. Your card was not charged — please try again.";
          setErrorMessage(message);
          setProcessing(false);
          onError(message);
          return; // STOP PAYMENT (nothing was charged)
        }
      }

      // Hook to perform actions before payment confirmation (e.g. saving state for redirect)
      if (onBeforePayment) {
        try {
          await onBeforePayment();
        } catch (beforePaymentError) {
          const message =
            beforePaymentError instanceof Error
              ? beforePaymentError.message
              : "Failed to prepare payment";
          setErrorMessage(message);
          setProcessing(false);
          onError(message);
          return;
        }
      }

      // Confirm the payment
      console.log("[StripePaymentForm] Confirming payment...");
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${
            isRsvp ? "/rsvp/success" : "/purchase/success"
          }`,
        },
        redirect: "if_required",
      });

      console.log("[StripePaymentForm] Confirm result:", { error, paymentIntent });

      if (error) {
        // Log primitive fields explicitly — Next's dev overlay serializes the
        // raw Stripe error (from the cross-origin Elements iframe) as `{}`,
        // hiding the actual type/code/message.
        console.error("[StripePaymentForm] Payment error:", {
          type: error.type,
          code: error.code,
          message: error.message,
          declineCode: error.decline_code,
          param: error.param,
        });
        setErrorMessage(error.message || "Payment failed");
        setProcessing(false);
        onError(error.message || "Payment failed");
      } else if (paymentIntent && paymentIntent.status === "requires_action") {
        // Handle 3DS or other actions manually if confirmPayment returns this status
        if (!paymentIntent.client_secret) {
          const message =
            "Payment requires action but client secret is missing";
          setErrorMessage(message);
          setProcessing(false);
          onError(message);
          return;
        }

        const { error: actionError, paymentIntent: confirmationIntent } =
          await stripe.handleNextAction({
            clientSecret: paymentIntent.client_secret,
          });

        if (actionError) {
          setErrorMessage(actionError.message || "Authentication failed");
          setProcessing(false);
          onError(actionError.message || "Authentication failed");
        } else if (
          confirmationIntent &&
          confirmationIntent.status === "requires_payment_method"
        ) {
          const message =
            "Authentication failed. Please try another payment method.";
          setErrorMessage(message);
          setProcessing(false);
          onError(message);
        } else if (
          confirmationIntent &&
          (confirmationIntent.status === "succeeded" ||
            confirmationIntent.status === "processing" ||
            confirmationIntent.status === "requires_capture")
        ) {
          setProcessing(false);
          onSuccess(confirmationIntent.id);
        } else {
          setErrorMessage("Payment verification failed");
          setProcessing(false);
          onError("Payment verification failed");
        }
      } else if (
        paymentIntent &&
        (paymentIntent.status === "succeeded" ||
          paymentIntent.status === "processing")
      ) {
        setProcessing(false);
        onSuccess(paymentIntent.id);
      } else if (paymentIntent && paymentIntent.status === "requires_capture") {
        // For RSVP flow with manual capture
        setProcessing(false);
        onSuccess(paymentIntent.id);
      } else {
        setErrorMessage("Payment processing failed");
        setProcessing(false);
        onError("Payment processing failed");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMessage(message);
      setProcessing(false);
      onError(message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="min-h-[120px]">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 bg-[rgba(234,51,112,0.1)] rounded-card px-4 py-3">
          <FiAlertCircle size={20} className="text-error shrink-0" />
          <span className="text-error text-sm font-poppins">{errorMessage}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="text-white-50 text-sm font-poppins">Total:</span>
          <span className="text-white-100 text-lg font-poppins-semibold">
            {formatCentsAsPrice(amount, currency)}
          </span>
        </div>
        <button
          type="submit"
          disabled={!isReady || processing || !stripe || !elements}
          className="bg-white-100 text-dark rounded-pill px-6 py-4 font-poppins-semibold text-sm cursor-pointer border-none w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
        >
          {processing ? (
            <>
              <div className="animate-spin rounded-full w-4 h-4 border-2 border-dark/30 border-t-dark" />
              Processing...
            </>
          ) : isRsvp ? (
            "Authorize Payment"
          ) : (
            "Complete Purchase"
          )}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 text-white-30 text-xs font-poppins-light">
        <FiCheckCircle size={14} />
        <span>Secured by Stripe</span>
      </div>
    </form>
  );
}
