"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FiCheckCircle, FiXCircle } from "react-icons/fi";
import Link from "next/link";
import { useRsvpSubmission } from "../../lib/hooks/useRsvp";

function RsvpSuccessContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("Processing your RSVP...");
  const processedRef = useRef(false);

  const paymentIntentId = searchParams?.get("pi") || searchParams?.get("payment_intent");
  const redirectStatus = searchParams?.get("redirect_status");

  const rsvpMutation = useRsvpSubmission();

  useEffect(() => {
    // Prevent double processing
    if (processedRef.current) return;

    if (!paymentIntentId) {
      setStatus("error");
      setMessage("Invalid payment information received.");
      return;
    }

    if (redirectStatus === "failed") {
      setStatus("error");
      setMessage("Payment authentication failed. Please try again.");
      return;
    }

    const processRsvp = async () => {
      // Retrieve pending RSVP data from session storage
      const storedData = sessionStorage.getItem("pendingRsvpData");
      if (!storedData) {
        setStatus("error");
        setMessage(
          "Could not find RSVP details. If you were charged, please contact support."
        );
        return;
      }

      try {
        let rsvpData;
        try {
          rsvpData = JSON.parse(storedData);
        } catch (parseError) {
          console.error("Failed to parse stored RSVP data:", parseError);
          setStatus("error");
          setMessage("Invalid RSVP data. If you were charged, please contact support.");
          return;
        }

        // Verify payment intent matches (security check)
        if (
          rsvpData.paymentIntentId &&
          paymentIntentId &&
          rsvpData.paymentIntentId !== paymentIntentId
        ) {
          console.error("Payment Intent ID mismatch", {
            stored: rsvpData.paymentIntentId,
            received: paymentIntentId,
          });
          setStatus("error");
          setMessage("Security check failed: Payment verification mismatch.");
          return;
        }

        if (!rsvpData.pendingRsvpId) {
          setStatus("error");
          setMessage(
            "Could not find RSVP details. If you were charged, please contact support."
          );
          return;
        }

        // Mark as processed BEFORE submission to prevent race conditions/duplicates
        processedRef.current = true;

        // Submit RSVP
        await rsvpMutation.mutateAsync({
          pending_rsvp_id: rsvpData.pendingRsvpId,
          paymentIntentId: paymentIntentId,
        });

        // Clear session storage on success
        sessionStorage.removeItem("pendingRsvpData");

        setStatus("success");
        setMessage("Your RSVP has been submitted successfully!");
      } catch (error: any) {
        console.error("Failed to submit RSVP after payment:", error);

        // Handle specific error cases
        if (error.code === "DUPLICATE_RSVP") {
           setStatus("success"); // Treat duplicate as success (already processed)
           setMessage("Your RSVP has been submitted successfully!");
           sessionStorage.removeItem("pendingRsvpData");
        } else {
          // Reset processed flag for retryable errors
          processedRef.current = false;

          setStatus("error");
          setMessage(
            error.message ||
              "Payment authorized, but failed to create RSVP record. Please contact the organizer."
          );
        }
      }
    };

    processRsvp();
    // Note: rsvpMutation is intentionally omitted from dependencies as it's a stable reference
    // from react-query, and processedRef prevents double processing anyway
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentIntentId, redirectStatus]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full flex flex-col items-center gap-6">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100" />
            <h1 className="text-white-100 text-xl font-poppins-semibold m-0">Finalizing RSVP</h1>
            <p className="text-white-50 text-sm font-poppins-light m-0">{message}</p>
          </div>
        )}

        {status === "success" && (
          <div className="bg-white-5 border border-white-20 rounded-card p-8 w-full flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[#5DDBB1]/20 flex items-center justify-center">
              <FiCheckCircle size={32} className="text-[#5DDBB1]" />
            </div>
            <h1 className="text-white-100 text-xl font-poppins-semibold m-0">Success!</h1>
            <p className="text-white-70 text-sm font-poppins m-0">{message}</p>
            <p className="text-white-50 text-xs font-poppins-light m-0 leading-5">
              Your payment has been authorized and your request is pending
              approval from the organizer. You will receive an email once it is
              processed.
            </p>
            <Link
              href="/account/tickets"
              className="bg-white-100 text-dark rounded-pill px-6 py-4 font-poppins-semibold text-sm no-underline w-full text-center mt-2"
            >
              View My Tickets
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="bg-white-5 border border-white-20 rounded-card p-8 w-full flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[rgba(234,51,112,0.1)] flex items-center justify-center">
              <FiXCircle size={32} className="text-error" />
            </div>
            <h1 className="text-white-100 text-xl font-poppins-semibold m-0">Something went wrong</h1>
            <p className="text-white-50 text-sm font-poppins-light m-0">{message}</p>
            <Link
              href="/"
              className="bg-transparent border border-white-30 text-white-100 rounded-pill px-6 py-3 font-poppins-medium text-sm no-underline w-full text-center"
            >
              Return Home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100" />
        <p className="text-white-50 text-sm font-poppins-light">Loading...</p>
      </div>
    </div>
  );
}

export default function RsvpSuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RsvpSuccessContent />
    </Suspense>
  );
}
