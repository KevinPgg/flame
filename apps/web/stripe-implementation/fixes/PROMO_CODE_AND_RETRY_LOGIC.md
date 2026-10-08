# Promo Code Implementation & Success Page Retry Logic

## Overview
This document details the critical logic changes implemented to support promo codes in the direct purchase flow and the enhanced reliability of the purchase success page.

## 1. Promo Code Race Condition Fix
**Issue:** Applying a promo code caused a 404 error because the system was deleting the hold associated with the original (non-discounted) PaymentIntent when it was canceled.
**Fix:** We now explicitly remove the `holdId` from the old PaymentIntent's metadata *before* cancelling it. This prevents the cancellation webhook from detecting a hold and deleting it, ensuring the hold remains valid for the new discounted PaymentIntent.

### Key Code Change (`app/api/purchase/create-payment-intent/route.ts`)
```typescript
if (oldPaymentIntentId && typeof oldPaymentIntentId === "string" && oldPaymentIntentId.startsWith("pi_")) {
  // ...
  if (isCancellableStatus(oldPI.status)) {
    // CRITICAL: Remove holdId from metadata before cancelling
    if (oldPI.metadata.holdId) {
      await stripe.paymentIntents.update(oldPaymentIntentId, {
        metadata: {
          holdId: null, // Remove holdId
          rsvpId: null, // Remove rsvpId too just in case
          cancellation_reason: "replaced_by_promo", // Add context
        },
      });
    }
    await stripe.paymentIntents.cancel(oldPaymentIntentId, {
      cancellation_reason: "abandoned",
    });
  }
  // ...
}
```

## 2. Success Page Retry Logic
**Issue:** Users occasionally saw a "Purchase Verification Error" or stuck loading state if they were redirected to the success page before the Stripe webhook had finished creating the order in the database.
**Fix:** We implemented an exponential backoff retry mechanism on the success page.

### How it Works (`app/purchase/success/page.tsx`)
1.  **Initial Fetch:** The page attempts to fetch the order details using the `order_id` or `payment_intent` ID from the URL.
2.  **404 Handling:** If the API returns a 404 (Order Not Found), the client does *not* immediately show an error.
3.  **Retry Loop:** It retries the fetch up to 5 times with exponential backoff.
    *   **Formula:** `delay = 1000 * (1.5 ^ attempt)`
    *   **Attempt 1:** Wait 1000ms (Cumulative: 1s)
    *   **Attempt 2:** Wait 1500ms (Cumulative: 2.5s)
    *   **Attempt 3:** Wait 2250ms (Cumulative: 4.75s)
    *   **Attempt 4:** Wait 3375ms (Cumulative: 8.125s)
    *   **Attempt 5:** Wait 5062ms (Cumulative: ~13.2s)
4.  **Completion:**
    *   **Success:** Once the order is found, `setLoading(false)` is called, and the confirmation is shown.
    *   **Failure:** If the order is still not found after 5 attempts, the error message is displayed.

### Why the Loading Spinner Appears Now
Previously, the page would likely fail immediately if the order wasn't ready, or it might have relied on a faster webhook processing time in the "happy path." Now, the loading spinner persists *intentionally* while the client polls for the order creation. This is a better user experience than showing a premature error, as it handles the natural latency of asynchronous webhook processing.

## 3. Frontend Logging
We added detailed logging to `StripePaymentForm` and `StripePurchaseFlow` to aid in debugging payment confirmation and state transitions. These logs can be viewed in the browser console.
