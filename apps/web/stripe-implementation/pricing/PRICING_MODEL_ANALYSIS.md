# Pricing Model Analysis & Migration Plan

## Executive Summary

The codebase has a critical mismatch in how `ticket_tiers.price_cents` is interpreted:
- **Frontend:** Treats it as FINAL customer price (extracts base using `extractBasePrice()`)
- **Backend:** Treats it as BASE organizer price (uses directly in payment calculations)

This causes incorrect payment intent amounts when using the new Stripe Connect model.

## The Problem

### Current "Partner event - Two" Example:
```text
ticket_tiers.price_cents = 10805 ($108.05)
events.markup_percent = 12.5
events.markup_fixed_cents = 30
```

**What's Stored:**
- `10805` appears to be a FINAL price from the old model: $100 base + $7 fee (7%) + $1.05 IVA (15%) = $108.05

**Backend Behavior (create-payment-intent):**
```typescript
basePriceCents = tier.price_cents * quantity  // Uses 10805 as base!
fee = (10805 * 0.125) + 30 = 1381 cents
total = 10805 + 1381 = 12186 cents ($121.86) ❌ WRONG
```

**Expected Behavior:**
```typescript
basePriceCents = extractBasePrice(tier.price_cents) // 10000 cents ($100)
fee = (10000 * 0.125) + 30 = 1280 cents  
total = 10000 + 1280 = 11280 cents ($112.80) ✓ CORRECT
```

## Conceptual Model Options

### Option A: Store BASE PRICE in ticket_tiers.price_cents (RECOMMENDED)

**Aligns with stripe_goals.md Section 3.4:**
> "The organizer sets a BASE PRICE (what they want to receive), and the platform adds markup on top"

**Changes Needed:**
1. **Migration:** Convert all existing `price_cents` from final prices to base prices
2. **Backend:** Use `tier.price_cents` directly (already doing this!)
3. **Frontend:** Stop extracting base price, use `tier.price_cents` directly
4. **Semantics:** `price_cents` = "Organizer's desired net revenue per ticket"

**Pros:**
- Clean separation of concerns
- Matches Stripe Connect model (organizer receives exact base)
- Easier to adjust markup per event
- Frontend/backend consistency

**Cons:**
- Requires migration of existing data
- Breaking change for existing UI (needs update)

### Option B: Store FINAL PRICE in ticket_tiers.price_cents (Current Frontend Assumption)

**Keep current semantics:**
> "price_cents = what customer pays (including all fees)"

**Changes Needed:**
1. **Backend:** Extract base price before creating payment intent
2. **Frontend:** Continue using `extractBasePrice()` (already doing this!)
3. **Add field:** New `base_price_cents` column for clarity

**Pros:**
- No data migration needed
- Maintains backward compatibility

**Cons:**
- Confusing semantics (organizer thinks in base prices, but stores final)
- Extraction logic must account for changing markup rates
- Less flexible for per-event markup adjustments

## Recommended Implementation: Option A

### Step 1: Add Migration to Convert price_cents to Base Prices

```sql
-- Migration: Convert ticket_tiers and ticket_stages price_cents to base prices
-- This extracts the base price from the current final prices that include fees

-- For ticket_tiers
UPDATE ticket_tiers tt
SET price_cents = (
  SELECT CASE 
    -- If fee_percentage is stored, use it
    WHEN tt.fee_percentage IS NOT NULL THEN
      ROUND(tt.price_cents / (1 + (tt.fee_percentage/100) + (tt.fee_percentage/100 * 0.15)))
    -- Otherwise use 7% for newer tiers (post Nov 2025)
    WHEN tt.created_at >= '2025-11-08' THEN
      ROUND(tt.price_cents / (1 + 0.07 + 0.07 * 0.15))
    -- Use 10% for older tiers
    ELSE
      ROUND(tt.price_cents / (1 + 0.10 + 0.10 * 0.15))
  END
)
WHERE price_cents > 0;

-- For ticket_stages  
UPDATE ticket_stages ts
SET price_cents = (
  SELECT CASE
    WHEN ts.fee_percentage IS NOT NULL THEN
      ROUND(ts.price_cents / (1 + (ts.fee_percentage/100) + (ts.fee_percentage/100 * 0.15)))
    WHEN ts.created_at >= '2025-11-08' THEN
      ROUND(ts.price_cents / (1 + 0.07 + 0.07 * 0.15))
    ELSE
      ROUND(ts.price_cents / (1 + 0.10 + 0.10 * 0.15))
  END
)
WHERE price_cents > 0;

-- Add comment for clarity
COMMENT ON COLUMN ticket_tiers.price_cents IS 'Base ticket price in cents (what organizer receives). Stripe markup is added on top during checkout.';
COMMENT ON COLUMN ticket_stages.price_cents IS 'Base ticket price in cents (what organizer receives). Stripe markup is added on top during checkout.';
```

### Step 2: Update Frontend to Stop Extracting Base Price

**Files to Update:**
- `app/components/EventDetail.tsx` - Lines 183, 196, 887, 972
- `app/components/EventCard.tsx` - Lines 98, 108
- `app/components/organizer/TierInlineForm.tsx` - Lines 23, 139
- `app/components/UserDashboard.tsx` - Line 1252 (only for bank transfers)

**Change:**
```typescript
// Before:
formatPrice(extractBasePrice(tier.price_cents).basePriceCents)

// After:
formatPrice(tier.price_cents) // price_cents IS the base price now
```

### Step 3: Update Tier Creation/Editing Forms

**Files to Update:**
- `app/components/organizer/TierInlineForm.tsx`
- `app/components/forms/CreateEventForm.tsx`

**Change:**
```typescript
// Before: User enters base price, we calculate and store final price
const breakdown = calculateFinalPrice(basePriceInput);
await supabase.update({ price_cents: breakdown.finalPriceCents });

// After: User enters base price, we store it directly
await supabase.update({ price_cents: basePriceInput * 100 });
```

### Step 4: Update Display Components to Show Markup

**Add markup display in checkout/RSVP flows:**
```typescript
// Show breakdown:
// Base Price: $100.00 (from tier.price_cents)
// Platform Fee: $12.80 (calculated from event.markup_percent)
// Total: $112.80
```

## Platform Profit Customization

The user wants `platform_fee_percent` to be adjustable per event (default 7%), which represents just the platform's revenue portion of the total markup.

### Current State:
- `organizations.platform_fee_percent` exists (default 7.00) but **NOT USED**
- `events.markup_percent` exists (default 12.5) and **IS USED**

### Two Approaches:

#### Approach 1: Keep Total Markup at Event Level (SIMPLER)
```typescript
// events.markup_percent = total markup (default 12.5)
// This is the sum of platform profit + Stripe fees
// Organizer can adjust this per event
```

**Pros:** Simple, flexible, already implemented
**Cons:** Doesn't separate platform profit from Stripe fees

#### Approach 2: Separate Platform Profit + Stripe Fees (COMPLEX)
```typescript
// Store at event level:
// - platform_profit_percent (default 7.0, adjustable)
// - stripe_base_percent (default 2.9, fixed)
// - stripe_intl_percent (default 1.5, fixed)
// - stripe_fx_percent (default 1.0, fixed)
// - rounding_buffer_percent (default 0.1, fixed)
// Total markup = sum of all above
```

**Pros:** Clear breakdown, matches user's mental model
**Cons:** More complex, requires schema changes

### Recommendation:
Keep Approach 1 (simpler). If you need to adjust platform profit from 7% to 5%:
- Adjust `events.markup_percent` from 12.5 to 10.5 (subtract 2%)
- The fee calculation already uses the event-specific markup

## Testing Plan

After implementing Option A migration:

1. **Verify "Partner event - Two":**
   ```sql
   SELECT name, price_cents FROM ticket_tiers 
   WHERE name = 'Stripe Test' AND event_id = (
     SELECT id FROM events WHERE name = 'Partner event - Two'
   );
   -- Should return: price_cents = 10000 (not 10805)
   ```

2. **Test Payment Intent Creation:**
   - Create RSVP for "Stripe Test" tier
   - Verify amounts: base=10000, fee=1280, total=11280

3. **Test Frontend Display:**
   - Event page shows: $100.00 (not $108.05)
   - Checkout shows: Subtotal $100.00, Fee $12.80, Total $112.80

## Migration Risks

**Low Risk:**
- Orders table already stores `base_price_cents` separately
- Historical orders are unaffected
- Only affects future purchases

**Medium Risk:**
- Frontend displays will change (prices will appear lower)
- Organizers might be confused if they're used to seeing final prices

**Mitigation:**
- Add banner: "We've updated our pricing display. Prices now show your net revenue (before platform fees)"
- Update organizer dashboard to clearly show "Your Net: $X" vs "Customer Pays: $Y"
