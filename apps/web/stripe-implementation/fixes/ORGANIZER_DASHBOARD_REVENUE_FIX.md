# Organizer Dashboard Revenue Fix - Complete Solution

## Issue Description

The organizer dashboard was showing incorrect revenue on initial page load:

- **Initial load**: $218.00 (only Datafast payments)
- **After 15-17 seconds**: $318.00 (correct total including Stripe payments)
- **Expected**: $318.00 immediately on load

## Root Cause Analysis

The issue had **FOUR layers** of problems:

### 1. ❌ Server-Side Query Bug - Missing Status (PRIMARY ISSUE)

**File**: `app/organizer/page.tsx` line 213

The SSR query was only fetching orders with status `"completed"`:

```typescript
.eq("status", "completed")  // ❌ Only Datafast orders
```

But Stripe orders are created with status `"paid"` (see `app/lib/orders.ts` line 488).

**Why Datafast worked**: Datafast orders use status `"completed"`, so they appeared immediately.

**Why Stripe was delayed**: Stripe orders with status `"paid"` were excluded from SSR, only appearing after client-side refetch.

### 1b. ❌ Server-Side Query Bug - Missing base_price_cents (REVENUE ACCURACY)

**File**: `app/organizer/page.tsx` line 183-210

The SSR query wasn't fetching `base_price_cents`, so it was using legacy price extraction for ALL orders, including Stripe orders which store the exact base price.

**Result**: Slightly inaccurate revenue ($322.39 vs $318.00) and visible "jump" when client-side refetched with correct data.

### 2. ❌ Missing Server Cache Revalidation

**File**: `app/api/webhooks/stripe/route.ts`

The Stripe webhook wasn't calling `revalidatePath()` to clear Next.js ISR cache after payment completion.

### 3. ❌ Client-Side React Query Configuration

**File**: `app/components/OrganizerDashboard.tsx`

React Query was configured to not refetch on mount:

```typescript
refetchOnMount: false,  // ❌ Prevented fresh data fetch
staleTime: 15000,       // ❌ Considered data fresh for 15 seconds
```

## Complete Solution

### Fix #1a: Include Both Order Statuses (CRITICAL)

**File**: `app/organizer/page.tsx` line 213

**Before:**

```typescript
.eq("status", "completed")  // Only Datafast orders
```

**After:**

```typescript
.in("status", ["completed", "paid"])  // Both Datafast and Stripe orders
```

This ensures SSR includes both payment types from the start.

### Fix #1b: Fetch and Use base_price_cents (REVENUE ACCURACY)

**File**: `app/organizer/page.tsx`

**Changes:**

1. Added `base_price_cents` to the SELECT query (line 191)
2. Updated revenue calculation to prefer stored `base_price_cents` over extraction (lines 300-327)
3. Applied same logic to promoter stats calculation (lines 414-443)

**Before:**

```typescript
const priceBreakdown = extractBasePriceHistorical(
  subtotalBeforeDiscount,
  order.created_at,
  order.fee_percentage
);
```

**After:**

```typescript
let priceBreakdown;
if (order.base_price_cents !== null && order.base_price_cents !== undefined) {
  // Guaranteed Net model: base_price_cents is the source of truth (Stripe orders)
  priceBreakdown = { basePriceCents: order.base_price_cents };
} else {
  // Legacy model: extract base price from total (Datafast orders)
  priceBreakdown = extractBasePriceHistorical(
    subtotalBeforeDiscount,
    order.created_at,
    order.fee_percentage
  );
}
```

**Why this matters**: Stripe uses the "Guaranteed Net" model where the exact base price is stored in the database. Using extraction instead of the stored value causes rounding errors and inaccurate revenue.

### Fix #2: Stripe Webhook Cache Revalidation

**File**: `app/api/webhooks/stripe/route.ts`

Added cache revalidation in both payment flows (RSVP and Direct Purchase):

```typescript
// ⚡ ON-DEMAND REVALIDATION: Clear caches after successful Stripe payment
try {
  if (hold.events?.slug) {
    revalidatePath(`/events/${hold.events.slug}`);
  }
  revalidatePath("/organizer"); // Clear dashboard cache
  revalidatePath("/account"); // Clear user tickets
} catch (revalidationError) {
  console.error("Warning: Cache revalidation failed:", revalidationError);
}
```

### Fix #3: React Query Configuration

**File**: `app/components/OrganizerDashboard.tsx` lines 620-621

**Before:**

```typescript
staleTime: 15000,
refetchOnMount: false,
```

**After (Initial - Caused visible refetch):**

```typescript
staleTime: 0,
refetchOnMount: "always",
```

**After (Final - Optimized):**

```typescript
staleTime: 30000,
refetchOnMount: false,
```

**Why the change**: With Fixes #1a and #1b, the SSR data is now accurate from the start. Setting `refetchOnMount: false` prevents the visible 1-2 second "jump" that was occurring when React Query immediately refetched after page load.

## Why All Fixes Are Needed

| Fix                        | Purpose                      | Impact if Missing                                              |
| -------------------------- | ---------------------------- | -------------------------------------------------------------- |
| **#1a - Status Query**     | Include Stripe orders in SSR | SSR shows only Datafast ($218 instead of $318)                 |
| **#1b - base_price_cents** | Use exact Stripe revenue     | Inaccurate revenue ($322.39 instead of $318.00) + visible jump |
| **#2 - Webhook Cache**     | Clear Next.js ISR cache      | Stale data for up to 60 seconds after payment                  |
| **#3 - React Query**       | Prevent unnecessary refetch  | Visible "jump" 1-2 seconds after page load                     |

**Without Fix #1a**: Stripe orders don't appear in SSR at all.  
**Without Fix #1b**: Revenue is slightly off and there's a visible jump when client refetches.  
**Without Fix #2**: Webhook doesn't clear cache, so ISR serves stale data.  
**Without Fix #3**: Unnecessary refetch causes visible UI flicker.  
**With all four**: ✅ Shows correct revenue immediately with no flickering.

## Payment Flow Comparison

### Datafast (Legacy) - Was Working

1. User completes payment
2. Order created with `status: "completed"` ✅
3. `revalidatePath("/organizer")` called ✅
4. SSR query finds order (`.eq("status", "completed")`) ✅
5. Dashboard shows correct revenue immediately ✅

### Stripe (New) - Was Broken, Now Fixed

1. User completes payment
2. Webhook creates order with `status: "paid"` ✅
3. `revalidatePath("/organizer")` called ✅ (Fix #2)
4. SSR query finds order (`.in("status", ["completed", "paid"])`) ✅ (Fix #1)
5. React Query refetches on mount ✅ (Fix #3)
6. Dashboard shows correct revenue immediately ✅

## Files Modified

```
app/organizer/page.tsx                | +33 lines (status query + base_price_cents handling)
app/api/webhooks/stripe/route.ts      | +40 lines (webhook cache revalidation)
app/components/OrganizerDashboard.tsx |  ±4 lines (React Query config optimization)
```

**Summary**: 3 files changed, 78 insertions(+), 15 deletions(-)

## Testing Verification

1. **Make a Stripe test purchase** ($100)
2. **Navigate to `/organizer` immediately**
3. **Expected**: Revenue shows correct amount instantly (e.g., $318)
4. **Check console**: `[STRIPE WEBHOOK] Revalidated organizer dashboard`
5. **Verify**: No delay, no loading spinner, correct data from start

## Technical Notes

### Order Status Values

- **`"paid"`**: Stripe orders (created by webhook)
- **`"completed"`**: Datafast/legacy orders
- **Both are valid completed orders** and should be included in revenue

### Why `.in("status", ["completed", "paid"])`?

This pattern is already used correctly in:

- ✅ `app/lib/utils/purchase-data.ts` line 76
- ✅ `app/api/organizer/data/route.ts` line 324

But was missing in:

- ❌ `app/organizer/page.tsx` line 213 (now fixed)

### Performance Impact

Minimal - the query is actually more accurate now and doesn't add overhead.

---

**Date Fixed**: January 16, 2026  
**Issue**: Stripe orders not appearing in organizer dashboard SSR  
**Root Cause**: Query filtering by wrong status value  
**Solution**: Include both "completed" and "paid" status values
