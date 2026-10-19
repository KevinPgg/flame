# Promotional Code Rounding Fix

## Issue Summary

A 1-cent rounding discrepancy was causing promotional code discount validation to fail intermittently.

### Error Encountered

```
ERROR from complete_hold_purchase RPC: {
  message: 'Discount mismatch: expected 1134 cents, got 1135 cents',
  details: null,
  hint: null,
  code: 'P0001'
}
```

### Root Cause

The January 2025 migration (`20250126000001_add_promoter_code_to_complete_hold_purchase.sql`) accidentally reverted a previous fix from October 2024 that changed discount calculation from `FLOOR()` to `ROUND()`.

**Inconsistent Rounding:**

- **Client-side** (purchase page): `Math.round((7564 * 15) / 100)` = **1135 cents** ✓
- **API** (validate-promo-code): `Math.round((7564 * 15) / 100)` = **1135 cents** ✓
- **Database** (complete_hold_purchase): `FLOOR((7564 * 15) / 100)` = **1134 cents** ❌

**Example Calculation:**

- Unit price: 7564 cents ($75.64)
- Discount percentage: 15%
- Calculation: (7564 × 15) ÷ 100 = **1134.6 cents**
- `Math.round(1134.6)` = **1135** (rounds up)
- `FLOOR(1134.6)` = **1134** (always rounds down)

## Files Changed

### 1. `/supabase/migrations/20250126000001_add_promoter_code_to_complete_hold_purchase.sql`

**Change:** Updated the source migration file to use `ROUND()` instead of `FLOOR()`

- Line 97: Changed discount calculation to use `ROUND()` with explanatory comment
- This prevents the issue from being reintroduced if migrations are rebuilt

### 2. `/supabase/migrations/20251216000000_fix_discount_rounding_floor_to_round.sql` (NEW)

**Purpose:** New migration to fix the currently deployed database function

- Drops and recreates `complete_hold_purchase` function with `ROUND()` logic
- Includes detailed comments explaining the bug and fix
- Matches the rounding behavior of both client-side and API validation

## Impact

### Before Fix

- Promotional codes with fractional cent discounts (e.g., 15% of $75.64 = $11.346) would fail
- Users would see "Discount mismatch" errors during checkout
- Purchase flow would be blocked

### After Fix

- All discount calculations use consistent `ROUND()` logic
- Client, API, and database all calculate identical discount amounts
- Promotional codes work reliably for all price/percentage combinations

## Testing Recommendations

### Manual Test Case

1. Create a promotional code with 15% discount
2. Purchase a ticket priced at $75.64 (7564 cents)
3. Expected discount: $11.35 (1135 cents)
4. Verify purchase completes successfully

### Edge Cases to Test

- Various percentage values: 10%, 15%, 20%, 25%
- Various price points that result in fractional cents
- Multiple quantities (ensure rounding is still correct)

### SQL Test Query

```sql
-- Test the fixed function's discount calculation
SELECT
  subtotal_cents,
  discount_percentage,
  ROUND((subtotal_cents * discount_percentage::NUMERIC) / 100) as discount_round,
  FLOOR((subtotal_cents * discount_percentage::NUMERIC) / 100) as discount_floor,
  ROUND((subtotal_cents * discount_percentage::NUMERIC) / 100) -
    FLOOR((subtotal_cents * discount_percentage::NUMERIC) / 100) as difference_cents
FROM (
  VALUES
    (7564, 15),  -- The failing case
    (5000, 15),
    (10000, 15),
    (3333, 10)
) AS tests(subtotal_cents, discount_percentage)
WHERE ROUND((subtotal_cents * discount_percentage::NUMERIC) / 100) !=
      FLOOR((subtotal_cents * discount_percentage::NUMERIC) / 100);
```

## Historical Context

- **October 2025** (`20251025112443_fix_promo_code_discount_rounding.sql`): Fixed FLOOR → ROUND
- **January 2025** (`20250126000001_add_promoter_code_to_complete_hold_purchase.sql`): Accidentally reverted ROUND → FLOOR when adding promoter_code parameter
- **December 2025** (this fix): Re-applied ROUND logic with better documentation

## Deployment Steps

1. Review this PR and approve changes
2. Apply migration: `20251216000000_fix_discount_rounding_floor_to_round.sql`
3. Test with promotional codes that previously failed
4. Monitor for any discount validation errors in logs

## Verification

After deployment, verify the function uses ROUND():

```sql
-- Check function definition
SELECT prosrc
FROM pg_proc
WHERE proname = 'complete_hold_purchase';

-- Should see: ROUND((v_expected_subtotal_cents * v_promo_record.discount_percentage::NUMERIC) / 100)
-- Should NOT see: FLOOR((v_expected_subtotal_cents * v_promo_record.discount_percentage::NUMERIC) / 100)
```
