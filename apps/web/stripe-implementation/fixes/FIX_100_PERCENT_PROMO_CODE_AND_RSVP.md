# Fix: 100% Discount Promo Code Tracking & RSVP UI

**Date:** January 23, 2026
**Author:** AI Assistant
**Status:** Implemented

## Context

Two critical issues were identified regarding the handling of promotional codes that provide a 100% discount:

1.  **Usage Tracking:** When a 100% discount was applied, the `promotionalCodeId` was not being passed to the order completion endpoints. This meant that the `usage_count` for these promo codes was not incremented, allowing unlimited reuse and causing a loss of attribution.
2.  **RSVP UI Dead End:** In the `RsvpPaymentModal`, applying a 100% discount resulted in a `null` client secret from Stripe. The UI logic only rendered the payment form if a client secret existed, leaving the user with no way to submit the free RSVP.

## Changes Implemented

### 1. Promo Code Usage Tracking

**Goal:** Ensure `promotionalCodeId` is passed and tracked for all purchases, including free ones.

*   **`app/api/purchase/create-payment-intent/route.ts`**:
    *   Modified to return `promotionalCodeId` in the response even when `totalAmountCents` is 0.

*   **`app/components/StripePurchaseFlow.tsx`**:
    *   Updated state to store `promotionalCodeId`.
    *   Updated `handleFreePurchase` to pass `promotional_code_id` to the backend.

*   **`app/api/purchase/complete-direct-free/route.ts` & `app/api/purchase/complete-hold-free/route.ts`**:
    *   Updated to accept `promotional_code_id`.
    *   Updated order creation logic to store `promotional_code_id` and `discount_amount_cents`.
    *   Added logic to atomically increment `usage_count` for the promo code.

*   **`app/lib/orders.ts`**:
    *   Updated `createOrder` to accept and store `promotionalCodeId` and `discountAmountCents`.
    *   Added `incrementPromoCodeUsage` function with retry logic to handle atomic updates.

*   **`supabase/migrations/20260123000000_add_promo_code_to_rsvps.sql`**:
    *   Added `promotional_code_id` and `discount_amount_cents` columns to `rsvps` table.
    *   Updated `create_rsvp_atomic` function to accept and store these values.

### 2. RSVP UI & Flow

**Goal:** Provide a valid submission path for free RSVPs and ensure they are tracked.

*   **`app/components/modals/RsvpPaymentModal.tsx`**:
    *   Added conditional rendering to show a "Complete RSVP" button when `amounts.total` is 0 and `clientSecret` is null.
    *   Implemented `handleFreeRsvp` to submit the RSVP without a payment intent.

*   **`app/lib/hooks/useRsvp.ts`**:
    *   Updated `RsvpSubmissionParams` to include `promotionalCodeId`.

*   **`app/api/rsvp/route.ts`**:
    *   Updated to accept `promotionalCodeId`.
    *   Updated `create_rsvp_atomic` RPC call to store `promotional_code_id` and `discount_amount_cents`.

*   **`app/api/organizer/rsvps/[id]/approve/route.ts`**:
    *   Updated logic to extract `promotionalCodeId` from RSVP data and pass it to `createOrder`.
    *   Added logic to cancel/refund any existing PaymentIntent if the RSVP is free (e.g., due to price change), preventing unnecessary holds on customer funds.

## Verification

*   **Direct Purchase (100% Off):** Verify that completing a purchase with a 100% off code increments the code's usage count and creates an order with the correct `promotional_code_id`.
*   **RSVP (100% Off):** Verify that the "Complete RSVP" button appears in the modal. Verify that submitting creates an RSVP with the correct `promotional_code_id`. Verify that approving the RSVP creates an order with the correct `promotional_code_id` and increments usage count.
*   **Hold Purchase (100% Off):** Verify that completing a hold purchase with a 100% off code works similarly to direct purchase.

## Related Files

*   `app/api/purchase/create-payment-intent/route.ts`
*   `app/components/StripePurchaseFlow.tsx`
*   `app/api/purchase/complete-direct-free/route.ts`
*   `app/api/purchase/complete-hold-free/route.ts`
*   `app/components/modals/RsvpPaymentModal.tsx`
*   `app/lib/hooks/useRsvp.ts`
*   `app/api/rsvp/route.ts`
*   `app/api/organizer/rsvps/[id]/approve/route.ts`
*   `app/lib/orders.ts`
