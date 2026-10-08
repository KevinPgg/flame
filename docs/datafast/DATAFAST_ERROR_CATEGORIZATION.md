# Datafast Error Categorization & Flow

> ⚠️ **Legacy System**: This document describes the Datafast payment system, which remains active for existing transactions but is in maintenance mode. For new features and transactions, see [Stripe Implementation](../stripe-implementation/). Both systems coexist during the transition period (see [Payment Systems Evolution](../PAYMENT_SYSTEMS_EVOLUTION.md)).

---

## Quick Summary: User Experience (Historical Datafast Implementation)

### ✅ **For Simple Mistakes** (Wrong CVV, Wrong Expiry, etc.):

1. User enters wrong info and clicks "Pay Now"
2. Error appears **inline below the payment form**
3. User corrects the mistake and clicks "Pay Now" again
4. **That's it!** No extra pages, no "Try Again" buttons

### ❌ **For Card Issues** (Lost Card, Insufficient Funds, etc.):

1. Payment fails with card-specific error
2. **Separate error page** with "Browse Events" button
3. User needs to use a different card or go back to events

---

## Technical Summary of Changes

Fixed the error page button logic to use the `action` field from the API response instead of doing string matching on error messages.

### What Was Changed:

1. **Added `errorAction` state** to `app/purchase/page.tsx`
   - Stores the action type returned from the Datafast API
2. **Updated error handlers** to set `errorAction`

   - Payment verification errors (line 640)
   - Purchase completion errors (line 713)

3. **Updated error display logic** (line 794-795)

   - Now checks `errorAction === "RETRY"` instead of `error.includes("try again")`
   - Now checks `errorAction === "CONTACT_SUPPORT"` instead of `error.includes("support@flame-events.com")`

4. **RETRYABLE errors now show inline** (line 654-666)

   - Keep `checkoutId` active (DON'T clear it)
   - Show error inline below payment widget using `setWidgetError()`
   - Clear `resourcePath` from URL to prevent re-processing
   - User can immediately correct and retry without page reload

5. **Moved `800.100.174` (invalid amount)** from RETRYABLE to NON_RECOVERABLE
   - Users can't fix this error by retrying - they need a fresh session

## Error Categories & Actions

### ✅ RETRYABLE → Action: `RETRY` → **Inline Error (Form Stays Visible)**

**What Happens:**

- Payment form **stays visible** with all fields preserved
- Error message appears **inline below the payment widget**
- User corrects the error and clicks **"Pay Now"** to retry
- NO separate error page, NO reload, NO "Try Again" button needed

**User Input Errors** (can be corrected):

- `800.100.157` - Wrong expiry date
- `800.100.151` - Invalid card number
- `800.100.402`, `100.100.402` - Invalid cardholder name
- `100.100.400` - Missing cardholder name
- `100.100.100` - Incomplete card info
- `100.400.311` - Format error

**Temporary Issues** (may work on retry):

- `800.100.176` - Card temporarily unavailable
- `800.100.152` - Generic decline (bank may approve on retry)
- `800.100.197` - User cancelled
- `19`, `88`, `91` - Retry recommended by bank
- `900.100.100`, `900.100.200` - Connection/timeout errors

**3DS Authentication Issues**:

- `100.380.401` - Wrong 3DS code (user can retry)
- `100.380.501`, `100.396.103` - 3DS timeout

**Temporary Blocks** (wait 48 hours):

- `800.300.500` - Too many incorrect CVV attempts
- `800.300.501` - Too many incorrect expiry date attempts

### ❌ NON-RECOVERABLE → Action: `NEW_TRANSACTION` → **Separate Error Page**

**What Happens:**

- Shows **separate error page** with error message
- Primary button: **"Browse Events"** (returns to /events)
- User needs to use a **different card** or create **new session**

**Card Status Issues** (need different card):

- `800.100.165`, `41` - Lost card
- `800.100.159`, `43` - Stolen card
- `800.100.168`, `62` - Restricted card
- `100.100.303`, `54` - Expired card
- `800.100.155`, `51` - Insufficient funds
- `76` - Invalid account

**Transaction Restrictions**:

- `800.100.170`, `57` - Transaction not permitted with this card
- `800.100.179`, `800.100.162` - Transaction limit exceeded
- `800.110.100` - Duplicate transaction
- `800.100.501` - Recurring payments blocked by cardholder

**System Configuration Issues**:

- `600.200.201` - Payment method not configured
- `600.200.500` - Card brand not supported
- `100.400.147`, `100.400.149` - Fraud/security rules triggered
- `80` - Cannot process at this time
- **`800.100.174` - Invalid amount** (session expired or misconfigured)

### 🔧 TECHNICAL → Action: `CONTACT_SUPPORT` → Button: "Contact Support"

**Request/Format Errors**:

- `200.100.101` - Invalid request
- `200.100.103` - Structural errors
- `100.700.801` - Invalid identification

**Configuration Errors**:

- `800.100.190` - Configuration issue
- `800.100.199` - Tax calculation error
- `ER` - Merchant config error

**Transaction Processing Errors**:

- `700.300.700` - Reversal failed
- `700.100.200` - Amount mismatch
- `700.400.200` - Refund error

**Gateway/System Errors**:

- `900.100.201` - Gateway connection lost
- `900.100.300` - No response from gateway
- `100.400.325` - Risk system unavailable
- `100.390.108`, `100.390.112` - 3DS system errors

## Special Case: `800.100.174` (Invalid Amount)

This error was moved from **RETRYABLE** to **NON-RECOVERABLE** because:

1. **User can't fix it** - The amount is controlled by the system, not user input
2. **Indicates session issue** - Usually means:
   - Hold session expired and price changed
   - System miscalculation
   - Currency/decimal format error
3. **Solution** - User needs to go back to event listing and create a fresh reservation

### Error Message:

```text
Invalid amount. Please go back to the event listing and create a new reservation.
Contact support if the problem persists.
```

### Button Shown:

- Primary: "Browse Events" (returns to /events)

## Testing

To test the error categorization:

1. **Test RETRYABLE error** (e.g., wrong CVV):

   - Payment form remains visible with fields preserved
   - Inline error appears below the payment widget
   - User corrects the error and clicks "Pay Now" to retry
   - No separate error page or page reload

2. **Test NON-RECOVERABLE error** (e.g., invalid amount):

   - Should show "Browse Events" button (primary)
   - No "Try Again" button

3. **Test TECHNICAL error** (e.g., system config):
   - Should show "Contact Support" button
   - Should show "Browse Events" button
   - Error message includes support email

## Implementation Details

### Frontend (`app/purchase/page.tsx`):

```typescript
const [errorAction, setErrorAction] = useState<
  "RETRY" | "NEW_TRANSACTION" | "CONTACT_SUPPORT" | null
>(null);

// When error occurs:
setErrorAction(apiErrorAction);
setError(errorMessage);

// In error display:
const isRetryable = errorAction === "RETRY";
const isSupport = errorAction === "CONTACT_SUPPORT";
```

### Backend (`app/lib/datafast-error-handler.ts`):

```typescript
export function categorizeDatafastError(code: string): DatafastError {
  if (code in NON_RECOVERABLE_CODES) {
    return { action: "NEW_TRANSACTION", ... };
  }
  if (code in RETRYABLE_CODES) {
    return { action: "RETRY", ... };
  }
  if (code in TECHNICAL_CODES) {
    return { action: "CONTACT_SUPPORT", ... };
  }
  // Default: safest option
  return { action: "CONTACT_SUPPORT", ... };
}
```

## Notes

- Unknown error codes default to `CONTACT_SUPPORT` (safest option)
- The `action` field is the source of truth for button display
- Error messages are user-friendly and actionable
- All errors are logged to `datafast_transactions` table for debugging
