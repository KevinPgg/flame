# Promotional Code Race Condition Bug Fix

## Summary

Fixed a critical bug in the direct purchase flow where promotional code race conditions would silently fail, causing users to be charged full price despite entering a valid promotional code.

## The Bug

**Location:** `app/api/purchase/complete-direct/route.ts`

**Issue:** The code attempted an atomic update of the promotional code `usage_count` using optimistic locking:

```typescript
const { data: updatedPromo } = await supabaseAdmin
  .from("promotional_codes")
  .update({ usage_count: promoCode.usage_count + 1 })
  .eq("id", promotional_code_id)
  .eq("usage_count", promoCode.usage_count)  // Optimistic lock
  .select()
  .single();

// BUG: Silently continued without discount if update failed!
if (updatedPromo) {
  promoCodeApplied = true;
  discountAmountCents = calculateDiscount(...);
}
// If updatedPromo is null, code just continues with no discount and no error!
```

**Problem:** When two users simultaneously tried to use the same promotional code:

1. User A fetches promo code (usage_count = 0)
2. User B fetches promo code (usage_count = 0)
3. User A's atomic update succeeds (usage_count = 1)
4. User B's atomic update fails (WHERE clause no longer matches)
5. User B's request continues without applying the discount
6. User B is charged full price with NO ERROR MESSAGE

**Impact:** Users who entered valid promotional codes during concurrent usage would be charged full price without explanation, causing confusion and support issues.

## The Fix

### Complete Direct Purchase (`complete-direct/route.ts`)

Changed the promotional code validation to fail fast with clear error messages:

```typescript
// Validate promo code exists and is valid for this event
if (!promoCode || fetchError) {
  return NextResponse.json(
    { error: "Invalid promotional code. Please verify and try again." },
    { status: 400 }
  );
}

if (promoCode.event_id !== rsvpDetails.event_id) {
  return NextResponse.json(
    { error: "This promotional code is not valid for this event." },
    { status: 400 }
  );
}

if (promoCode.usage_count >= promoCode.usage_limit) {
  return NextResponse.json(
    {
      error: "This promotional code has reached its usage limit. Please try another code.",
    },
    { status: 400 }
  );
}

// Atomic increment with WHERE clause to prevent race conditions
const { data: updatedPromo } = await supabaseAdmin
  .from("promotional_codes")
  .update({ usage_count: promoCode.usage_count + 1 })
  .eq("id", promotional_code_id)
  .eq("usage_count", promoCode.usage_count)
  .select()
  .single();

// NEW: Check if update succeeded - if not, there was a race condition
if (!updatedPromo) {
  return NextResponse.json(
    {
      error: "This promotional code was just used by another customer. Please try again to apply your discount.",
      retry: true,
    },
    { status: 409 }  // Conflict status
  );
}

// Only reached if update succeeded - safe to apply discount
promoCodeApplied = true;
discountAmountCents = calculateDiscount(...);
```

### Complete Hold Purchase (`complete-hold/route.ts`)

**Status:** ✅ Already correct - uses database function with row-level locking

The hold purchase flow uses the `complete_hold_purchase()` database function which properly handles promotional codes atomically:

1. Locks promotional code row with `FOR UPDATE` (prevents concurrent access)
2. Validates promotional code and calculates discount
3. Creates order
4. Increments usage count
5. All within a single database transaction

If any step fails, the entire transaction rolls back automatically. No race condition possible.

## Key Improvements

1. **Explicit Validation:** All promotional code validation errors now return clear error messages
2. **Race Condition Detection:** Failed atomic updates are detected and reported to the user
3. **User-Friendly Error Messages:** Users understand exactly what went wrong and can retry
4. **HTTP 409 Conflict:** Proper status code for concurrent resource access
5. **Retry Flag:** Response includes `retry: true` to indicate the user should try again

## Testing Recommendations

### Manual Testing

1. **Single User:** Verify promo code applies correctly
2. **Invalid Code:** Verify clear error messages for invalid codes
3. **Expired Code:** Verify usage limit enforcement
4. **Wrong Event:** Verify event validation

### Race Condition Testing

To simulate the race condition:

1. Create a promotional code with `usage_limit = 1`
2. Open two browser sessions
3. Both users add items to cart with the promo code
4. Both users click "Complete Purchase" simultaneously
5. **Expected Result:**
   - First user: Purchase succeeds with discount
   - Second user: Gets error "This promotional code was just used by another customer. Please try again"
   - Second user can retry without the code or with a different code

## Related Code

- **Direct Purchase:** `app/api/purchase/complete-direct/route.ts` (FIXED)
- **Hold Purchase:** `app/api/purchase/complete-hold/route.ts` (Already correct)
- **Promo Validation:** `app/api/purchase/validate-promo-code/route.ts` (Read-only, no changes needed)
- **Database Function:** `supabase/migrations/20251025150000_validate_monetary_amounts_in_complete_hold_purchase.sql` (Atomic implementation)
- **Rollback Utility:** `app/lib/utils/promo-code-rollback.ts` (Used for error cleanup)

## Security Implications

This fix prevents a potential exploitation scenario where a malicious user could:

1. Get a promotional code working in one session
2. Simultaneously submit multiple purchases
3. Potentially exceed the usage limit due to race conditions

Now, only the exact number of allowed uses can succeed, with proper atomic counting.
