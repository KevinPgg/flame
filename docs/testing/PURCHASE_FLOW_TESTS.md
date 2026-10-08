# Purchase Flow Integration Tests

## Overview

This test suite validates critical purchase flow scenarios to prevent regressions of bugs we've fixed, including:

- ✅ **Stage pricing calculations** in all payment flows
- ✅ **RSVP and direct purchase** paths with stage pricing
- ✅ **Promotion code calculations** using stage prices
- ✅ **QR code generation** and format validation
- ✅ **QR scanner component** integration tests
- ✅ **Price display consistency** across all UI components
- ✅ **Stripe payment processing** without errors

## Payment System

Flame uses **Stripe Connect** for all payment processing:

- **Direct purchases**: Stripe PaymentElement with immediate capture
- **RSVP flow**: Auth & Capture (authorize on request, capture on approval)
- **Fee-on-top pricing**: Platform fee added to base price
- **No billing form required**: Stripe handles all payment details

## Test Files

### Unit Tests (Logic Only)

- `purchase-flow.test.ts` - Tests calculation logic with mock functions (54 tests)

### Integration Tests (Actual Components)

- `purchase-page.integration.test.tsx` - Tests actual PurchasePage component (18+ tests)
  - Free/paid ticket detection
  - Promo code application flow (15% and 100%)
  - Checkout creation with stage pricing
  - Multiple quantities with promo codes
- `qr-scanner.integration.test.tsx` - Tests actual QRScannerApp component (15+ tests)

## Critical Bugs Prevented

### 1. **Unit Price Mismatch Error**

**Problem:** Payment went through but tickets weren't created because backend expected tier price ($0) but received stage price ($3.35)

**Test Coverage:**

- `should prevent 'Unit price mismatch' error for stage-priced tickets`
- `should handle regular stage price correctly`

### 2. **Price Display vs Payment Mismatch**

**Problem:** Users saw stage price ($3.35) but were charged tier price ($0 or $5)

**Test Coverage:**

- `should show same price in display and payment calculations`
- `should prevent price mismatch bug (display vs payment)`
- `should show correct price in all UI components`

### 3. **Promotion Code Calculation Errors**

**Problem:** Promo codes calculated discounts from tier price instead of stage price

**Test Coverage:**

- `should calculate promo discount from stage price, not tier price`
- `should calculate promo discount correctly for multiple tickets`
- `should handle 100% discount correctly (free tickets)`

### 4. **QR Code Format Errors**

**Problem:** QR codes used old format (`ticket_id`) instead of new format (`orderId`, `ticketNumber`)

**Test Coverage:**

- `should validate correct QR code format`
- `should reject old QR code format (ticket_id instead of orderId)`
- `should generate QR code with all required fields for scanner`

## Test Structure

### 1. Stage Pricing Calculations

Tests ensure stage pricing is used correctly in:

- RSVP purchases
- Direct (hold) purchases
- Fallback to tier price when no stage pricing

### 2. Promotion Code Calculations

Tests verify promo codes:

- Calculate from stage price (not tier price)
- Work correctly for multiple tickets
- Handle 100% discounts (free tickets)

### 3. QR Code Generation

Tests validate:

- Correct QR code format with all required fields
- Rejection of old/invalid formats
- Scanner compatibility

### 4. Payment Processing

Tests ensure:

- Free ticket detection works correctly
- Price consistency across all calculation points
- No unit price mismatches

### 5. Critical Bug Scenarios

Tests specifically prevent:

- Unit price mismatch errors
- Price display bugs
- Calculation inconsistencies

## Running the Tests

### Run All Purchase Flow Tests

```bash
pnpm test:run __tests__/purchase-flow.test.ts
```

### Run Specific Test Suite

```bash
# Test stage pricing calculations
pnpm vitest -t "Stage Pricing Calculations"

# Test QR code validation
pnpm vitest -t "QR Code Generation"

# Test critical bugs
pnpm vitest -t "Critical Bug Scenarios"
```

### Watch Mode (Development)

```bash
pnpm test __tests__/purchase-flow.test.ts
```

## Test Coverage

### ✅ Covered Scenarios

1. **RSVP Purchase Flow**

   - Stage pricing used when available
   - Fallback to tier price when no stage pricing
   - Free stage pricing (0 cents)

2. **Direct Purchase (Hold) Flow**

   - Stage pricing used when available
   - Fallback to tier price when no stage pricing

3. **Promotion Codes**

   - Discount calculated from stage price
   - Multiple tickets handling
   - 100% discount (free tickets)

4. **Price Consistency**

   - Display vs payment matching
   - All UI components show same price
   - Promo validation vs checkout matching

5. **QR Code Validation**

   - Correct format validation
   - Old format rejection
   - Required fields checking

6. **Edge Cases**

   - Null/undefined handling
   - Zero price handling
   - Free ticket detection

### 🔄 Future Test Additions

Consider adding integration tests for:

1. **API Endpoint Tests**

   - `/api/purchase/create-payment-intent` with stage pricing
   - `/api/holds/validate` returns stage pricing
   - Stripe webhook handling

2. **E2E Tests** (with Playwright/Cypress)
   - Complete purchase flow from UI
   - QR code scanning workflow
   - Price display verification

## Expected Test Results

All 69+ tests should pass (54 unit tests + 18+ integration tests):

```text
✓ Purchase Flow - Stage Pricing Calculations (8 tests)
  ✓ RSVP Purchase Flow (3 tests)
  ✓ Direct Purchase (Hold) Flow (2 tests)
  ✓ Promotion Code Calculations (3 tests)

✓ Price Display Consistency (2 tests)

✓ QR Code Generation and Validation (6 tests)
  ✓ QR Code Format Validation (5 tests)
  ✓ QR Code Data Structure (1 test)

✓ Payment Processing Scenarios (4 tests)
  ✓ Free Ticket Detection (2 tests)
  ✓ Price Calculation Consistency (2 tests)

✓ Critical Bug Scenarios (3 tests)
  ✓ Unit Price Mismatch Bug (2 tests)
  ✓ Price Display Bug Prevention (1 test)

✓ Edge Cases and Error Prevention (3 tests)
  ✓ Null/Undefined Handling (2 tests)
  ✓ Zero Price Handling (1 test)

✓ Integration Scenarios (3 tests)
  ✓ Complete Purchase Flow - Staged Tier (1 test)
  ✓ Complete Purchase Flow - Free Stage (1 test)

✓ Purchase Page Integration Tests (18+ tests)
  ✓ Free Ticket Flows (2 tests)
  ✓ Paid Ticket Flows (2 tests)
  ✓ Promotion Code Flows (2 tests)
  ✓ Price Display Consistency (1 test)
  ✓ Promo Code Application Flow (2 tests)
  ✓ Checkout Creation (2 tests)
  ✓ Stage Pricing Late Load (1 test)
  ✓ Multiple Quantities with Promo (1 test)
```

## Interpreting Test Failures

### If stage pricing tests fail:

- Check that `stage_price_cents` is being used in calculations
- Verify fallback logic to `ticketTier.price_cents` works correctly

### If QR code tests fail:

- Verify QR code generation uses new format (`orderId`, `ticketNumber`, `qrToken`)
- Check that old format (`ticket_id`) is rejected

### If price consistency tests fail:

- Check all calculation points use the same `calculateUnitPrice` logic
- Verify promo codes calculate from stage price, not tier price

### If critical bug tests fail:

- **URGENT:** This indicates a regression of bugs we've fixed
- Review recent changes to purchase flow calculations
- Verify stage pricing is used consistently everywhere

## Integration with CI/CD

Add to your CI pipeline:

```yaml
- name: Run Purchase Flow Tests
  run: pnpm test:run __tests__/purchase-flow.test.ts
```

These tests should run on every PR to prevent regressions.

## Maintenance

### When Adding New Features

1. **Add tests first** (TDD approach)
2. **Ensure stage pricing is considered** in new calculations
3. **Update tests** if calculation logic changes
4. **Run full test suite** before merging

### When Fixing Bugs

1. **Write test** that reproduces the bug
2. **Fix the bug**
3. **Verify test passes**
4. **Keep test** to prevent regression

## Related Documentation

- [Ticket Stages Tests](./ticket-stages.test.ts) - Tests stage transition logic
- [Stripe Connect Implementation](../STRIPE_CONNECT_FRONTEND_IMPLEMENTATION.md) - Payment implementation
- [Stage Pricing Migration](../supabase/migrations/20251104200000_fix_complete_hold_purchase_stage_pricing_validation.sql) - Database function fix

## Questions?

If tests fail or you need to add new scenarios:

1. Review existing test patterns
2. Check [Vitest Documentation](https://vitest.dev/)
3. Ensure tests match actual code implementation
4. Verify stage pricing is used consistently
