# Merchant Transaction ID Uniqueness Fix

## Issue

According to Datafast implementation guide section 3.2.1.6:

> "este identificador debe ser único por transacción así sea rechazada en su primer intento"
>
> Translation: "this identifier must be unique per transaction **even if it is rejected on its first attempt**"

**Problem**: Our implementation was reusing the same `merchantTransactionId` when a user clicked "Try Again" after a payment failure, violating Datafast's requirement.

## Previous Implementation

```typescript
const merchantTransactionId = `order_${
  orderDetails.orderId || Date.now()
}_${userId}`;
// Example for same hold session:
// - First attempt:  "order_abc123_user456"
// - Retry attempt:  "order_abc123_user456"  ❌ SAME ID!
```

## Fixed Implementation

```typescript
const merchantTransactionId = `order_${
  orderDetails.orderId || "new"
}_${Date.now()}_${userId}`;
// Example for same hold session:
// - First attempt:  "order_abc123_1729468801234_user456"
// - Retry attempt:  "order_abc123_1729468945678_user456"  ✅ UNIQUE!
// - Retry attempt:  "order_abc123_1729469012345_user456"  ✅ UNIQUE!
```

## Why This Matters

1. **Datafast Requirement**: Each transaction attempt must have a unique identifier, regardless of whether it's the same order/session being retried.

2. **Transaction Tracking**: This allows Datafast's system to properly track:

   - Which payment attempts were rejected
   - Which are new attempts
   - Transaction history and audit trails

3. **System Integrity**: Prevents confusion in Datafast's backend about whether a request is:
   - A duplicate submission
   - A new retry attempt
   - A verification request for an existing transaction

## Implementation Details

**File Modified**: `app/api/datafast/create-checkout/route.ts`

**Change**: Added `Date.now()` timestamp to ensure each checkout creation generates a unique `merchantTransactionId`, even when retrying the same hold session after a payment failure.

**When This Matters**:

- User gets a declined transaction (wrong card info, insufficient funds, etc.)
- User clicks "Try Again" on error page
- Billing info is restored from sessionStorage
- New checkout is created automatically
- **Now**: Gets a fresh, unique `merchantTransactionId` ✅

## Related Files

- `app/purchase/page.tsx` - Implements the "Try Again" flow with sessionStorage
- `app/lib/datafast-error-handler.ts` - Categorizes errors as RETRYABLE vs NON_RECOVERABLE
- `docs_guides/OPTION_A_RETRY_FLOW.md` - Documents the retry flow implementation

## Testing

To verify this fix:

1. Create a hold session
2. Enter billing info and click "Proceed to Payment"
3. Use test card that will be declined (e.g., `4200000000000000` with cardholder name missing)
4. Get error page
5. Click "Try Again"
6. Check server logs - `merchantTransactionId` should have a new timestamp
7. Complete payment successfully

Each attempt should log a unique `merchantTransactionId` in:

- Server console
- `datafast_transactions` table in database
- Datafast's backend system
