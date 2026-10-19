# QR Code Test Gap Analysis

## Problem Summary

The bug where hold-based purchase routes (`complete-hold` and `complete-hold-free`) generated QR codes with the old format was **not caught by existing tests**, even though we have comprehensive QR code validation tests.

## Why Tests Didn't Catch It

### ✅ What Tests DO Cover

1. **QR Code Format Validation** (`purchase-flow.test.ts` lines 413-497)

   - Tests that a QR code object has required fields (`orderId`, `eventId`, `ticketNumber`, `qrToken`)
   - Tests that old format is rejected
   - **BUT**: Only tests validation logic, not actual generation

2. **QR Scanner Parsing** (`qr-scanner.integration.test.tsx` lines 90-208)

   - Tests that scanner can parse QR codes correctly
   - Tests that old format QR codes are rejected
   - **BUT**: Only tests parsing logic, not generation

3. **QR Code Data Structure** (`purchase-flow.test.ts` lines 499-522)
   - Tests expected QR code structure
   - **BUT**: Only tests mock data structure, not actual API output

### ❌ What Tests DON'T Cover

1. **API Route QR Code Generation**

   - ❌ No tests that call `/api/purchase/complete-hold` and verify QR format
   - ❌ No tests that call `/api/purchase/complete-hold-free` and verify QR format
   - ❌ No tests that call `/api/purchase/complete-direct` and verify QR format
   - ❌ No tests that call `/api/purchase/complete-direct-free` and verify QR format

2. **End-to-End QR Code Generation**

   - ❌ No tests that simulate a purchase and verify the generated QR code format
   - ❌ No tests that check QR codes stored in the database after purchase

3. **Code Path Coverage**
   - ❌ Tests validate format but don't test the code paths that generate QR codes
   - ❌ Unit tests mock QR generation, so they don't catch bugs in actual generation logic

## The Bug That Wasn't Caught

### Bug Location

- `app/api/purchase/complete-hold/route.ts` (lines 215-221)
- `app/api/purchase/complete-hold-free/route.ts` (lines 192-198)

### What Was Wrong

```typescript
// OLD (BUGGY) CODE - Generated old format
const qrCodeData = JSON.stringify({
  ticket_id: qrToken, // ❌ Old format
  event_id: hold.event_id, // ❌ Old format
  tier_id: hold.tier_id, // ❌ Old format
  attendee_email: currentUser.email,
  timestamp: new Date().toISOString(),
});
```

### What Should Have Been

```typescript
// NEW (CORRECT) CODE - Generates new format
const qrData = {
  orderId: orderId, // ✅ New format
  eventId: hold.event_id, // ✅ New format
  userId: currentUser.id, // ✅ New format
  tierName: hold.ticket_tiers.name,
  eventName: hold.events.name,
  ticketNumber: i + 1,
  qrToken: qrToken,
  timestamp: new Date().toISOString(),
};
```

## Test Coverage Gap

| Test Type                                                    | What It Tests                      | What It Misses                   |
| ------------------------------------------------------------ | ---------------------------------- | -------------------------------- |
| **Unit Tests** (`purchase-flow.test.ts`)                     | QR code format validation function | Actual API route QR generation   |
| **Integration Tests** (`qr-scanner.integration.test.tsx`)    | QR scanner parsing logic           | QR code generation in API routes |
| **Integration Tests** (`purchase-page.integration.test.tsx`) | Purchase page component logic      | QR code generation in API routes |
| **Missing**                                                  | ❌ API route integration tests     | QR code generation verification  |

## Solution: Add API Route Integration Tests

### New Test File: `purchase-api-routes-qr-code.test.ts`

This test file should:

1. **Mock the API routes** and verify QR code generation:

   ```typescript
   it("should generate correct QR format in complete-hold route", async () => {
     // Call the route handler
     // Verify QR code format in response/ticket
   });
   ```

2. **Test actual QR code generation patterns**:

   - Hold-based purchases (paid and free)
   - Direct purchases (paid and free)
   - Multiple tickets per order
   - Stage pricing scenarios

3. **Verify QR codes match scanner expectations**:
   - Extract QR code from API response
   - Validate format using existing `validateQRCodeFormat` function
   - Ensure no old format fields exist

### Already Added: `purchase-api-qr-code.test.ts`

✅ **What it does:**

- Tests QR code generation patterns (simulated)
- Validates format against scanner expectations
- Catches old format bugs
- Tests edge cases

⚠️ **What it still doesn't do:**

- Doesn't actually call the API routes
- Doesn't test end-to-end purchase flow
- Doesn't verify QR codes stored in database

## Recommendations

### Short Term (Done ✅)

- ✅ Added `purchase-api-qr-code.test.ts` with pattern validation tests
- ✅ Fixed the bug in `complete-hold` and `complete-hold-free` routes

### Medium Term (Recommended)

1. **Add API route integration tests** that:

   - Mock Supabase calls
   - Call actual route handlers
   - Verify QR codes in response
   - Test all purchase paths (hold, direct, paid, free)

2. **Add E2E tests** that:
   - Create a test purchase
   - Verify QR code in database
   - Test QR code scanning

### Long Term (Ideal)

1. **Set up test database** for integration tests
2. **Add CI/CD test coverage** reports
3. **Add automated QR code scanning tests**

## Test Coverage Matrix

| Purchase Route                       | QR Generation Tested? | Format Validation Tested? |
| ------------------------------------ | --------------------- | ------------------------- |
| `/api/purchase/complete-hold`        | ❌ No                 | ✅ Yes (indirect)         |
| `/api/purchase/complete-hold-free`   | ❌ No                 | ✅ Yes (indirect)         |
| `/api/purchase/complete-direct`      | ❌ No                 | ✅ Yes (indirect)         |
| `/api/purchase/complete-direct-free` | ❌ No                 | ✅ Yes (indirect)         |

**Key Insight:** Format validation exists, but **generation verification** is missing.

## Conclusion

The existing tests validate QR code format but don't test the actual code paths that generate QR codes in API routes. This created a gap where:

- ✅ Tests would catch bad QR codes if they existed
- ❌ Tests wouldn't catch bugs in QR code generation logic

**Solution:** Add API route integration tests that verify QR code generation, not just format validation.
