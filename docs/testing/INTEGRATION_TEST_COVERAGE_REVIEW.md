# Integration Test Coverage Review

## Current Status

### ✅ Unit Tests (`purchase-flow.test.ts`) - 54 tests

- Stage pricing calculations (RSVP/Hold)
- Promotion code calculations (15% and 100%)
- Price display consistency
- QR code format validation
- Widget total calculation logic
- **Widget useEffect dependency array verification** (BUG DETECTION)

### ✅ Integration Tests

#### `purchase-page.integration.test.tsx` - 18+ tests ✅ UPDATED

- Free RSVP ticket detection
- Free Hold ticket detection
- Paid RSVP ticket display
- Paid Hold ticket display
- **Widget Initialization - Critical Bug Fixes** (3 tests) ✅ NEW
  - Widget re-initialization when unitPrice changes
  - Widget reset prevention during initial setup
  - Widget total display verification
- **Promo Code Application Flow** (2 tests) ✅ NEW
  - 15% promo code application and widget update
  - 100% promo code and free ticket detection
- **Checkout Creation** (2 tests) ✅ NEW
  - Checkout with stage pricing (not tier pricing)
  - Checkout includes promo code ID
- **Stage Pricing Late Load** (1 test) ✅ NEW
  - Handles stage pricing loading after widget initialization
- **Multiple Quantities with Promo** (1 test) ✅ NEW
  - Widget total calculation for multiple tickets with promo
- Price display consistency (multiple quantities)

#### `qr-scanner.integration.test.tsx` - 15+ tests

- QR code format validation
- QR code parsing
- Ticket verification
- Error handling
- Stage pricing metadata

---

## 🔴 Critical Gaps in Integration Tests

### 1. **Widget Initialization Bug Fix - NOT TESTED** ⚠️ MOST CRITICAL

**What We Fixed:**

- `useEffect` dependency array now includes `unitPrice`, `appliedPromoCode`, `mode`, and quantity values
- Widget resets when pricing values change after initial load
- Widget displays correct total amount above Pay button

**What's Missing:**

- ❌ No test that verifies widget re-initializes when `unitPrice` changes after widget loads
- ❌ No test that verifies widget re-initializes when `appliedPromoCode` changes
- ❌ No test that verifies widget displays correct total (`purchase-payment-total-display` element)
- ❌ No test for the infinite loop prevention logic (widget reset only happens when values actually change)

**Impact:** The core bug we fixed isn't verified in integration tests! Only the unit test checks the dependency array exists.

---

### 2. **Promo Code Application Flow - INCOMPLETE**

**Current Tests:**

- ✅ Tests mention promo codes exist
- ❌ **DOESN'T actually test user applying a promo code**
- ❌ **DOESN'T verify widget updates after promo code applied**
- ❌ **DOESN'T test 15% discount scenarios** (only 100%)

**What's Missing:**

- ❌ User types promo code → clicks "Apply" → widget recalculates total
- ❌ Promo code validation API call with correct `subtotal_cents` (using stage price)
- ❌ Widget total display updates after promo code applied
- ❌ Free ticket detection after 15% promo code (should still show payment button)
- ❌ Free ticket detection after 100% promo code (should show "Confirm Free Ticket")

**Impact:** The most common user flow (applying promo codes) isn't fully tested.

---

### 3. **Widget Reset Logic - NOT TESTED**

**What We Fixed:**

- Widget only resets if it has been fully loaded AND values actually changed
- Prevents infinite re-initialization loop

**What's Missing:**

- ❌ No test that verifies widget doesn't reset during initial setup
- ❌ No test that verifies widget resets when values change after load
- ❌ No test that verifies infinite loop doesn't occur

**Impact:** The infinite loop bug prevention isn't verified.

---

### 4. **Checkout Creation - NOT TESTED**

**What Should Be Tested:**

- ❌ Checkout creation API call (`/api/datafast/create-checkout`) with correct `unit_price_cents`
- ❌ Checkout includes stage pricing, not tier pricing
- ❌ Checkout includes promo code ID when applied
- ❌ Checkout includes correct quantity

**Impact:** The critical API call that creates the payment checkout isn't verified.

---

### 5. **Multiple Quantity Scenarios - PARTIALLY TESTED**

**Current Tests:**

- ✅ One test uses `requested_quantity: 2` and checks price display

**What's Missing:**

- ❌ Multiple quantities with promo codes
- ❌ Widget total calculation for multiple tickets
- ❌ Checkout creation with multiple quantities

---

### 6. **Stage Pricing Loading After Widget Init - NOT TESTED**

**The Bug Scenario:**

1. Widget initializes with `unitPrice = 0` (tier base price)
2. Stage pricing loads: `unitPrice = 335` (stage price)
3. Widget should re-initialize with new total

**What's Missing:**

- ❌ No test simulates this timing scenario
- ❌ No test verifies widget updates when stage pricing loads late

**Impact:** The exact bug scenario isn't tested.

---

### 7. **Widget Total Display Element - NOT TESTED**

**What Should Be Tested:**

- ❌ Element `.purchase-payment-total-display` is created in DOM
- ❌ Total amount text matches calculated total
- ❌ Element is removed and recreated on widget reset (no duplicates)

**Impact:** The visual widget total display isn't verified.

---

### 8. **15% Promo Code Scenarios - NOT TESTED**

**Current Tests:**

- ✅ Only 100% promo codes are tested (and not fully)

**What's Missing:**

- ❌ 15% discount applied to RSVP tickets
- ❌ 15% discount applied to Hold tickets
- ❌ Widget total updates correctly with 15% discount
- ❌ Price display shows correct discounted total

**Impact:** The most common promo code type (15%) isn't tested.

---

## 📊 Coverage Comparison

| Scenario                                | Unit Tests      | Integration Tests | Status           |
| --------------------------------------- | --------------- | ----------------- | ---------------- |
| Stage pricing calculations              | ✅              | ✅                | OK               |
| Promotion code calculations             | ✅              | ⚠️ Partial        | **GAP**          |
| Widget initialization with correct deps | ✅ (code check) | ❌                | **CRITICAL GAP** |
| Widget reset logic                      | ❌              | ❌                | **GAP**          |
| Widget total display                    | ✅ (logic)      | ❌                | **GAP**          |
| Promo code user interaction             | ❌              | ❌                | **GAP**          |
| Checkout creation API                   | ❌              | ❌                | **GAP**          |
| Multiple quantities                     | ✅              | ⚠️ Partial        | **GAP**          |
| 15% promo codes                         | ✅              | ❌                | **GAP**          |
| Stage pricing late load                 | ❌              | ❌                | **GAP**          |

---

## 🎯 Recommended Test Additions

### Priority 1: Critical Bug Fixes

1. **Widget Re-initialization Test**

   ```typescript
   it("should re-initialize widget when unitPrice changes after initial load", async () => {
     // 1. Render component with unitPrice = 0
     // 2. Wait for widget to initialize
     // 3. Update unitPrice to 335 (simulate stage pricing loading)
     // 4. Verify widget resets and re-initializes
     // 5. Verify widget total display shows correct amount
   });
   ```

2. **Widget Reset Prevention Test**

   ```typescript
   it("should NOT reset widget during initial setup", async () => {
     // Verify widget doesn't reset before it's fully loaded
     // Prevents infinite loop bug
   });
   ```

3. **Widget Total Display Test**
   ```typescript
   it("should display correct total amount in widget", async () => {
     // Verify .purchase-payment-total-display element exists
     // Verify total amount text matches calculated total
   });
   ```

### Priority 2: User Flows

4. **Promo Code Application Flow**

   ```typescript
   it("should apply 15% promo code and update widget total", async () => {
     // 1. Render paid ticket
     // 2. User types promo code
     // 3. Click "Apply"
     // 4. Verify API call with correct subtotal_cents
     // 5. Verify widget total updates
     // 6. Verify price display updates
   });
   ```

5. **Checkout Creation Test**
   ```typescript
   it("should create checkout with stage pricing", async () => {
     // Verify /api/datafast/create-checkout called with:
     // - Correct unit_price_cents (stage price, not tier price)
     // - Correct quantity
     // - Promo code ID if applied
   });
   ```

### Priority 3: Edge Cases

6. **Stage Pricing Late Load**

   ```typescript
   it("should handle stage pricing loading after widget initialization", async () => {
     // Simulate the exact bug scenario
   });
   ```

7. **Multiple Quantities with Promo**
   ```typescript
   it("should calculate widget total correctly for multiple tickets with promo", async () => {
     // 2 tickets * $3.35 = $6.70
     // 15% discount = $1.01
     // Total = $5.69
   });
   ```

---

## 🚨 Critical Recommendation

**The widget initialization bug fix is NOT verified in integration tests!**

The unit test (`Widget useEffect Dependency Array Verification`) only checks that the dependency array exists in the code. It doesn't verify that:

1. The widget actually re-initializes when values change
2. The widget displays the correct total
3. The infinite loop prevention works

**We should add integration tests that actually test the widget behavior**, not just verify the code structure.

---

## Next Steps

1. ✅ Review complete (this document)
2. ⏳ Add Priority 1 tests (Widget re-initialization)
3. ⏳ Add Priority 2 tests (Promo code flow)
4. ⏳ Add Priority 3 tests (Edge cases)

---

## Notes

- Integration tests use React Testing Library, which can test actual component behavior
- Need to mock Datafast widget script loading (`window.wpwlOptions`)
- Need to verify DOM elements are created/updated correctly
- Consider using `@testing-library/user-event` for actual user interactions
