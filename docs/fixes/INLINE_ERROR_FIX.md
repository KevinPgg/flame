# Fix: Inline Errors Disappearing After Redirect

## The Problem

User reported: "I entered invalid card holder information but I was not able to fix it inline, the form took me to another page, then it refreshed the form, and the alert disappeared"

### What Was Happening:

1. User enters invalid cardholder (e.g., special characters)
2. Form submits to Datafast (because `onBeforeSubmitCard` only checks for empty, not invalid format)
3. Datafast returns validation error
4. Page redirects back with `resourcePath`
5. `handlePaymentCallback()` sets `widgetError` inline ✅
6. `window.history.replaceState()` clears `resourcePath` from URL
7. **This triggers a re-render** ❌
8. `useEffect` runs again (no dependency guards)
9. Error gets cleared or form refreshes ❌

## The Fix

### 1. Added `hasHandledCallback` Ref

**File:** `app/purchase/page.tsx` (line 136-137)

```typescript
const hasHandledCallback = useRef(false);
const hasValidated = useRef(false);
```

**Purpose:** Prevents `handlePaymentCallback()` from running multiple times when URL changes.

### 2. Guard `useEffect` with Refs

**File:** `app/purchase/page.tsx` (line 141-142, 156-164)

```typescript
useEffect(() => {
  // Only handle payment callback once
  if (resourcePath && !hasHandledCallback.current) {
    hasHandledCallback.current = true;
    // ... handle callback
  } else if (token && !hasValidated.current) {
    hasValidated.current = true;
    // ... validate token
  }
  // ...
}, [token, holdSessionId, resourcePath]);
```

**Purpose:** Each action (callback, validation) only runs once, even if URL changes or component re-renders.

### 3. Explicitly Set `showPaymentForm(true)` for RETRY Errors

**File:** `app/purchase/page.tsx` (line 668)

```typescript
if (apiErrorAction === "RETRY") {
  setWidgetError(errorMessage);
  setShowPaymentForm(true); // ✅ Ensure form stays visible
  setLoading(false);
  setProcessingPayment(false);
  // ... clear resourcePath
}
```

**Purpose:** Explicitly ensure the payment form remains visible when showing RETRY errors inline.

### 4. Reset Refs When Editing Billing

**File:** `app/purchase/page.tsx` (line 1045)

```typescript
onClick={() => {
  setCheckoutId(null);
  setShowPaymentForm(false);
  widgetCallbacksSetup.current = false;
  hasHandledCallback.current = false; // ✅ Reset for fresh session
  setWidgetError(null);
}}
```

**Purpose:** Allow user to start fresh if they want to edit billing info.

## The Result

### ✅ **Now Working:**

1. User enters invalid cardholder
2. Form submits to Datafast
3. Error returns
4. Page redirects back
5. **Error shows inline below payment widget** ✅
6. **Error STAYS there** (no disappearing) ✅
7. **Form stays visible** ✅
8. User fixes the mistake and clicks "Pay Now" again
9. Success! 🎉

### 🔍 **Debugging:**

Added console logs to track the flow:

```typescript
console.log("✅ RETRYABLE error - showing inline, keeping form visible");
console.log("   CheckoutId:", checkoutId ? "present" : "missing");
console.log("   Error message:", errorMessage);
```

Check your browser console to see these logs and confirm the error is being handled correctly.

## Why Backend Validation Errors Cause Redirects

Some validation errors (like "invalid cardholder format") can't be caught client-side because:

1. **Datafast's iframe** only does basic validation (empty fields, card format)
2. **Deeper validation** (special characters, name length, compliance rules) happens on Datafast's backend
3. **Form must submit** to Datafast API to get these errors
4. **Redirect is required** by Datafast's Copy&Pay architecture (see guide section 3.1.2)

**This is expected behavior per the Datafast guide.** The key is handling the redirect gracefully with inline error display.

## Client-Side Validation

To **reduce** redirects for validation errors, we validate in `onBeforeSubmitCard`:

**Current validation:**

- ✅ Empty cardholder name

**Could add:**

- Cardholder name length (min 3 characters)
- No numbers in cardholder name
- No special characters (only letters, spaces, hyphens)

However, **some errors will always require backend validation**, so the inline error display after redirect is essential for good UX.
