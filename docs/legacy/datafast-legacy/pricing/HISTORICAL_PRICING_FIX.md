# Historical Pricing Fix: Dashboard Display Issue

**Date:** November 7, 2024  
**Issue:** Dashboard showing incorrect base prices for old purchases  
**Status:** ✅ FIXED

---

## 🐛 Problem Description

After migrating the service fee from 10% to 7%, the organizer dashboard was displaying **incorrect base prices** for purchases made before the migration.

### Example of the Issue:
- **Original purchase (Oct 2024):** $125 base × 1.115 (10%) = $139.38 total
- **Dashboard extraction (using 7%):** $139.38 ÷ 1.0805 = **$128.99 ≈ $129** ❌ 
- **Expected display:** $125.00 ✓

The problem was that the `extractBasePrice()` function was using the **new 7% rate** to reverse-calculate base prices from old purchases that were created with the **old 10% rate**.

---

## ✅ Solution Implemented

### 1. Added Historical Markup Constants

Added constants to track the markup rate history in `app/lib/pricing.ts`:

```typescript
export const MARKUP_HISTORY = {
  LEGACY_10_PERCENT: 10, // Used before Nov 7, 2024
  CURRENT_7_PERCENT: 7,   // Used from Nov 7, 2024 onwards
  MIGRATION_DATE: new Date('2024-11-07T00:00:00Z'),
};
```

### 2. Created New Extraction Function

Added `extractBasePriceHistorical()` function that automatically selects the correct markup rate based on the order's creation date:

```typescript
export function extractBasePriceHistorical(
  finalPriceCents: number,
  orderCreatedAt: string | Date
): PriceBreakdown {
  const orderDate = new Date(orderCreatedAt);
  
  // Orders before Nov 7, 2024 use 10%, after use 7%
  const markupToUse = orderDate < MARKUP_HISTORY.MIGRATION_DATE
    ? MARKUP_HISTORY.LEGACY_10_PERCENT
    : MARKUP_HISTORY.CURRENT_7_PERCENT;
  
  return extractBasePriceWithMarkup(finalPriceCents, markupToUse);
}
```

### 3. Updated Dashboard Code

Updated two files to use the new historical extraction:

#### `app/organizer/page.tsx` (Line 212)
```typescript
// OLD:
const priceBreakdown = extractBasePrice(subtotalBeforeDiscount);

// NEW:
const priceBreakdown = extractBasePriceHistorical(
  subtotalBeforeDiscount, 
  order.created_at
);
```

#### `app/lib/utils/purchase-data.ts` (Line 106)
```typescript
// OLD:
const priceBreakdown = extractBasePrice(subtotalBeforeDiscount);

// NEW:
const priceBreakdown = extractBasePriceHistorical(
  subtotalBeforeDiscount,
  order.created_at
);
```

---

## 🎯 How It Works

The fix automatically determines which markup rate to use:

### For Old Purchases (Before Nov 7, 2024)
```
Order Date: Oct 15, 2024
Stored Price: $139.38
Extraction Rate: 10% (automatic)
Result: $125.00 base ✓
```

### For New Purchases (After Nov 7, 2024)
```
Order Date: Nov 8, 2024
Stored Price: $135.06
Extraction Rate: 7% (automatic)
Result: $125.00 base ✓
```

---

## 📊 Impact

### Fixed Components
- ✅ Organizer Dashboard - Purchase history view
- ✅ Organizer Dashboard - Event purchase details
- ✅ Purchase data exports
- ✅ Admin reports

### Unchanged (Still Using Current 7% Rate)
- ✅ Ticket tier editing (uses `extractBasePrice()`)
- ✅ New RSVP creation
- ✅ New purchase calculations
- ✅ Price breakdown displays

---

## 🔍 Verification

After deployment, verify the fix by checking:

1. **Old Purchases (Before Nov 7, 2024)**
   - Go to Organizer Dashboard
   - View purchases from October 2024
   - Verify base prices show original amounts (e.g., $125, not $129)

2. **New Purchases (After Nov 7, 2024)**
   - View purchases from November 8+ onwards
   - Verify base prices are correctly extracted using 7% rate

3. **El Calenton Event**
   - Check purchase history shows correct base prices
   - Old purchases: Use 10% extraction
   - New purchases: Use 7% extraction

---

## 📝 Environment Variables Note

### ❌ DO NOT Update Vercel Environment Variable

The `NEXT_PUBLIC_FLAME_MARKUP_PERCENT` environment variable is **NO LONGER USED** in the code. 

- **Old code:** `parseFloat(process.env.NEXT_PUBLIC_FLAME_MARKUP_PERCENT || "10")`
- **New code:** `export const FLAME_MARKUP_PERCENT = 7;` (hardcoded)

**Action Required:**
- Leave the Vercel env variable as-is (or delete it)
- The hardcoded value in the code takes precedence
- This ensures consistent behavior across all environments

---

## 🔄 Future Considerations

When implementing per-event markup rates in the future:

1. **Store Markup Rate on Orders Table**
   - Add `markup_percent` column to `orders` table
   - Save the rate used at purchase time
   - Eliminates need for date-based logic

2. **Update Extraction Logic**
   - Use stored `markup_percent` if available
   - Fall back to date-based logic for old orders
   - Simplifies historical data handling

3. **Example Migration**
   ```sql
   ALTER TABLE orders ADD COLUMN markup_percent INTEGER DEFAULT 7;
   
   -- Backfill old orders with 10%
   UPDATE orders 
   SET markup_percent = 10 
   WHERE created_at < '2024-11-07';
   ```

---

## ✅ Files Modified

1. **`app/lib/pricing.ts`**
   - Added `MARKUP_HISTORY` constants
   - Created `extractBasePriceWithMarkup()` (internal)
   - Created `extractBasePriceHistorical()` (public)
   - Updated `extractBasePrice()` to use internal function

2. **`app/organizer/page.tsx`**
   - Changed import from `extractBasePrice` to `extractBasePriceHistorical`
   - Updated function call to include `order.created_at`

3. **`app/lib/utils/purchase-data.ts`**
   - Changed import from `extractBasePrice` to `extractBasePriceHistorical`
   - Updated function call to include `order.created_at`

---

## 🎓 Summary

The dashboard now correctly displays base prices for all purchases, regardless of when they were made. The system automatically uses:
- **10% markup rate** for orders before Nov 7, 2024
- **7% markup rate** for orders after Nov 7, 2024

This ensures accurate financial reporting and organizer payouts without requiring any manual data updates or complex migrations.

---

**Status:** ✅ Ready to deploy alongside the main service fee migration

