# Datafast Tax Calculation Fix - Summary

> ⚠️ **Legacy System Documentation**: This document describes a tax calculation fix for the Datafast payment system, which has been replaced by Stripe Connect. Datafast remains active for existing transactions during the deprecation period but is not used for new implementations.
> 
> **Current System**: Stripe Connect handles all payment processing and tax calculations. See [Payment Systems Evolution](../PAYMENT_SYSTEMS_EVOLUTION.md) for migration details.
> 
> **Purpose of This Doc**: Retained for historical reference and to support existing Datafast transactions during the transition period.

---

## ✅ What Was Fixed (Historical)

The Datafast integration was **incorrectly calculating** the three required tax parameters (`SHOPPER_VAL_BASE0`, `SHOPPER_VAL_BASEIMP`, `SHOPPER_VAL_IVA`) per section 3.2.1.17.1 of the Datafast implementation guide.

### ❌ Before (Incorrect)

```javascript
const base0 = "0.00"; // Wrong: Said no tax-exempt amount
const baseImponible = amountInDollars; // Wrong: Treated full amount as taxable
const ivaAmount = "0.00"; // Wrong: No IVA calculated
```

This would cause transactions to be **rejected by Datafast** with error code `800.100.199` (invalid tax number) because the values don't match Ecuador's tax structure.

### ✅ After (Correct)

```javascript
// For $111.50 total with 10% markup:
const base0 = "100.00"; // Ticket price (tax-exempt)
const baseImponible = "10.00"; // Service fee (taxable)
const ivaAmount = "1.50"; // 15% IVA on service fee
// Sum: $100 + $10 + $1.50 = $111.50 ✓
```

## 📋 Changes Made

### 1. Updated `/app/api/datafast/create-checkout/route.ts`

**Added constants** (lines 37-41):

- `FLAME_MARKUP_PERCENT`: Configurable markup percentage (default: 10%)
- `ECUADOR_IVA_RATE`: Current Ecuador IVA rate (15% as of April 2024)

**Replaced tax calculation** (lines 133-168):

- Implements proper reverse calculation from total → breakdown
- Uses correct formula: `base = total / (1 + markup% + (markup% * IVA%))`
- Ensures BASE0 + BASEIMP + IVA = total amount
- Adds detailed logging for verification

**Fixed variable references**:

- Changed `amountFloat` → `totalAmount` throughout file
- Ensures consistent naming

### 2. Created Documentation (Historical)

**`/docs/datafast/DATAFAST_TAX_CALCULATION.md`** (if it exists):

- Comprehensive explanation of tax structure
- Formula derivation (forward and reverse)
- Test cases and verification methods
- Troubleshooting guide
- Compliance and audit information

**Test Suite** (Historical reference - may not exist in current codebase):

- Automated test suite was created for validation
- Verified calculations across multiple scenarios
- Tested roundtrip accuracy (forward → reverse → forward)
- Note: Test files may have been removed during Stripe migration

## 🧪 Verification

If the test script is present, run:

```bash
node docs/datafast/test-datafast-tax-calc.js
```

Historical output:

```text
=================================================
✅ ALL TESTS PASSED (6/6)
=================================================
```

Test scenarios covered:

1. ✅ Standard case: $100 ticket, 10% markup
2. ✅ Low price: $10 ticket
3. ✅ High price: $500 ticket
4. ✅ Different markup: 15% instead of 10%
5. ✅ Edge case: $0.01 (minimum)
6. ✅ Edge case: $9999 (large amount)

## 📊 Example Calculation

For a **$100 ticket** with **10% markup**:

| Component   | Amount      | Description                           |
| ----------- | ----------- | ------------------------------------- |
| BASE0       | $100.00     | Organizer's ticket price (tax-exempt) |
| + BASEIMP   | $10.00      | Flame's 10% service fee (taxable)     |
| + IVA       | $1.50       | 15% IVA on the $10 service fee        |
| = **TOTAL** | **$111.50** | Amount customer pays                  |

### Datafast Parameters

```javascript
customParameters[SHOPPER_VAL_BASE0] = "100.00";
customParameters[SHOPPER_VAL_BASEIMP] = "10.00";
customParameters[SHOPPER_VAL_IVA] = "1.50";
```

## 🎯 Your Original Formula

Your formula was **100% correct** ✅:

```javascript
const basePrice = 100.0;
const markupPercent = 10;

const gestionVenta = basePrice * (markupPercent / 100); // $10.00
const ivaAmount = gestionVenta * 0.15; // $1.50

customParameters[SHOPPER_VAL_BASE0] = basePrice.toFixed(2); // "100.00"
customParameters[SHOPPER_VAL_BASEIMP] = gestionVenta.toFixed(2); // "10.00"
customParameters[SHOPPER_VAL_IVA] = ivaAmount.toFixed(2); // "1.50"
```

The implementation now uses this **exact same logic**, just with a reverse calculation since Flame stores the total amount in `price_cents`.

## 🔧 Environment Configuration

Add to your `.env.local` (optional):

```bash
# Flame markup percentage - defaults to 10% if not set
FLAME_MARKUP_PERCENT=10
```

If you change this value:

- Restart your Next.js server
- New checkouts will use the new percentage
- Existing `price_cents` in database won't auto-update

## ⚠️ Important Notes

### 1. Database Price Structure

Currently, `ticket_tiers.price_cents` stores the **total customer price** (including markup + IVA).

**Example**:

- If organizer wants $100 for their ticket
- You add 10% markup: $10
- You add 15% IVA on markup: $1.50
- Store in DB: `price_cents: 11150` ($111.50 in cents)

The Datafast integration will **automatically** break this down correctly.

### 2. Console Verification

When you create a Datafast checkout, you'll see in server logs:

```text
Tax breakdown (Ecuador IVA 15%):
- Total amount received: 111.50
- BASE0 (ticket price, tax-exempt): 100.00
- BASEIMP (service fee 10%, taxable): 10.00
- IVA (15% on service fee): 1.50
- Verification sum: 111.50
```

**Always verify** the sum matches the total amount!

### 3. Ecuador IVA Rate

The **15% rate** was last verified in **April 2024**.

If Ecuador changes the rate:

- Update `ECUADOR_IVA_RATE` constant in the code
- Update documentation
- Consider recalculating existing `price_cents` values

## Historical Testing Approach - Datafast (Deprecated)

> **Note**: The following testing steps were used during the Datafast implementation period. These are retained for historical reference only and should not be performed on the current Stripe-based system.

### 1. Test in Datafast Phase 2 (Historical)

Test transactions that were performed:

- $100 ticket (became $111.50 total)
- Verified Datafast accepted the transaction
- Confirmed no `800.100.199` error occurred

### 2. Monitor Logs (Historical)

Server logs showed tax breakdown during Datafast implementation:

```bash
# Historical command - not applicable to current Stripe system
npm run dev
# Then create a checkout and watch for "Tax breakdown" logs
```

### 3. Production Checklist (Historical - Deprecated)

Checklist items that were completed before Datafast deprecation:

- ✅ Verified `FLAME_MARKUP_PERCENT` was set correctly (deprecated, for historical reference only)
- ✅ Tested with real amounts
- ✅ Confirmed all tax parameters summed to total amount
- ✅ Checked Datafast transaction logs
- Note: Test script reference removed (file may not exist in current codebase)

## 📚 Reference

- **Datafast Guide**: Section 3.2.1.17.1 "Datos de Impuestos"
- **Implementation**: `/app/api/datafast/create-checkout/route.ts`
- **Full Documentation**: `/docs/datafast/DATAFAST_TAX_CALCULATION.md`
- **Test Script**: `/docs/datafast/test-datafast-tax-calc.js`

## 🎉 Summary

✅ Tax calculations now **fully compliant** with Datafast requirements

✅ Properly implements Ecuador's **15% IVA** on service fees

✅ Tax-exempt ticket price + Taxable service fee structure

✅ All test cases pass with **100% accuracy**

✅ Comprehensive documentation and testing tools provided

---

**Questions?** Check `/docs/datafast/DATAFAST_TAX_CALCULATION.md` for detailed explanations!
