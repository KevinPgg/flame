# Option A: Optimized Retry Flow with Billing Preservation

## Overview

This implementation uses the **standard Datafast Copy&Pay redirect flow** (Option A) but optimizes it to preserve billing information and provide smooth retry experience for payment errors.

## User Experience

### ✅ **For RETRYABLE Errors (Wrong Card Details):**

1. User fills billing info and card details
2. Clicks "Pay Now"
3. Datafast processes → Error (e.g., invalid cardholder)
4. **Separate error page** shows: "Payment Declined"
   - Error message: "Invalid cardholder name. Please check and try again."
   - Primary button: **"Try Again"**
   - Secondary button: "Browse Events"
5. User clicks **"Try Again"**
6. ✅ **Billing form auto-fills** (all fields preserved!)
7. ✅ **Terms checkbox auto-checked**
8. ✅ **Payment widget auto-loads**
9. ✅ **Page smooth-scrolls to payment section**
10. User corrects card details and clicks "Pay Now"
11. Success! 🎉

### ❌ **For NON-RECOVERABLE Errors (Lost Card, Insufficient Funds):**

1. Error page shows with "Browse Events" button
2. User goes back to select tickets with different card

### 🔧 **For TECHNICAL Errors (System Issues):**

1. Error page shows "Contact Support" button
2. User contacts support for assistance

## Technical Implementation

### 1. Save Billing Info to SessionStorage

**When:** User clicks "Proceed to Payment"

**File:** `app/purchase/page.tsx` (line 520-525)

```typescript
// Save billing info and terms agreement to sessionStorage
// This allows "Try Again" to restore the form state
sessionStorage.setItem("flame_billing_info", JSON.stringify(billingInfo));
sessionStorage.setItem("flame_terms_agreed", "true");
console.log("💾 Saved billing info to sessionStorage for retry");
```

**Why:** Survives page reloads, cleared on browser close

### 2. Restore Billing Info on Page Load

**When:** Page loads (first useEffect)

**File:** `app/purchase/page.tsx` (line 139-158)

```typescript
useEffect(() => {
  const savedBillingInfo = sessionStorage.getItem("flame_billing_info");
  const savedTermsAgreed = sessionStorage.getItem("flame_terms_agreed");

  if (savedBillingInfo) {
    const parsed = JSON.parse(savedBillingInfo);
    console.log("💾 Restored billing info from sessionStorage");
    setBillingInfo(parsed);
  }

  if (savedTermsAgreed === "true") {
    console.log("💾 Restored terms agreement from sessionStorage");
    setAgreedToTerms(true);
  }
}, []); // Only run once on mount
```

### 3. Auto-Create Checkout

**When:** Billing info restored + Session validated

**File:** `app/purchase/page.tsx` (line 160-176)

```typescript
useEffect(() => {
  const hasSavedBillingInfo = sessionStorage.getItem("flame_billing_info");
  const hasSavedTerms = sessionStorage.getItem("flame_terms_agreed") === "true";
  const hasDetails = rsvpDetails || holdDetails;

  // Auto-create checkout when conditions are met
  if (
    hasSavedBillingInfo &&
    hasSavedTerms &&
    hasDetails &&
    !checkoutId &&
    !creatingCheckout &&
    !error &&
    !loading
  ) {
    console.log("🔄 Auto-creating checkout with restored billing info");
    handleCreateCheckout();
  }
}, [rsvpDetails, holdDetails, checkoutId, creatingCheckout, error, loading]);
```

**Conditions:**

- ✅ Saved billing info exists
- ✅ Terms were agreed
- ✅ Session details loaded (rsvpDetails/holdDetails)
- ✅ No existing checkout
- ✅ Not currently creating one
- ✅ No errors
- ✅ Not loading

### 4. Smooth Scroll to Payment

**When:** Payment widget is ready

**File:** `app/purchase/page.tsx` (line 178-189)

```typescript
useEffect(() => {
  if (checkoutId && showPaymentForm) {
    console.log("📜 Scrolling to payment section");
    setTimeout(() => {
      const paymentSection = document.querySelector(".purchase-payment-widget");
      if (paymentSection) {
        paymentSection.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 500); // Small delay to ensure widget is rendered
  }
}, [checkoutId, showPaymentForm]);
```

**Why delay?** Ensures Datafast widget is fully rendered before scrolling.

### 5. Clear on Success

**When:** Purchase completes successfully

**File:** `app/purchase/page.tsx` (line 787-790)

```typescript
// Clear saved billing info on successful purchase
sessionStorage.removeItem("flame_billing_info");
sessionStorage.removeItem("flame_terms_agreed");
console.log("🧹 Cleared saved billing info (purchase successful)");
```

**Why:** Prevents auto-fill on next purchase.

### 6. Error Handling

**All errors show separate error page now (including RETRYABLE)**

**File:** `app/purchase/page.tsx` (line 686-695)

```typescript
// RETRYABLE: Show error page with "Try Again" button
// When user clicks Try Again, billing info will be restored from sessionStorage
if (apiErrorAction === "RETRY") {
  console.log("✅ RETRYABLE error - showing error page with Try Again");
  setCheckoutId(null);
  setError(errorMessage);
  setLoading(false);
  setProcessingPayment(false);
  return;
}
```

## Flow Diagram

### First Payment Attempt:

```
User fills billing → Proceed to Payment → Save to sessionStorage →
Create checkout → Datafast widget loads → User enters card →
Pay Now → ❌ Error (invalid cardholder)
```

### Retry Flow:

```
Error page shows → User clicks "Try Again" → Page reloads →
✅ Restore billing from sessionStorage →
✅ Auto-check terms →
✅ Auto-create checkout →
✅ Smooth scroll to payment →
User fixes card details → Pay Now → ✅ Success!
```

## Advantages vs. Inline Errors

### ✅ **Advantages:**

1. **Reliable:** No timing issues, no state management complexity
2. **Works with Datafast architecture:** Uses standard redirect flow
3. **Clear UX:** Separate error page makes it obvious something went wrong
4. **Still convenient:** Billing info preserved, minimal re-entry
5. **Smooth scroll:** Automatically positions user at payment widget
6. **Session preserved:** Same hold session, no new reservation needed

### ❌ **Previous Inline Approach Issues:**

1. Timing issues with `resourcePath` and state
2. "Unable to load reservation details" errors
3. Errors disappearing after redirect
4. Form resetting unexpectedly
5. Complex state management with refs

## Testing

### Test RETRYABLE Error Flow:

1. Go to `/purchase?session=XXX`
2. Fill billing info
3. Check terms
4. Click "Proceed to Payment"
5. Enter invalid cardholder (e.g., "Test123")
6. Click "Pay Now"
7. **Expected:** Error page shows with "Try Again" button
8. Click "Try Again"
9. **Expected:**
   - Billing info auto-filled ✅
   - Terms checkbox checked ✅
   - Payment widget loads automatically ✅
   - Page scrolls to payment section ✅
10. Fix cardholder name
11. Click "Pay Now"
12. **Expected:** Success! ✅

### Test NON-RECOVERABLE Error:

1. Follow steps 1-6 above
2. Enter card with insufficient funds
3. Click "Pay Now"
4. **Expected:** Error page shows "Browse Events" (no "Try Again")

## SessionStorage Keys

- `flame_billing_info`: JSON string of billing form data
- `flame_terms_agreed`: "true" if user agreed to terms

**Lifetime:** Until browser tab/window closes (not persisted to disk)

## Compatibility with Datafast Guide

This approach is **fully compatible** with the Datafast implementation guide:

- ✅ Uses standard Copy&Pay redirect flow (Section 3.1.2)
- ✅ Verifies payment with `resourcePath` (Section 3.1.3)
- ✅ Shows errors clearly to users (Section 4.2)
- ✅ Allows retry for appropriate errors (Section 4.3.2)
- ✅ Maintains PCI compliance (no card data stored)

**The only enhancement** is using `sessionStorage` to preserve billing info across retries, which improves UX without affecting Datafast integration.
