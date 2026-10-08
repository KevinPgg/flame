# Pricing Fields Reference Guide

This document provides a comprehensive list of all pricing-related fields used throughout the Flame ticketing application.

## Database Columns

### `orders` Table
The orders table stores the final purchase information with multiple price breakdown fields:

- **`unit_price_cents`** (INTEGER)
  - Price per ticket in cents (what customer pays per ticket, including fees)
  - This is the final price: `base_price + service_fee + iva`
  - Used for: Displaying price per ticket, calculating subtotals
  - Location: `app/lib/utils/purchase-data.ts`, `app/organizer/page.tsx`, `app/api/purchase/complete-hold/route.ts`

- **`subtotal_cents`** (INTEGER)
  - Subtotal before fees: `unit_price_cents * quantity`
  - Used for: Calculating order totals, promo code validation
  - Location: `app/api/purchase/validate-promo-code/route.ts`, database functions

- **`fees_cents`** (INTEGER)
  - Processing fees (legacy field, often same as `processing_fee_cents`)
  - Used in: Database constraints, some calculations
  - Note: May be redundant with `processing_fee_cents`

- **`processing_fee_cents`** (INTEGER)
  - Processing fee amount in cents
  - Used for: Bank transfers, some payment flows
  - Location: `app/api/organizer/bank-transfer-tickets/route.ts`

- **`total_cents`** (INTEGER)
  - Total order amount: `subtotal_cents + fees_cents - discount_amount_cents`
  - Used for: Database constraints, calculations
  - Constraint: `total_cents = (subtotal_cents + fees_cents - COALESCE(discount_amount_cents, 0))`

- **`total_amount_cents`** (INTEGER)
  - **PRIMARY FIELD** - Final amount customer pays (after discount)
  - Formula: `(unit_price_cents * quantity) + fees - discount_amount_cents`
  - This is what gets charged to the customer
  - Used for: Revenue calculations, display, payment processing
  - Location: `app/organizer/page.tsx`, `app/lib/utils/purchase-data.ts`, `app/purchase/page.tsx`

- **`discount_amount_cents`** (INTEGER)
  - Discount amount applied from promotional codes
  - Applied to: Full subtotal (including fees)
  - Used for: Promo code calculations, revenue adjustments
  - Location: `app/api/purchase/validate-promo-code/route.ts`, `app/purchase/page.tsx`

- **`fee_percentage`** (NUMERIC(5,2))
  - Service fee percentage used (7.00 or 10.00)
  - Stored at order creation time for historical accuracy
  - Used for: Extracting base prices from historical orders
  - Location: `app/lib/pricing.ts` (extractBasePriceHistorical)

### `ticket_tiers` Table
Base tier pricing information:

- **`price_cents`** (INTEGER)
  - Base tier price in cents (final customer price including fees)
  - This is what the customer pays per ticket for this tier
  - Used for: Tier display, fallback when no stage pricing
  - Location: `app/lib/types/event.ts`, `app/lib/utils/purchase-calculations.ts`

- **`fee_percentage`** (NUMERIC(5,2))
  - Service fee percentage used when tier was created
  - Used for: Historical price extraction

### `ticket_stages` Table
Stage-specific pricing (overrides tier base price):

- **`price_cents`** (INTEGER)
  - Stage price in cents (final customer price including fees)
  - Used when: Stage is active and has tickets available
  - Priority: Stage price > Tier base price
  - Location: `app/lib/types/event.ts`, `app/lib/utils/purchase-calculations.ts`

- **`fee_percentage`** (NUMERIC(5,2))
  - Service fee percentage used when stage was created

### `rsvps` Table
RSVP-specific pricing (snapshot at RSVP time):

- **`stage_price_cents`** (INTEGER, nullable)
  - Price at time of RSVP (from stage if available, otherwise tier)
  - Used for: RSVP purchase flow, preserving historical pricing
  - Location: `app/purchase/page.tsx`, `app/api/holds/create/route.ts`

- **`fee_percentage`** (NUMERIC(5,2))
  - Service fee percentage used when RSVP was created

### `holds` Table
Hold session pricing (snapshot at hold creation):

- **`stage_price_cents`** (INTEGER, nullable)
  - Price at time of hold creation (from stage if available, otherwise tier)
  - Used for: Hold purchase flow, preserving pricing during hold period
  - Location: `app/purchase/page.tsx`, `app/api/holds/create/route.ts`

- **`fee_percentage`** (NUMERIC(5,2))
  - Service fee percentage used when hold was created

## TypeScript Interfaces & Types

### `PriceBreakdown` (from `app/lib/pricing.ts`)
Calculated breakdown of price components:

- **`basePrice`** (number, dollars)
  - What organizer receives (excludes service fee and IVA)
  
- **`serviceFee`** (number, dollars)
  - Flame's commission (7% or 10% of base price)
  
- **`iva`** (number, dollars)
  - 15% tax on service fee only
  
- **`finalPrice`** (number, dollars)
  - What customer pays: `basePrice + serviceFee + iva`
  
- **`basePriceCents`** (number, cents)
  - Base price in cents
  
- **`serviceFeeCents`** (number, cents)
  - Service fee in cents
  
- **`ivaCents`** (number, cents)
  - IVA in cents
  
- **`finalPriceCents`** (number, cents)
  - Final price in cents

### `Purchase` (from `app/lib/utils/purchase-data.ts`)
Purchase record interface:

- **`pricePerTicket`** (number, cents)
  - Price per ticket (from `order.unit_price_cents`)
  
- **`totalPrice`** (number, cents)
  - Full price including service fee and IVA (from `order.total_amount_cents`)
  
- **`basePrice`** (number, cents)
  - Base price only (what organizer receives, after discount)

### Purchase Page Interfaces (`app/purchase/page.tsx`)

- **`RsvpDetails.stage_price_cents`** (number | null)
  - Stage price at RSVP time
  
- **`RsvpDetails.ticket_tier.price_cents`** (number)
  - Tier base price
  
- **`HoldDetails.stage_price_cents`** (number | null)
  - Stage price at hold creation
  
- **`HoldDetails.ticket_tier.price_cents`** (number)
  - Tier base price

### User Tickets (`app/lib/hooks/useUserTickets.ts`)

- **`order.total_cents`** (number)
  - Total order amount
  
- **`order.subtotal_cents`** (number, optional)
  - Subtotal before discount
  
- **`order.discount_amount_cents`** (number, optional)
  - Discount applied
  
- **`order.unit_price_cents`** (number, optional)
  - Price per ticket

## Calculated/Computed Values

### In Purchase Flow (`app/purchase/page.tsx`)

- **`unitPrice`** (calculated via `calculateUnitPrice()`)
  - Returns: `stage_price_cents` if available, otherwise `ticket_tier.price_cents`
  - Used for: Display, calculations
  
- **`subtotal`** (calculated)
  - Formula: `unitPriceCents * quantity`
  - Used for: Promo code validation, display
  
- **`discountAmount`** (calculated)
  - Formula: `subtotal * discount_percentage / 100` or `discount_amount_cents` from API
  - Used for: Final total calculation
  
- **`finalTotal`** (calculated)
  - Formula: `Math.max(0, subtotal - discountAmount)`
  - Used for: Payment processing, display

### In Pricing Calculations (`app/lib/pricing.ts`)

- **`basePriceCents`** (extracted from `finalPriceCents`)
  - Reverse calculation from customer price to organizer price
  - Uses: `extractBasePrice()` or `extractBasePriceHistorical()`
  - Formula: `finalPriceCents / (1 + markup + markup*iva_rate)`
  
- **`serviceFeeCents`** (calculated)
  - Formula: `basePriceCents * markup_percent / 100`
  
- **`ivaCents`** (calculated)
  - Formula: `serviceFeeCents * 0.15`

### In Organizer Dashboard (`app/organizer/page.tsx`)

- **`totalCents`** (from `order.total_amount_cents`)
  - Final amount customer paid
  
- **`discountCents`** (from `order.discount_amount_cents`)
  - Discount applied
  
- **`subtotalBeforeDiscount`** (calculated)
  - Formula: `totalCents + discountCents`
  - Used for: Extracting base price from historical orders
  
- **`actualBasePrice`** (calculated)
  - Formula: `basePriceCents * (1 - discountProportion)`
  - What organizer actually receives after discount

### Purchase Details Base Price Calculation (`app/lib/utils/purchase-data.ts`)

The Purchase Details section (displayed in `app/components/OrganizerDashboard.tsx`) calculates the base price that organizers receive using the following fields from the `orders` table:

**Input Fields:**
- `order.total_amount_cents` - What customer paid (after discount)
- `order.discount_amount_cents` - Discount applied (if any)
- `order.created_at` - Order creation timestamp (for historical markup rate)
- `order.fee_percentage` - Stored fee percentage (7.00 or 10.00)

**Calculation Steps:**

1. **Add back discount to get subtotal before discount:**
   ```typescript
   const totalCents = order.total_amount_cents || 0;
   const discountCents = order.discount_amount_cents || 0;
   const subtotalBeforeDiscount = totalCents + discountCents;
   ```
   - Reason: Discounts are applied to the full subtotal (base + fees), so we need to reconstruct the original subtotal to extract the base price correctly.

2. **Extract base price using historical extraction:**
   ```typescript
   const priceBreakdown = extractBasePriceHistorical(
     subtotalBeforeDiscount,
     order.created_at,
     order.fee_percentage
   );
   ```
   - Uses `extractBasePriceHistorical()` to handle different markup rates (7% vs 10%) based on when the order was created
   - Returns `priceBreakdown.basePriceCents` which is the base price before discount

3. **Apply discount proportionally to base price:**
   ```typescript
   let actualBasePrice = priceBreakdown.basePriceCents;
   if (discountCents > 0 && subtotalBeforeDiscount > 0) {
     const discountProportion = discountCents / subtotalBeforeDiscount;
     actualBasePrice = Math.round(
       priceBreakdown.basePriceCents * (1 - discountProportion)
     );
   }
   ```
   - Calculates what portion of the discount applies to the base price
   - Formula: `discountProportion = discountCents / subtotalBeforeDiscount`
   - Then: `actualBasePrice = basePriceCents * (1 - discountProportion)`

4. **Store as `purchase.basePrice`:**
   ```typescript
   basePrice: actualBasePrice // Base price after discount (what organizer actually receives)
   ```

**Display Location:**
- Desktop table: `app/components/OrganizerDashboard.tsx` line 399
- Mobile cards: `app/components/OrganizerDashboard.tsx` line 438
- Format: `${(purchase.basePrice / 100).toFixed(2)}`

**Key Points:**
- This calculation ensures organizers see what they **actually receive** after discounts
- Uses historical extraction to correctly handle orders created with different markup rates
- Discounts are applied proportionally (not just to base price, but to the full subtotal including fees)
- Same calculation pattern is used in `app/organizer/page.tsx` for consistency

## Usage Patterns

### Price Priority Order
1. **Stage price** (`stage_price_cents`) - if stage exists and is active
2. **Tier base price** (`ticket_tier.price_cents`) - fallback

### Price Flow (Customer → Organizer)
1. Customer pays: `total_amount_cents` (includes fees, after discount)
2. Extract base: `extractBasePriceHistorical(total_amount_cents + discount_amount_cents)`
3. Apply discount proportion: `basePriceCents * (1 - discountProportion)`
4. Organizer receives: `actualBasePrice`

### Price Flow (Organizer → Customer)
1. Organizer sets: `basePriceDollars` (what they want to receive)
2. Calculate fees: `calculateFinalPrice(basePriceDollars)`
3. Customer pays: `finalPriceCents` (base + service fee + IVA)

## Key Functions

### `calculateUnitPrice()` (`app/lib/utils/purchase-calculations.ts`)
- Returns unit price prioritizing stage over tier
- Input: mode, rsvpDetails, holdDetails, ticketTier
- Output: price in cents

### `calculateFinalPrice()` (`app/lib/pricing.ts`)
- Calculates customer price from organizer base price
- Input: basePriceDollars
- Output: PriceBreakdown with all components

### `extractBasePrice()` (`app/lib/pricing.ts`)
- Extracts organizer base price from customer price (current rate)
- Input: finalPriceCents
- Output: PriceBreakdown

### `extractBasePriceHistorical()` (`app/lib/pricing.ts`)
- Extracts organizer base price using historical markup rate
- Input: finalPriceCents, orderCreatedAt, feePercentage (optional)
- Output: PriceBreakdown

### `calculateFeeBreakdownFromTotal()` (`app/lib/pricing.ts`)
- Calculates fee breakdown from total amount
- Input: totalCents, options (orderCreatedAt, feePercentage)
- Output: { basePriceCents, serviceFeeCents, ivaCents }

## Common Patterns

### Displaying Prices
- **Customer-facing**: Use `total_amount_cents` or `unit_price_cents`
- **Organizer-facing**: Extract `basePriceCents` using `extractBasePriceHistorical()`

### Calculating Totals
- **Subtotal**: `unit_price_cents * quantity`
- **With discount**: `subtotal - discount_amount_cents`
- **Final total**: `total_amount_cents` (stored in database)

### Historical Price Extraction
- Always use `extractBasePriceHistorical()` for completed orders
- Pass `order.created_at` and `order.fee_percentage` when available
- Handles both 7% and 10% markup rates automatically

## Notes

- All prices are stored in **cents** (integers) to avoid floating-point errors
- Display values are converted to dollars by dividing by 100
- `total_amount_cents` is the **primary field** for what customer actually paid
- `unit_price_cents` represents the per-ticket price (including fees)
- Discounts are applied to the **full subtotal** (base + fees), not just base price
- Base price extraction accounts for discounts proportionally

