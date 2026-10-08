# Pricing Integration Guide

This guide shows how to integrate the new pricing calculator into your ticket tier forms.

## Changes Needed

### 1. OrganizerDashboard.tsx

**Add imports at the top** (after line 43):

```typescript
import {
  calculateFinalPrice,
  extractBasePrice,
  formatPrice,
} from "../lib/pricing";
import PriceBreakdownDisplay from "./PriceBreakdownDisplay";
```

**In `TierInlineForm` component (around line 71), add new state variables:**

Replace the `formData` state initialization with:

```typescript
// Extract base price if editing existing tier
const initialBasePrice = tier?.price_cents
  ? extractBasePrice(tier.price_cents).basePrice
  : 0;

const [formData, setFormData] = useState({
  name: tier?.name || "",
  price_cents: tier?.price_cents || 0,
  quantity_total: tier?.quantity_total || 100,
  per_user_limit: tier?.per_user_limit || 4,
  sales_start: tier?.sales_start ? utcToEcuadorLocal(tier.sales_start) : "",
  sales_end: tier?.sales_end ? utcToEcuadorLocal(tier.sales_end) : "",
});

// Track organizer's input price (what they want to receive)
const [organizerBasePrice, setOrganizerBasePrice] = useState<string>(
  initialBasePrice > 0 ? initialBasePrice.toString() : ""
);

// Calculate price breakdown for display
const priceBreakdown = useMemo(() => {
  const price = parseFloat(organizerBasePrice);
  if (isNaN(price) || price <= 0) return null;
  return calculateFinalPrice(price);
}, [organizerBasePrice]);
```

**Replace the base price input section** (lines 484-517):

Find this section:

```typescript
{!useStages && (
  <div className="tier-form-row">
    <div className="tier-form-field">
      <label>Price (USD) *</label>
      <input
        type="number"
        value={
          typeof formData.price_cents === "number"
            ? (formData.price_cents / 100).toString()
            : ""
        }
        onChange={e => {
          const val = e.target.value;
          if (val === "" || val === "-") {
            setFormData(prev => ({ ...prev, price_cents: null }));
          } else {
            const parsed = parseFloat(val);
            if (!isNaN(parsed) && isFinite(parsed)) {
              setFormData(prev => ({
                ...prev,
                price_cents: Math.round(parsed * 100),
              }));
            }
          }
        }}
        ...
      />
    </div>
```

Replace with:

```typescript
{!useStages && (
  <div className="tier-form-row">
    <div className="tier-form-field">
      <label>Your Ticket Price (USD) *</label>
      <p className="tier-form-help" style={{ marginTop: '4px', marginBottom: '8px', fontSize: '0.85rem', color: '#666' }}>
        Enter the amount you want to receive per ticket
      </p>
      <input
        type="number"
        value={organizerBasePrice}
        onChange={e => {
          const val = e.target.value;
          setOrganizerBasePrice(val);

          // Calculate and store final price
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

**For stage prices** (around line 625), do similar updates:

Add state for each stage's base price in the component (after the stages state):

```typescript
// Track organizer input prices for stages
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

Then update the stage price input and add breakdown:

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

      // Update stage base price tracking
      setStageBasePrices(prev => ({
        ...prev,
        [stageIndex]: val,
      }));

      // Calculate and store final price
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

### 2. CreateEventForm.tsx

Apply the same pattern:

1. Add imports
2. Add state for tracking base prices
3. Update the price input handlers
4. Add PriceBreakdownDisplay components

### 3. Testing

After integration, test:

1. Create new tier with price $100 → should store 11150 cents
2. Edit existing tier → should show $100 base price
3. Stages with different prices → each shows correct breakdown
4. Free tickets ($0) → should not show breakdown

## Summary

The key changes:

- **Organizer enters**: Their desired revenue ($100)
- **System calculates**: Final price ($111.50) with 10% fee + 15% IVA
- **System stores**: `price_cents: 11150` (the full amount)
- **Customer sees**: $111.50 at checkout
- **Breakdown shows**: Transparent pricing

This ensures organizers know exactly what they'll receive while customers see the full transparent price including all fees and taxes.
