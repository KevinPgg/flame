# Testing Guide - Which Tests to Run

## Quick Reference

### 🚀 **Quick Test (Development)**

```bash
# Run tests in watch mode - automatically re-runs on file changes
pnpm test
```

### ✅ **Before Committing**

```bash
# Run all tests once
pnpm test:run
```

### 🎯 **Specific Areas**

**Purchase Flow Changes:**

```bash
pnpm test:run __tests__/purchase-flow.test.ts __tests__/purchase-page.integration.test.tsx
```

**QR Scanner Changes:**

```bash
pnpm test:run __tests__/qr-scanner.integration.test.tsx
```

**Pricing Changes:**

```bash
pnpm test:run __tests__/purchase-flow.test.ts -t "Stage Pricing|Price Display|Promotion Code"
```

---

## Test Strategy by Change Type

### 📝 **Purchase Page (`app/purchase/page.tsx`)**

**When to run:** ANY change to purchase page

**Run these:**

```bash
# Full purchase flow tests (unit + integration)
pnpm test:run __tests__/purchase-flow.test.ts __tests__/purchase-page.integration.test.tsx
```

**What gets tested:**

- ✅ Stage pricing calculations
- ✅ Promo code application
- ✅ Stripe PaymentElement integration
- ✅ Free ticket detection
- ✅ Price display consistency

**Critical checks:**

- Stage pricing used, not tier pricing
- Promo codes calculate from stage price
- PaymentIntent created with correct amounts

---

### 💳 **Payment/Stripe Changes**

**When to run:** Changes to Stripe integration, payment flow, or PaymentElement

**Run these:**

```bash
# Purchase flow tests
pnpm test:run __tests__/purchase-flow.test.ts __tests__/purchase-page.integration.test.tsx
```

**What gets tested:**

- ✅ PaymentIntent creation
- ✅ Price calculations for Stripe
- ✅ Fee-on-top calculations
- ✅ Free ticket bypass

**Critical checks:**

- PaymentIntent amount matches displayed total
- Fee calculations are correct
- Auth & Capture flow for RSVPs works

---

### 🎟️ **Promo Code Changes**

**When to run:** Changes to promo code validation, application, or calculation

**Run these:**

```bash
# Promo code integration tests
pnpm test:run __tests__/purchase-page.integration.test.tsx -t "Promo"
```

**Also run:**

```bash
# Promo code unit tests
pnpm test:run __tests__/purchase-flow.test.ts -t "Promotion Code"
```

**What gets tested:**

- ✅ 15% promo code application
- ✅ 100% promo code (free tickets)
- ✅ Promo code API calls with correct subtotal
- ✅ Discount calculated from stage price

**Critical checks:**

- Promo code validates with stage price, not tier price
- Free ticket detection works after 100% promo
- Promo code ID included in payment metadata

---

### 💰 **Pricing/Stage Pricing Changes**

**When to run:** Changes to pricing logic, stage pricing, or price calculations

**Run these:**

```bash
# All pricing-related tests
pnpm test:run __tests__/purchase-flow.test.ts -t "Stage Pricing|Price Display|Promotion Code"
```

**Also run:**

```bash
# Integration tests for price display
pnpm test:run __tests__/purchase-page.integration.test.tsx -t "Price|Checkout"
```

**What gets tested:**

- ✅ Stage pricing used when available
- ✅ Fallback to tier price
- ✅ Price consistency across all flows
- ✅ Price display matches payment

**Critical checks:**

- Stage price used, not tier price (prevents "Unit price mismatch" error)
- Price display matches payment calculation
- Promo codes calculate from stage price

---

### 🔍 **QR Scanner Changes (`app/components/QRScannerApp.tsx`)**

**When to run:** Changes to QR scanner component or QR code format

**Run these:**

```bash
# QR scanner integration tests
pnpm test:run __tests__/qr-scanner.integration.test.tsx
```

**Also run:**

```bash
# QR code format validation tests
pnpm test:run __tests__/purchase-flow.test.ts -t "QR Code"
```

**What gets tested:**

- ✅ QR code format validation
- ✅ QR code parsing
- ✅ Ticket verification
- ✅ Error handling
- ✅ Stage pricing metadata in QR responses

---

### 🎫 **Checkout/API Changes**

**When to run:** Changes to checkout creation, API routes, or purchase completion

**Run these:**

```bash
# Paid ticket flow tests
pnpm test:run __tests__/purchase-page.integration.test.tsx -t "Paid Ticket"
```

**Also run:**

```bash
# Complete purchase flow tests
pnpm test:run __tests__/purchase-flow.test.ts -t "Integration Scenarios"
```

**What gets tested:**

- ✅ PaymentIntent created with stage pricing
- ✅ Promo code ID included in metadata
- ✅ Free ticket completion
- ✅ Multiple quantity handling

**Critical checks:**

- PaymentIntent uses stage price, not tier price
- Promo code ID included when applied
- Free tickets bypass payment correctly

---

### 🐛 **Bug Fixes**

**When to run:** After fixing any bug

**Run these:**

```bash
# Run ALL tests to ensure no regressions
pnpm test:run
```

**Especially check:**

```bash
# Critical bug scenarios
pnpm test:run __tests__/purchase-flow.test.ts -t "Critical Bug"
```

**What gets tested:**

- ✅ "Unit price mismatch" error prevention
- ✅ Price display vs payment mismatch prevention
- ✅ Payment flow bug fixes

---

### 🎨 **UI/Component Changes (Non-Logic)**

**When to run:** Changes to styling, layout, or non-functional UI

**Run these:**

```bash
# Quick check - ensure components still render
pnpm test:run __tests__/purchase-page.integration.test.tsx -t "Free Ticket|Paid Ticket"
```

**Note:** If UI changes affect functionality (e.g., button text, form fields), run full integration tests.

---

### 📦 **Dependency Updates**

**When to run:** After updating npm packages

**Run these:**

```bash
# Run ALL tests to ensure compatibility
pnpm test:run
```

**Check for:**

- Breaking changes in React Testing Library
- Changes in Vitest behavior
- Stripe SDK compatibility
- Component rendering issues

---

## Test Execution Tips

### Watch Mode (Development)

```bash
# Run tests in watch mode - auto-reruns on save
pnpm test

# Watch specific file
pnpm test __tests__/purchase-flow.test.ts
```

### Run Specific Test Suite

```bash
# By test name pattern
pnpm vitest -t "Stage Pricing"

# By file
pnpm test:run __tests__/purchase-flow.test.ts

# Multiple files
pnpm test:run __tests__/purchase-flow.test.ts __tests__/purchase-page.integration.test.tsx
```

### Run Tests with UI

```bash
# Visual test runner
pnpm test:ui
```

---

## Pre-Commit Checklist

Before committing changes, run:

```bash
# 1. Run all tests
pnpm test:run

# 2. If you changed purchase flow specifically:
pnpm test:run __tests__/purchase-flow.test.ts __tests__/purchase-page.integration.test.tsx

# 3. If you changed QR scanner:
pnpm test:run __tests__/qr-scanner.integration.test.tsx
```

**All tests should pass before committing!**

---

## CI/CD Integration

Tests run automatically in CI/CD. If tests fail in CI:

1. **Run locally first:**

   ```bash
   pnpm test:run
   ```

2. **Check specific failing test:**

   ```bash
   pnpm test:run -t "failing-test-name"
   ```

3. **Review recent changes** that might have broken tests

---

## Common Issues

### Tests Fail After Refactoring

**Problem:** Changed function names or moved code

**Solution:**

- Update test mocks to match new structure
- Check if component imports changed
- Verify API route paths haven't changed

### Payment Tests Fail

**Problem:** Stripe integration issues

**Solution:**

- Ensure Stripe mocks are set up correctly
- Check if PaymentIntent creation is mocked
- Verify fee calculations are correct

### Integration Tests Timeout

**Problem:** Component takes too long to render

**Solution:**

- Increase timeout in `waitFor` calls
- Check if API mocks are set up correctly
- Verify component isn't stuck in loading state

---

## Critical Mock Gotchas (Jan 2026 Fixes)

These are common pitfalls discovered during debugging that can cause hard-to-diagnose test failures.

### 1. `vi.resetAllMocks()` vs `vi.clearAllMocks()`

**Problem:** Using `vi.resetAllMocks()` in `beforeEach` breaks module-level mocks.

```typescript
// ❌ BAD - resets mock implementations, breaking module-level mocks
beforeEach(() => {
  vi.resetAllMocks(); // This clears implementations!
});

// ✅ GOOD - only clears call history, preserves implementations
beforeEach(() => {
  vi.clearAllMocks();
  // Re-setup any mocks that need specific return values
  (getEventMarkup as ReturnType<typeof vi.fn>).mockResolvedValue({
    percent: 10,
    fixedCents: 0,
  });
});
```

**Symptom:** Tests fail with "Cannot read properties of undefined" when accessing mock return values.

### 2. Component Tests Need ALL Fetch Mocks in Order

**Problem:** For paid ticket flows, the component makes multiple API calls. Missing any mock causes failures.

```typescript
// Paid ticket test - needs 2 mocks BEFORE render
(global.fetch as any).mockResolvedValueOnce({
  ok: true,
  json: async () => ({ /* validate API response */ }),
});

(global.fetch as any).mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    clientSecret: "test_secret",
    paymentIntentId: "pi_test",
    amounts: { base: 1000, fee: 100, total: 1100, currency: "USD" },
  }),
});

render(<PurchasePage />);

// For promo code application - need ANOTHER mock
(global.fetch as any).mockResolvedValueOnce({
  ok: true,
  json: async () => ({ /* create-payment-intent with promo */ }),
});
```

**Symptom:** "Cannot read properties of undefined (reading 'ok')" when component tries to call an unmocked endpoint.

### 3. Promo Code Uses `create-payment-intent`, Not a Separate API

**Problem:** Promo code application calls the same `create-payment-intent` endpoint, not a separate validation API.

```typescript
// ❌ WRONG - This mock format is for a separate validation API that doesn't exist
(global.fetch as any).mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    promotional_code: { id: "promo-id", discount_percentage: 15 },
    discount_amount_cents: 150,
  }),
});

// ✅ CORRECT - Promo calls create-payment-intent, returns full response
(global.fetch as any).mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    clientSecret: "test_secret_promo",
    paymentIntentId: "pi_test_promo",
    amounts: {
      base: 850, // Discounted
      fee: 0,
      total: 850,
      discount: 150,
      currency: "USD",
    },
    promotionalCodeId: "promo-id",
  }),
});
```

**For 100% promo (free ticket):**

```typescript
(global.fetch as any).mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    clientSecret: null,
    paymentIntentId: null,
    amounts: { base: 0, fee: 0, total: 0, discount: 1000, currency: "USD" },
    promotionalCodeId: "promo-id",
  }),
});
```

**Symptom:** "Cannot read properties of undefined (reading 'total')" or promo code application doesn't work.

### 4. Check Actual Placeholder Text in Components

**Problem:** Tests search for placeholder text that doesn't match the actual component.

```typescript
// ❌ WRONG - if component uses "Enter code" as placeholder
const promoInput = screen.getByPlaceholderText(/promo/i);

// ✅ CORRECT - match actual placeholder text
const promoInput = screen.getByPlaceholderText(/enter code/i);
```

**Symptom:** "Unable to find an element with the placeholder text" errors.

### 5. Supabase Preview Branch Safety Check

**Problem:** Preview branches have random refs that don't contain "test" or "dev".

```bash
# ❌ FAILS - Safety check blocks tests
pnpm test:run

# ✅ WORKS - Bypass safety check for preview branches
TEST_DATABASE_CONFIRMED=true pnpm test:run
```

**Symptom:** "❌ SAFETY CHECK FAILED: Supabase URL does not appear to be a test environment"

---

## Test File Structure

```text
__tests__/
├── purchase-flow.test.ts              # Unit tests (58 tests)
│   ├── Stage pricing calculations
│   ├── Promotion code calculations
│   ├── QR code validation
│   └── Critical bug scenarios
│
├── purchase-page.integration.test.tsx  # Integration tests (19 tests)
│   ├── Free/paid ticket flows
│   ├── Promo code application
│   ├── Checkout creation
│   └── Price display consistency
│
├── qr-scanner.integration.test.tsx     # QR scanner tests (15 unit + 5 skipped)
│   ├── QR code format validation
│   ├── Ticket verification (unit tests)
│   └── Component rendering (skipped - needs E2E)
│
├── api/
│   ├── purchase/
│   │   └── create-payment-intent.test.ts  # PaymentIntent API tests (15 tests)
│   └── webhooks/
│       └── stripe.test.ts                 # Webhook processing tests (23 tests)
│
├── integration/                       # Database integration tests (77 skipped)
│   ├── organizer-tickets.test.ts      # Requires Supabase dev branch
│   └── rsvp-checkout-validation.test.ts
│
└── setup.ts                            # Test setup & mocks
```

**Note:** Database integration tests require a Supabase development branch. They're skipped when using production URL.

---

## Quick Decision Tree

```
Did you change purchase/payment logic?
├─ YES → Run purchase-flow.test.ts + purchase-page.integration.test.tsx
└─ NO → Continue

Did you change QR scanner?
├─ YES → Run qr-scanner.integration.test.tsx
└─ NO → Continue

Did you change pricing/stage pricing?
├─ YES → Run all purchase flow tests
└─ NO → Continue

Did you change anything else?
├─ YES → Run pnpm test:run (all tests)
└─ NO → You're good!
```

---

## Need Help?

If tests are failing:

1. Check the error message
2. Review `PURCHASE_FLOW_TESTS.md` for interpretation guide
3. Verify your changes match test expectations
4. Check if mocks need updating
