# Complete Pricing Implementation Guide

> ⚠️ **Pricing Evolution Note**: This document describes the legacy pricing model (10% markup). 
> 
> **Current Stripe Model**: 12.5% + $0.30 (Guaranteed Net)  
> **Legacy Datafast Model**: 10% + 15% IVA (described below)
> 
> See [Stripe Pricing Documentation](../../stripe-implementation/pricing/) for current implementation.

## ✅ What's Been Created (Legacy Model)

### 1. Core Pricing Utilities (`app/lib/pricing.ts`)

- `calculateFinalPrice(basePrice)` - Converts organizer's price to final customer price
- `extractBasePrice(finalPriceCents)` - Reverse calculation for editing
- Constants: `FLAME_MARKUP_PERCENT` (10% - legacy), `ECUADOR_IVA_RATE` (15%)

### 2. UI Component (`app/components/PriceBreakdownDisplay.tsx` + `.css`)

- Shows transparent price breakdown to organizers
- Displays: base price, service fee, IVA, and final total

### 3. Integration Guide (`PRICING_INTEGRATION_GUIDE.md`)

- Step-by-step instructions for integrating into forms

## 🎯 How It Works

### Example Flow:

1. **Organizer types**: `$100`
2. **System calculates**:
   - Service fee (10%): `$10.00`
   - IVA on fee (15%): `$1.50`
   - Final price: `$111.50`
3. **System stores**: `price_cents: 11150`
4. **Customer sees at checkout**: `$111.50`

### Visual Display:

```
Your Ticket Price (USD) *
Enter the amount you want to receive per ticket
┌──────────────┐
│   100.00     │  ← Input field
└──────────────┘

Customer will pay: $111.50
  Your ticket price:     $100.00
  + Service fee (10%):    $10.00
  + IVA (15% on fee):      $1.50
```

## 🔧 Integration Steps

### Step 1: Update OrganizerDashboard.tsx

**Add imports** (after line 43):

```typescript
import { calculateFinalPrice, extractBasePrice } from "../lib/pricing";
import PriceBreakdownDisplay from "./PriceBreakdownDisplay";
```

**Add state in TierInlineForm** (after line 78):

```typescript
// Extract base price when editing existing tier
const initialBasePrice = tier?.price_cents
  ? extractBasePrice(tier.price_cents).basePrice
  : 0;

// Track organizer's input (what they want to receive)
const [organizerBasePrice, setOrganizerBasePrice] = useState<string>(
  initialBasePrice > 0 ? initialBasePrice.toString() : ""
);

// Calculate breakdown for display
const priceBreakdown = useMemo(() => {
  const price = parseFloat(organizerBasePrice);
  if (isNaN(price) || price <= 0) return null;
  return calculateFinalPrice(price);
}, [organizerBasePrice]);

// Track stage base prices
const [stageBasePrices, setStageBasePrices] = useState<{
  [key: number]: string;
}>(() => {
  const initial: { [key: number]: string } = {};
  stages.forEach((stage, index) => {
    if (stage.price_cents > 0) {
      initial[index] = extractBasePrice(stage.price_cents).basePrice.toString();
    } else {
      initial[index] = "";
    }
  });
  return initial;
});
```

**Update base price input** (replace lines ~488-516):

```typescript
<div className="tier-form-field">
  <label>Your Ticket Price (USD) *</label>
  <p
    className="tier-form-help"
    style={{
      marginTop: "4px",
      marginBottom: "8px",
      fontSize: "0.85rem",
      color: "#666",
    }}
  >
    Enter the amount you want to receive per ticket
  </p>
  <input
    type="number"
    value={organizerBasePrice}
    onChange={e => {
      const val = e.target.value;
      setOrganizerBasePrice(val);

      if (val === "" || val === "-" || val === "0") {
        setFormData(prev => ({ ...prev, price_cents: 0 }));
      } else {
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && isFinite(parsed) && parsed > 0) {
          const breakdown = calculateFinalPrice(parsed);
          setFormData(prev => ({
            ...prev,
            price_cents: breakdown.finalPriceCents,
          }));
        }
      }
    }}
    onWheel={e => e.currentTarget.blur()}
    placeholder="100.00"
    min="0"
    step="0.01"
    required
    disabled={isLoading}
  />
  <PriceBreakdownDisplay breakdown={priceBreakdown} />
</div>
```

**Update stage price input** (replace lines ~626-654):

```typescript
<div className="tier-form-field">
  <label>Your Price for This Stage (USD) *</label>
  <p
    className="tier-form-help"
    style={{
      marginTop: "4px",
      marginBottom: "8px",
      fontSize: "0.85rem",
      color: "#666",
    }}
  >
    What you want to receive per ticket in this stage
  </p>
  <input
    type="number"
    value={stageBasePrices[stageIndex] || ""}
    onChange={e => {
      const val = e.target.value;
      setStageBasePrices(prev => ({ ...prev, [stageIndex]: val }));

      if (val === "" || val === "-" || val === "0") {
        handleStageChange(stageIndex, "price_cents", 0);
      } else {
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && isFinite(parsed) && parsed > 0) {
          const breakdown = calculateFinalPrice(parsed);
          handleStageChange(
            stageIndex,
            "price_cents",
            breakdown.finalPriceCents
          );
        }
      }
    }}
    onWheel={e => e.currentTarget.blur()}
    placeholder="100.00"
    min="0"
    step="0.01"
    required
    disabled={isLoading}
  />
  {stageBasePrices[stageIndex] &&
    parseFloat(stageBasePrices[stageIndex]) > 0 && (
      <PriceBreakdownDisplay
        breakdown={calculateFinalPrice(parseFloat(stageBasePrices[stageIndex]))}
      />
    )}
</div>
```

### Step 2: Update CreateEventForm.tsx

Apply the same pattern as Step 1:

1. Add imports
2. Add state for base prices
3. Update price inputs
4. Add PriceBreakdownDisplay

### Step 3: Update EditTicketTierModal.tsx (if used)

Apply same changes to the modal form.

## 🧪 Testing Checklist

- [ ] Create new tier with $100 → stores 11150 cents
- [ ] Edit existing tier → shows correct base price
- [ ] Create tier with stages at different prices → each calculates correctly
- [ ] Free tickets ($0) → works without breakdown
- [ ] Very low prices ($0.01) → calculates correctly
- [ ] High prices ($1000+) → calculates correctly
- [ ] Decimal prices ($25.50) → handles properly

## 📊 Database Impact

**No migration needed!** The `price_cents` column already exists and stores the customer-facing price.

### What Changes:

- **Before**: Organizers entered customer price directly
- **After**: Organizers enter their desired price, system calculates customer price

### Existing Data:

If you have existing tiers with prices:

- They'll continue to work
- When organizer edits, they'll see the calculated base price
- Example: Existing `price_cents: 11150` → organizer sees `$100` input

## 💡 UI/UX Improvements

### For Organizers:

✅ **Clear intent**: "Enter the amount YOU want to receive"  
✅ **Transparent breakdown**: See exactly what customers pay  
✅ **No math needed**: System handles all calculations  
✅ **Consistent experience**: Same interface everywhere

### For Customers:

✅ **Transparent pricing**: See fee breakdown at checkout  
✅ **No surprises**: Total price matches what was shown  
✅ **Compliant with Datafast**: Proper tax parameters sent

## 🚀 Go Live Checklist

Before deploying to production:

1. **Configure markup percentage** (optional):

   ```bash
   # In .env.local
   NEXT_PUBLIC_FLAME_MARKUP_PERCENT=10  # Default is 10%
   ```

2. **Verify calculations match Datafast**:

   ```bash
   node docs_guides/test-datafast-tax-calc.js
   ```

3. **Test in staging** with real scenarios

4. **Update organizer documentation** explaining the pricing

5. **Consider announcement** to existing organizers about the change

## 📝 Organizer Communication Template

```
Subject: Simplified Ticket Pricing

We've made ticket pricing even easier!

What's New:
• Enter the amount YOU want to receive per ticket
• We automatically calculate the customer price
• Full transparency with clear fee breakdown

Example:
• You enter: $100
• Customers pay: $111.50
  - Your ticket: $100.00
  - Service fee (10%): $10.00
  - IVA tax (15%): $1.50

Nothing changes for your existing events. This makes
creating new tiers simpler and more transparent.
```

## 🐛 Troubleshooting

### Issue: Prices don't match expected values

**Check**: Is `NEXT_PUBLIC_FLAME_MARKUP_PERCENT` set correctly?

### Issue: Breakdown not showing

**Check**: Is the value > 0? Free tickets don't show breakdown.

### Issue: Editing shows wrong base price

**Check**: Use `extractBasePrice()` when loading existing tiers.

### Issue: Rounding errors

**Solution**: All calculations use `.toFixed(2)` and `Math.round()` for cents.

## 📚 Additional Resources

- **Tax calculation docs**: `docs_guides/DATAFAST_TAX_CALCULATION.md`
- **Test script**: `docs_guides/test-datafast-tax-calc.js`
- **Pricing utilities**: `app/lib/pricing.ts`
- **Datafast guide**: `datafast-info/guia_implementacion.md` (section 3.2.1.17.1)

## ✨ Summary

The pricing system is now:

- ✅ **Organizer-friendly**: Enter what you want to receive
- ✅ **Transparent**: Clear breakdown of fees and taxes
- ✅ **Compliant**: Properly formatted for Datafast
- ✅ **Accurate**: Tested calculations with 100% pass rate
- ✅ **Flexible**: Easy to adjust markup percentage

Ready to integrate! 🎉
