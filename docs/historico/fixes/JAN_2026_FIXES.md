### 26. RSVP Security & Nitpick Fixes (January 26, 2026)
**Files:** `app/api/rsvp/route.ts`, `app/api/purchase/create-payment-intent/route.ts`, `app/components/modals/RsvpPaymentModal.tsx`, `supabase/migrations/20260123000000_add_promo_code_to_rsvps.sql`, `supabase/migrations/20260126000002_fix_rsvp_discount_constraint.sql`

- **RSVP Security Fix:**
  - **Problem:** `isFreePromo` check in `app/api/rsvp/route.ts` relied on client-provided `free_promo_` prefix without verifying the promo code actually granted 100% discount.
  - **Fix:** Added server-side verification of `promotional_code_id` and its `discount_percentage` (must be 100) before allowing free RSVP.
  - **Impact:** Prevents attackers from bypassing payment by sending fake `free_promo_` IDs with partial discount codes.

- **PaymentIntent Cancellation:**
  - **Problem:** `create-payment-intent` returned early for 0-amount (free) transactions without cancelling any previously created PaymentIntent (e.g., from a prior attempt without the code).
  - **Fix:** Added logic to cancel `oldPaymentIntentId` if present before returning the free purchase response.

- **Database Constraints:**
  - **Problem:** `discount_amount_cents` in `rsvps` table allowed negative values and nulls.
  - **Fix:** Updated migration `20260123000000_add_promo_code_to_rsvps.sql` and created `20260126000002_fix_rsvp_discount_constraint.sql` to enforce `NOT NULL DEFAULT 0` and `CHECK (discount_amount_cents >= 0)`.

- **Code Quality (Nitpicks):**
  - Changed to use `Number.isFinite()` instead of `!isNaN()` for safer number parsing in `rsvp/route.ts`.
  - Updated `RsvpPaymentModal.tsx` to preserve `appliedPromo` state when closing modal (if PI is retained).

### 27. Promo Code Type Safety & Payment Security (January 26, 2026)
**Files:** `app/api/purchase/create-payment-intent/route.ts`, `app/components/modals/RsvpPaymentModal.tsx`

- **Type Safety:** Added strict type check for `promoCode` in payment intent creation to prevent runtime errors.
- **Security:** Added ownership verification before cancelling old PaymentIntents during free promo flow to prevent unauthorized cancellations.
- **Code Quality:** Refactored `RsvpPaymentModal` to capture state variables before reset, improving clarity and preventing potential race conditions in the success callback.

### 28. Fix 100% Discount RSVP Base Price (January 26, 2026)
**Files:** `app/api/rsvp/route.ts`

- **Bug Fix:** Correctly set `base_price_cents` to 0 for 100% discount RSVPs.
  - **Problem:** `base_price_cents` was being set to the pre-discount subtotal for free promo RSVPs.
  - **Impact:** Organizer dashboard and exports displayed the full ticket price instead of $0.00.
  - **Fix:** Explicitly set `paymentMetadata.basePriceCents = "0"` when processing a verified 100% discount promo code.

### 29. Persist Promo ID from Payment Metadata (January 26, 2026)
**Files:** `app/api/rsvp/route.ts`

- **Data Integrity:** Updated RSVP creation to read `promotionalCodeId` from PaymentIntent metadata.
  - **Impact:** Promo code ID is now correctly linked to RSVP records, enabling accurate usage reporting.

### 30. Fix Duplicate Email on RSVP Approval (January 26, 2026)
**Files:** `app/api/organizer/rsvps/[id]/approve/route.ts`, `app/lib/email/ticket-notifications.ts`

- **Bug Fix:** Removed duplicate email sending on RSVP approval.
  - **Problem:** Users received two emails: (1) basic "RSVP Approved" email without PDF/costs, (2) complete ticket confirmation with PDF and cost breakdown.
  - **Fix:** Removed the basic approval email. Now only the comprehensive ticket confirmation email is sent (via webhook for paid RSVPs, directly for free RSVPs).
  - **Code Cleanup:** Removed unused `sendApprovalNotificationAndRevalidate()` function and import.
  - **UX Tweak:** Updated "What's Next?" wording from "now available" to "also available".

### 31. Fix Stuck Promo Spinner on Modal Reopen (January 26, 2026)
**Files:** `app/components/modals/RsvpPaymentModal.tsx`

- **Bug Fix:** Reset `isApplyingPromo` state when modal closes.
  - **Problem:** When modal closed during an in-flight promo code request, `isApplyingPromo` remained `true`. The `finally` blocks skipped reset (guarded by `isOpenRef.current`), and the close effect didn't reset it.
  - **Symptom:** On modal reopen, Apply button showed stuck spinner and was disabled.
  - **Fix:** Added `setIsApplyingPromo(false)` to the modal close effect.

### 32. Email Footer & Discount Parsing Nitpicks (January 26, 2026)
**Files:** `app/lib/email/ticket-notifications.ts`, `app/api/organizer/rsvps/[id]/approve/route.ts`

- **Email Footer Consistency:**
  - **Problem:** Footer hardcoded "You received this email because you purchased tickets" which was inaccurate for RSVP approvals.
  - **Fix:** Made footer text conditional based on `isRsvpApproval`, similar to the header.
- **Discount Parsing Logging:**
  - **Problem:** Malformed `discountAmountCents` metadata silently skipped the discount without logging.
  - **Fix:** Added explicit warning log when parsing fails, aiding debugging.
