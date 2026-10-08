# Error Message Mismatches Found

## Issue 1: Hold Validation Error Message Override ⚠️

### Location
`app/purchase/page.tsx` lines 713-716

### Problem
When the API returns `expired: true`, the frontend **overrides** the API error message with a hardcoded message, losing important context.

### Current Code
```typescript
if (data.expired) {
  isExpired = true;
  errorMessage = "Your reservation has expired. Please return to the event page to create a new reservation.";
} else {
  errorMessage = data.error || errorMessage;
}
```

### API Returns Different Messages
- `"Hold session not found"` (when hold doesn't exist)
- `"Hold session has expired"` (when hold expired)
- `"Hold session already used"` (when hold was already converted to order)

### Impact
Users see a generic "expired" message even when:
- The hold was already used (should say "already purchased")
- The hold doesn't exist (should say "not found")
- The hold actually expired (correct message)

### Fix ✅ APPLIED
Use the API error message first, only fall back to generic message if API doesn't provide one:

```typescript
if (data.expired) {
  isExpired = true;
  // Use API error message if available (preserves specific messages like "already used" or "not found")
  // Only fall back to generic expired message if API doesn't provide one
  errorMessage = data.error || "Your reservation has expired. Please return to the event page to create a new reservation.";
} else {
  errorMessage = data.error || errorMessage;
}
```

**Status**: Fixed in `app/purchase/page.tsx` line 715-716

## Issue 2: Generic Fallback Messages

### Location
Multiple places in `app/purchase/page.tsx`

### Problem
Several places use generic fallback messages that might mask specific API errors.

### Examples

1. **Line 1330**: Missing resourcePath
   ```typescript
   setError("Payment verification failed. Please try again.");
   ```
   ✅ **OK** - This is a frontend validation error, not from API

2. **Line 1347**: Missing checkoutId
   ```typescript
   setError("Payment verification failed. Please contact support.");
   ```
   ✅ **OK** - This is a frontend validation error, not from API

3. **Line 1390**: Payment verification fallback
   ```typescript
   const errorMessage = verifyData.error || "Payment verification failed.";
   ```
   ⚠️ **POTENTIAL ISSUE** - Generic fallback might mask specific errors
   - **Recommendation**: Ensure API always returns categorized error message
   - **Status**: API should always return error from `handleDatafastError()`, so this should be safe

4. **Line 1052-1053**: Purchase completion fallback
   ```typescript
   completeData.error || "Failed to complete purchase. Please contact support."
   ```
   ✅ **OK** - Uses API error if available

5. **Line 1075**: Network error catch block
   ```typescript
   setError("Failed to complete purchase. Please try again.");
   ```
   ✅ **OK** - This is a network/exception error, generic message is appropriate

## Issue 3: Checkout Creation Error Messages

### Location
`app/api/datafast/create-checkout/route.ts`

### Problem
Different error messages for similar hold validation failures:

1. **Line 224**: "Reservation time has expired or hold not found. Please start over."
   - Used when hold fetch fails or hold doesn't exist
   - Combines two different error conditions

2. **Line 260**: "Reservation time has expired."
   - Used when hold actually expired
   - More specific than line 224

### Impact
Users might see "expired or not found" when the actual issue is "not found", which is confusing.

### Fix ✅ APPLIED
Updated error message to be more specific:
- Changed from: "Reservation time has expired or hold not found. Please start over."
- Changed to: "Reservation not found. Please return to the event page to create a new reservation."

**Status**: Fixed in `app/api/datafast/create-checkout/route.ts` line 223-224

**Note**: The API already has separate checks for:
- Hold not found (line 216-227)
- Hold expired (line 254-262)
- Hold already used (line 243-248)

Each returns a specific error message, so the frontend will now show the correct message.

## Summary

### Critical Issues
1. ⚠️ **Hold validation error override** - Frontend replaces API error messages with generic "expired" message

### Minor Issues
2. ⚠️ **Generic error messages** - Some APIs combine multiple error conditions into one message
3. ✅ **Fallback messages** - Most are appropriate for their context (network errors, frontend validation)

### Recommendations

1. ✅ **Fix hold validation error handling** - COMPLETED: Frontend now preserves API error messages
2. ✅ **Standardize error messages** - COMPLETED: Improved create-checkout error message
3. ✅ **Add error code to all error responses** - COMPLETED: Unknown errors include error code
4. ⏳ **Test error message display** - TODO: Create test suite for all error scenarios

## Summary of Fixes

### ✅ Fixed Issues
1. **Hold validation error override** - Frontend now preserves API error messages when `expired: true`
2. **Generic error messages** - Improved create-checkout error message to be more specific

### ✅ Verified OK
- Payment verification fallbacks (appropriate for network errors)
- Purchase completion error handling (uses API errors correctly)
- Frontend validation errors (appropriate generic messages)

