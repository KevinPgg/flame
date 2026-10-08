### 26. RSVP Security & Nitpick Fixes (January 26, 2026)
**Files:** `app/api/rsvp/route.ts`, `app/api/purchase/create-payment-intent/route.ts`, `app/components/modals/RsvpPaymentModal.tsx`, `supabase/migrations/20260123000000_add_promo_code_to_rsvps.sql`, `supabase/migrations/20260126000002_fix_rsvp_discount_constraint.sql`

- **RSVP Security:** Verified 100% discount for free promo codes server-side.
- **Payment Flow:** Cancelled orphaned PaymentIntents when switching to free promo flow.
- **Database:** Enforced non-negative constraints on RSVP discount amounts.
- **UI:** Improved modal state persistence for promo codes.

### 27. Promo Code Type Safety & Payment Security (January 26, 2026)
**Files:** `app/api/purchase/create-payment-intent/route.ts`, `app/components/modals/RsvpPaymentModal.tsx`

- **Type Safety:** Added strict type check for `promoCode` in payment intent creation to prevent runtime errors.
- **Security:** Added ownership verification before cancelling old PaymentIntents during free promo flow to prevent unauthorized cancellations.
- **Code Quality:** Refactored `RsvpPaymentModal` to capture state variables before reset, improving clarity and preventing potential race conditions in the success callback.

### 28. Fix 100% Discount RSVP Base Price (January 26, 2026)
**Files:** `app/api/rsvp/route.ts`

- **Bug Fix:** Correctly set `base_price_cents` to 0 for 100% discount RSVPs. Previously, it was set to the pre-discount subtotal, causing the organizer dashboard to display the full price instead of $0.00 for free promo tickets.

### 29. Persist Promo ID from Payment Metadata (January 26, 2026)
**Files:** `app/api/rsvp/route.ts`

- **Data Integrity:** Updated RSVP creation to read `promotionalCodeId` from PaymentIntent metadata. This ensures that when a user pays with a discount code, the specific code ID is correctly linked to their RSVP record, enabling accurate reporting on promo code usage.

### 30. Fix Duplicate Email on RSVP Approval (January 26, 2026)
**Files:** `app/api/organizer/rsvps/[id]/approve/route.ts`, `app/lib/email/ticket-notifications.ts`

- **Bug Fix:** Removed duplicate email sending on RSVP approval. Previously, users received two emails:
  1. A basic "RSVP Approved" email (no PDF, no cost breakdown)
  2. A complete ticket confirmation email (with PDF, costs, promo discounts)
  
  Now only the comprehensive ticket confirmation email is sent (via webhook for paid RSVPs, or directly for free RSVPs).
- **Code Cleanup:** Removed unused `sendApprovalNotificationAndRevalidate()` helper function and `sendRsvpApprovalEmail` import.
- **UX Tweak:** Updated "What's Next?" section wording from "now available" to "also available" since tickets are attached to the email.

### 31. Fix Stuck Promo Spinner on Modal Reopen (January 26, 2026)
**Files:** `app/components/modals/RsvpPaymentModal.tsx`

- **Bug Fix:** Reset `isApplyingPromo` state when modal closes.
  - **Root Cause:** When the modal closed while a promo code request was in-flight, the `finally` blocks in `handleApplyPromoCode` and `handleRemovePromoCode` skipped resetting `isApplyingPromo` (guarded by `isOpenRef.current`). The close effect reset other promo state (`promoCode`, `promoError`) but not `isApplyingPromo`.
  - **Symptom:** On modal reopen, the Apply button showed a stuck spinner and remained disabled, blocking users from applying promo codes.
  - **Fix:** Added `setIsApplyingPromo(false)` to the modal close effect to ensure clean state on reopen.

### 32. Email Footer & Discount Parsing Nitpicks (January 26, 2026)
**Files:** `app/lib/email/ticket-notifications.ts`, `app/api/organizer/rsvps/[id]/approve/route.ts`

- **Email Footer Consistency:** Made ticket confirmation email footer conditional based on `isRsvpApproval`:
  - Changed "You received this email because you purchased tickets" → conditional text for RSVP approvals vs purchases.
  - Changed "transactional email for your ticket purchase" → "RSVP approval" or "ticket purchase" based on context.
- **Discount Parsing Logging:** Added explicit warning log when `discountAmountCents` metadata fails to parse as a valid number. Aids debugging malformed metadata without silently skipping.
