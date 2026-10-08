# Datafast Tax Calculation Implementation

## Overview

This document explains how Flame implements Ecuador's IVA (VAT) tax calculations for Datafast payment processing, in compliance with section **3.2.1.17.1 Datos de Impuestos** of the Datafast implementation guide.

## Ecuador Tax Structure

As of **April 1, 2024**, Ecuador's standard IVA rate is **15%** (subject to change).

### How Flame Applies Taxes

Flame's revenue model consists of:

1. **Base Ticket Price** (set by event organizer) - **TAX-EXEMPT** (no IVA)
2. **Service Fee/Markup** (Flame's commission) - **TAXABLE** (15% IVA applies)

This structure is legally compliant because:

- Event tickets themselves are tax-exempt goods
- Service fees for ticket processing are taxable services

## Datafast Required Parameters

Per Datafast guide section 3.2.1.17.1, every transaction **must** include these three parameters:

| Parameter                               | Description                      | Example  |
| --------------------------------------- | -------------------------------- | -------- |
| `customParameters[SHOPPER_VAL_BASE0]`   | Tax-exempt amount (ticket price) | "100.00" |
| `customParameters[SHOPPER_VAL_BASEIMP]` | Taxable base (service fee)       | "10.00"  |
| `customParameters[SHOPPER_VAL_IVA]`     | IVA/tax amount (15% of BASEIMP)  | "1.50"   |

**Format Requirements:**

- Must use 2 decimal places: `#######.##`
- No thousands separator
- Must be strings, not numbers
- Sum must equal the total transaction amount

## Calculation Formula

### Forward Calculation (Organizer Price → Customer Price)

Given an organizer's base price and Flame's markup percentage:

```javascript
// Configuration
const basePrice = 100.0; // Organizer's ticket price
const markupPercent = 10; // Flame's markup percentage (10%)
const ivaRate = 0.15; // Ecuador IVA rate (15%)

// Calculate breakdown
const markupAmount = basePrice * (markupPercent / 100); // $10.00
const ivaAmount = markupAmount * ivaRate; // $1.50
const totalCustomerPays = basePrice + markupAmount + ivaAmount; // $111.50

// Datafast parameters
const SHOPPER_VAL_BASE0 = basePrice.toFixed(2); // "100.00"
const SHOPPER_VAL_BASEIMP = markupAmount.toFixed(2); // "10.00"
const SHOPPER_VAL_IVA = ivaAmount.toFixed(2); // "1.50"
```

### Reverse Calculation (Customer Price → Tax Breakdown)

In Flame's system, the `price_cents` field already contains the **total amount** the customer pays (including markup and IVA). We need to reverse-calculate the breakdown:

```javascript
// Given total amount customer pays
const totalAmount = 111.5;

// Calculate components
const markupPercent = 10; // From FLAME_MARKUP_PERCENT env var
const ivaRate = 0.15; // Ecuador IVA rate

// Formula: total = base + (base * markup%) + (base * markup% * IVA%)
// Solving for base: base = total / (1 + markup% + (markup% * IVA%))

const markupMultiplier = markupPercent / 100; // 0.10
const ivaMultiplier = markupMultiplier * ivaRate; // 0.015
const divisor = 1 + markupMultiplier + ivaMultiplier; // 1.115

const baseTicketPrice = totalAmount / divisor; // $100.00
const markupAmount = baseTicketPrice * markupMultiplier; // $10.00
const ivaAmount = markupAmount * ivaRate; // $1.50

// Datafast parameters
const SHOPPER_VAL_BASE0 = baseTicketPrice.toFixed(2); // "100.00"
const SHOPPER_VAL_BASEIMP = markupAmount.toFixed(2); // "10.00"
const SHOPPER_VAL_IVA = ivaAmount.toFixed(2); // "1.50"
```

## Implementation in Flame

### Environment Variables

Add to your `.env.local`:

```bash
# Flame markup percentage (default: 10%)
FLAME_MARKUP_PERCENT=10
```

### Code Location

The tax calculation is implemented in:

```text
app/api/datafast/create-checkout/route.ts
```

Key sections:

- **Lines 37-41**: Configuration constants
- **Lines 133-168**: Tax calculation logic
- **Lines 214-217**: Datafast parameter assignment

### Example Transaction Flow

1. **Event organizer** creates ticket tier at **$100.00**
2. **System stores** `price_cents: 11150` (includes 10% markup + 15% IVA)
3. **Customer** sees total price: **$111.50**
4. **On checkout**, system calculates:
   - BASE0: $100.00 (organizer gets this)
   - BASEIMP: $10.00 (Flame's service fee)
   - IVA: $1.50 (government tax on service fee)
5. **Datafast receives** all three parameters for tax reporting

## Verification & Testing

### Manual Verification

Use this formula to verify any calculation:

```javascript
// Verify sum equals total
const sum = parseFloat(BASE0) + parseFloat(BASEIMP) + parseFloat(IVA);
const expectedTotal = 111.5;

console.assert(
  Math.abs(sum - expectedTotal) < 0.01,
  `Tax breakdown sum (${sum}) should equal total (${expectedTotal})`
);
```

### Test Cases

| Scenario         | Base Price | Markup % | IVA Rate | BASE0  | BASEIMP | IVA  | Total  |
| ---------------- | ---------- | -------- | -------- | ------ | ------- | ---- | ------ |
| Standard         | $100.00    | 10%      | 15%      | 100.00 | 10.00   | 1.50 | 111.50 |
| Low price        | $10.00     | 10%      | 15%      | 10.00  | 1.00    | 0.15 | 11.15  |
| High price       | $500.00    | 10%      | 15%      | 500.00 | 50.00   | 7.50 | 557.50 |
| Different markup | $100.00    | 15%      | 15%      | 100.00 | 15.00   | 2.25 | 117.25 |

### Console Logs

When a checkout is created, the server logs will show:

```text
Tax breakdown (Ecuador IVA 15%):
- Total amount received: 111.50
- BASE0 (ticket price, tax-exempt): 100.00
- BASEIMP (service fee 10%, taxable): 10.00
- IVA (15% on service fee): 1.50
- Verification sum: 111.50
```

## Common Issues & Troubleshooting

### Issue: "transaction declined (invalid tax number)" (Code 800.100.199)

**Cause**: The sum of BASE0 + BASEIMP + IVA doesn't equal the transaction amount.

**Solution**:

- Check that `FLAME_MARKUP_PERCENT` is set correctly
- Verify rounding is consistent (always `.toFixed(2)`)
- Ensure no floating-point precision errors

### Issue: Rounding Errors

**Cause**: Floating-point arithmetic can cause tiny discrepancies (e.g., 111.4999999 vs 111.50)

**Solution**: Always use `.toFixed(2)` for all currency values before comparison

```javascript
// ❌ Bad
const sum = base0 + baseimp + iva;

// ✅ Good
const sum =
  parseFloat(base0.toFixed(2)) +
  parseFloat(baseimp.toFixed(2)) +
  parseFloat(iva.toFixed(2));
```

### Issue: Testing in Datafast Phase 2

**Note**: The example in the Datafast guide (Table 3) uses **12% IVA** because it was written before April 2024. Ecuador's rate is now **15%**.

Always use `0.15` for current transactions.

## Compliance & Audit

### Tax Reporting

The three parameters are stored in `datafast_transactions` table for audit purposes:

- Allows tracking of tax-exempt vs taxable amounts
- Enables accurate IVA reporting to Ecuador's tax authority (SRI)
- Supports financial reconciliation

### Record Keeping

Each transaction stores:

```sql
-- In datafast_transactions table
{
  "checkout_request_data": {
    "customParameters": {
      "SHOPPER_VAL_BASE0": "100.00",
      "SHOPPER_VAL_BASEIMP": "10.00",
      "SHOPPER_VAL_IVA": "1.50"
    }
  }
}
```

## Future Considerations

### If IVA Rate Changes

If Ecuador updates the IVA rate (e.g., back to 12% or to a new rate):

1. Update the constant in `route.ts`:

   ```javascript
   const ECUADOR_IVA_RATE = 0.12; // Update this value
   ```

2. Update this documentation

3. **Important**: Prices in the database (`price_cents`) will need recalculation if you want to maintain the same net revenue. Use a migration script.

### If Markup Percentage Changes

To change Flame's commission percentage:

1. Update environment variable:

   ```bash
   FLAME_MARKUP_PERCENT=15  # New percentage
   ```

2. Restart the application

3. **Note**: Existing ticket prices won't auto-update. New tickets will use the new rate.

## Reference Links

- [Datafast Implementation Guide (v3.2.1)](../datafast-info/guia_implementacion.md) - Section 3.2.1.17.1
- [Ecuador Tax Authority (SRI)](https://www.sri.gob.ec/)
- [IVA Rate History in Ecuador](https://pageroab.zendesk.com/hc/en-us/articles/23474805280402)

## Summary

✅ **Correct Implementation**:

- BASE0 = Organizer's ticket price (tax-exempt)
- BASEIMP = Flame's service fee (taxable)
- IVA = 15% of service fee
- Total = BASE0 + BASEIMP + IVA

✅ **Datafast Compliance**: All three parameters sent with every transaction

✅ **Ecuador Tax Law**: Properly separates tax-exempt goods from taxable services

✅ **Audit-Ready**: All tax breakdowns logged and stored for reconciliation
