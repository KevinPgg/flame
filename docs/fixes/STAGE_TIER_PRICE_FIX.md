# Stage Tier Price Display Fix

## Issue

Stage tiers were showing $0 in the catalogue, upcoming events, and checkout pages, even though they displayed correctly on individual event pages.

## Root Cause

Multiple components and API endpoints were not properly handling stage tier pricing:

1. **EventsCatalog Component** - Only checked `tier.price_cents`, ignoring `ticket_stages`
2. **Homepage Queries** - Didn't fetch `ticket_stages` data from the database
3. **Hold Creation API** - Returned base tier price instead of stage price
4. **Hold Validation API** - Didn't look up actual stage price when validating holds
5. **Purchase Token Validation** - Recalculated price instead of using locked-in RSVP price

## Files Modified

### 1. `/app/components/EventsCatalog.tsx`

**Problem**: The `getLowestPrice` function only looked at `tier.price_cents`

**Fix**: Updated to collect prices from both tiers and their stages:

```typescript
const prices: number[] = [];
availableTiers.forEach(tier => {
  if (tier.ticket_stages && tier.ticket_stages.length > 0) {
    // If tier has stages, use stage prices
    tier.ticket_stages.forEach((stage: any) => {
      if (
        typeof stage.price_cents === "number" &&
        !isNaN(stage.price_cents) &&
        isFinite(stage.price_cents)
      ) {
        prices.push(stage.price_cents);
      }
    });
  } else {
    // Otherwise use tier price
    if (
      typeof tier.price_cents === "number" &&
      !isNaN(tier.price_cents) &&
      isFinite(tier.price_cents)
    ) {
      prices.push(tier.price_cents);
    }
  }
});
```

### 2. `/app/page.tsx`

**Problem**: Homepage queries didn't fetch `ticket_stages` data

**Fix**: Added `ticket_stages` to both featured event and upcoming events queries:

```typescript
ticket_tiers(
  id,
  name,
  price_cents,
  quantity_total,
  quantity_sold,
  ticket_stages(id, name, price_cents, quantity, sold_quantity, order_index)
);
```

### 3. `/app/api/holds/create/route.ts`

**Problem**: Returned `ticketTier.price_cents` instead of using the stage price returned by the database function

**Fix**: Use stage price when available:

```typescript
// Use stage price if available, otherwise fall back to tier price
const actualPrice = result.stage_price_cents || ticketTier.price_cents;

return NextResponse.json({
  hold_session_id: result.hold_id,
  expires_at: result.expires_at,
  ticket_tier: {
    id: ticketTier.id,
    name: ticketTier.name,
    price_cents: actualPrice, // Now returns correct stage price
  },
  quantity: quantity,
  stage_name: result.stage_name,
  stage_price_cents: result.stage_price_cents,
});
```

### 4. `/app/api/holds/validate/route.ts`

**Problem**: Only fetched `price_cents` from tier, didn't look up the actual stage price

**Fix**:

1. Added `ticket_stages` to the query
2. Look up the correct stage price from the hold's `stage_id`:

```typescript
// Get hold with related event and ticket tier details
const { data: hold, error: holdError } = await supabaseAdmin
  .from("holds")
  .select(`
    *,
    events!inner (...),
    ticket_tiers!holds_tier_id_fkey (
      id,
      name,
      price_cents,
      ticket_stages (
        id,
        name,
        price_cents
      )
    )
  `)
  ...

// If this hold is for a stage tier, find the correct stage price
let actualPrice = hold.ticket_tiers.price_cents;
if (hold.stage_id && hold.ticket_tiers.ticket_stages) {
  const matchingStage = hold.ticket_tiers.ticket_stages.find(
    (stage: any) => stage.id === hold.stage_id
  );
  if (matchingStage) {
    actualPrice = matchingStage.price_cents;
  }
}
```

### 5. `/app/lib/purchase-tokens.ts`

**Problem**: Recalculated stage price based on current availability instead of using the price locked in when RSVP was created

**Fix**: Use the `stage_price_cents` stored in the RSVP record:

```typescript
// Use the stage price that was locked in when RSVP was created
// This ensures price stability - the price won't change between RSVP approval and purchase
if (rsvp.stage_price_cents) {
  rsvp.ticket_tiers.current_stage_price = rsvp.stage_price_cents;
  rsvp.ticket_tiers.current_stage = rsvp.stage_name
    ? {
        id: rsvp.stage_id,
        name: rsvp.stage_name,
        price_cents: rsvp.stage_price_cents,
      }
    : null;
  // Calculate remaining in stage for display purposes
  const stagePriceInfo = getCurrentStagePrice(rsvp.ticket_tiers);
  rsvp.ticket_tiers.remaining_in_stage =
    stagePriceInfo?.remainingInStage || null;
} else {
  // No stage - use base tier price
  rsvp.ticket_tiers.current_stage_price = rsvp.ticket_tiers.price_cents;
  rsvp.ticket_tiers.current_stage = null;
  rsvp.ticket_tiers.remaining_in_stage =
    rsvp.ticket_tiers.quantity_total - rsvp.ticket_tiers.quantity_sold;
}
```

## Already Working Correctly

The following components/endpoints were already handling stage tiers correctly:

- **EventCard Component** - Had proper logic to check stages
- **EventDetail Component** - Correctly displays stage tier prices on individual event pages
- **Individual Event Page Query** - Already fetched `ticket_stages`
- **Events Catalogue Page Query** - Already fetched `ticket_stages` (data was available, just not used in display)
- **Database Functions** - `create_rsvp_atomic` and `atomic_create_hold_with_stage_validation` properly handle stage pricing

## Testing Checklist

1. ✅ Catalogue page shows correct stage tier prices (lowest available)
2. ✅ Homepage upcoming events show correct stage tier prices
3. ✅ Homepage featured event shows correct stage tier prices
4. ✅ Individual event page continues to show correct prices
5. ✅ Checkout page (hold flow) shows correct stage tier price
6. ✅ Checkout page (RSVP flow) shows correct stage tier price
7. ✅ Price remains stable from RSVP approval to purchase completion

## Technical Notes

### Price Consistency

- **For Holds**: Stage price is determined at hold creation time and stored in the hold record
- **For RSVPs**: Stage price is determined at RSVP creation time and stored in the RSVP record (`stage_price_cents`, `stage_name`, `stage_id`)
- This ensures price stability - users won't see price changes between selecting a ticket and completing payment

### Database Schema

The `rsvps` table has the following columns to track stage information:

- `stage_id` (UUID) - References the specific stage that was selected
- `stage_name` (TEXT) - Name of the stage for historical reference
- `stage_price_cents` (INTEGER) - Price locked in at time of RSVP creation

The `holds` table similarly tracks:

- `stage_id` (UUID) - References the specific stage that was held
- Additional stage info returned by the atomic function

### Pattern Used

The fix follows the pattern already established in `EventCard` component:

1. Check if tier has stages (`tier.ticket_stages && tier.ticket_stages.length > 0`)
2. If yes, collect prices from all stages
3. If no, use the base tier price
4. Find the minimum/maximum for display
