/**
 * Stripe Payment Constants
 * 
 * Shared constants for Stripe payment operations across the application.
 */

import type Stripe from "stripe";

/**
 * PaymentIntent statuses that can be safely cancelled
 * 
 * NOTE: "processing" is included to support async payment methods (e.g., bank redirects)
 * that can be cancelled before completion. Callers should handle potential race conditions
 * where status changes to "succeeded" during cancellation.
 * 
 * @see stripe-implementation/SECURITY_FIXES_JAN_2026.md Section 5
 */
export const CANCELLABLE_PAYMENT_INTENT_STATUSES = [
  "requires_payment_method",
  "requires_capture",
  "requires_confirmation",
  "requires_action",
  "processing",
] as const satisfies readonly Stripe.PaymentIntent.Status[];

/**
 * Type guard to check if a PaymentIntent status is cancellable
 * 
 * @param status - The PaymentIntent status to check
 * @returns True if the status is cancellable, false otherwise
 */
export function isCancellableStatus(
  status: Stripe.PaymentIntent.Status
): status is typeof CANCELLABLE_PAYMENT_INTENT_STATUSES[number] {
  return (CANCELLABLE_PAYMENT_INTENT_STATUSES as readonly string[]).includes(status);
}
