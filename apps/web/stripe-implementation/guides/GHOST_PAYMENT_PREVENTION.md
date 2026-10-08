# Ghost Payment Prevention System

**Date:** January 15, 2026
**Status:** ✅ Implemented

---

## Overview

"Ghost Payments" occur when a user successfully pays via Stripe, but the system fails to create an order or issue tickets. This typically happens if the user's reservation (Hold) expires while they are on the checkout page (e.g., leaving the tab open for hours).

To prevent this, we have implemented a **Client-Side Pre-Flight Check**.

## Architecture

### 1. Hold Duration
The default hold duration is set to **30 minutes** (previously 15 minutes, briefly increased to 4 hours). This balances user convenience with inventory availability, preventing abandoned checkouts from locking tickets for extended periods.

- **File:** `app/api/holds/create/route.ts`
- **Setting:** `p_expires_minutes: 30`

### 2. Client-Side Pre-Flight Check
Before the Stripe `confirmPayment` process is initiated, the frontend explicitly validates the session with the backend.

**The Flow:**
1.  User clicks "Complete Purchase".
2.  **Frontend Intercept:** `StripePaymentForm.tsx` pauses the submission.
3.  **Validation Call:** Frontend calls `GET /api/holds/validate?session={holdSessionId}`.
4.  **Backend Check:**
    *   Checks if Hold exists in DB.
    *   Checks if Hold has expired (`expires_at < NOW()`).
    *   Checks if Hold was already used (`order_id IS NOT NULL`).
5.  **Decision:**
    *   **If Valid:** Proceed to `stripe.confirmPayment()`.
    *   **If Invalid/Expired:**
        *   Abort payment process immediately.
        *   Show error: *"Your reservation has expired (30-minute limit). Please restart your checkout."*
        *   **CRITICAL:** Do NOT send data to Stripe.

### 3. Webhook Safety Net (Defense in Depth)
If a payment somehow slips through (e.g., race condition milliseconds before expiration):
1.  Stripe processes the charge.
2.  The `payment_intent.succeeded` webhook fires.
3.  The system tries to find the Hold.
4.  If Hold is missing/expired:
    *   System creates a "Ghost Order" record for tracking.
    *   System **automatically refunds** the customer.
    *   System logs a critical error to `order_errors`.

## Implementation Details

### Frontend Component
**File:** `app/components/StripePaymentForm.tsx`

```typescript
// Pre-flight check
if (!isRsvp && holdSessionId) {
  const validateRes = await fetch(`/api/holds/validate?session=${holdSessionId}`);
  if (!validateRes.ok) {
    // STOP EVERYTHING
    throw new Error("Your reservation has expired...");
  }
}
// Only if valid -> confirm with Stripe
await elements.submit();
await stripe.confirmPayment(...);
```

### Backend Endpoint
**File:** `app/api/holds/validate/route.ts`

**Response Codes:**

| Status | Condition |
|--------|-----------|
| `200 OK` | Hold is valid |
| `404 Not Found` | Hold is missing (expired & cleaned up) |
| `410 Gone` | Hold is expired or already used |
