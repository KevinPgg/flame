# Datafast Phase 2 Upgrade - Complete (Deprecated / Historical)

> ⚠️ **Deprecated Documentation**: This document describes the Datafast Phase 2 upgrade which was completed in October 2025 but has since been superseded by Stripe Connect. Datafast is no longer used for new implementations. This document is retained for historical reference and audit trail purposes. For current payment processing, see Stripe Connect documentation. See [Payment Systems Evolution](../PAYMENT_SYSTEMS_EVOLUTION.md) for migration details.

## ✅ What Was Changed (Historical)

### 1. Environment Variables Updated (`.env.local`)

⚠️ **SECURITY NOTE**: Test credentials have been redacted. Obtain actual test credentials from Datafast dashboard.

**Phase 2 Test Credentials Format:**

```bash
DATAFAST_TEST_ENTITY_ID=<YOUR_TEST_ENTITY_ID_FROM_DATAFAST>
DATAFAST_TEST_BEARER_TOKEN=Bearer <YOUR_TEST_BEARER_TOKEN_FROM_DATAFAST>
DATAFAST_TEST_MID=<YOUR_TEST_MID_FROM_DATAFAST>
DATAFAST_TEST_TID=<YOUR_TEST_TID_FROM_DATAFAST>
```

**Backup Created:** `.env.local.phase1-backup`

---

### 2. Create Checkout API Updated

**File:** `app/api/datafast/create-checkout/route.ts`

**Phase 2 Required Fields Added:**

#### Customer Information (Enhanced)

- `customer.givenName` - First name
- `customer.surname` - Last name
- `customer.email` - Email address
- `customer.ip` - Client IP address
- `customer.phone` - Phone number
- `customer.identificationDocType` - Document type (IDCARD)
- `customer.identificationDocId` - Document ID (10 characters, padded with zeros)
- `customer.merchantCustomerId` - Unique customer ID (max 16 chars)

#### Addresses

- `billing.street1` - Billing address
- `billing.country` - Billing country (ISO 3166-1)
- `shipping.street1` - Shipping address (same as billing for digital goods)
- `shipping.country` - Shipping country

#### Cart Items (Required in Phase 2)

- `cart.items[0].name` - Event name
- `cart.items[0].description` - Ticket description
- `cart.items[0].price` - Item price
- `cart.items[0].quantity` - Quantity

#### Tax Parameters (Ecuador IVA)

- `customParameters[SHOPPER_VAL_BASE0]` - Tax-exempt amount (0.00)
- `customParameters[SHOPPER_VAL_BASEIMP]` - Taxable base amount
- `customParameters[SHOPPER_VAL_IVA]` - IVA/tax amount

**Tax Calculation Logic:**

```javascript
const amountFloat = parseFloat(amountInDollars);
const ivaRate = 0.15; // 15% Ecuador IVA
const base0 = "0.00";
const baseImponible = (amountFloat / (1 + ivaRate)).toFixed(2);
const ivaAmount = (amountFloat - parseFloat(baseImponible)).toFixed(2);
```

#### Merchant Identifiers (Required in Phase 2)

- `customParameters[SHOPPER_MID]` - Merchant ID (from your test credentials)
- `customParameters[SHOPPER_TID]` - Terminal ID (from your test credentials)

#### Security Identifiers (Required in Phase 2)

- `customParameters[SHOPPER_ECI]` - Security identifier (0103910)
- `customParameters[SHOPPER_PSERV]` - Provider identifier (17913101)
- `customParameters[SHOPPER_VERSIONDF]` - Version (2)

#### Risk Parameters (Required in Phase 2)

- `risk.parameters[USER_DATA2]` - Merchant name (FlameTicketing)

#### Test Mode

- `testMode=EXTERNAL` - Indicates Phase 2 test mode

---

### 3. Verify Payment API Updated

**File:** `app/api/datafast/verify-payment/route.ts`

**Changes:**

- ✅ Updated to use Phase 2 credentials
- ❌ **REMOVED Phase 1 workaround** (no more simulated responses)
- ✅ Real verification now works with Phase 2 credentials
- ✅ Improved error logging and debugging

**What This Means:**

- Transactions now go through to Datafast's test bank switch
- You'll receive REAL transaction responses with full card details
- Auth codes, reference numbers, and bank responses will be authentic
- Error codes from actual bank rejections (not simulated)

---

## 🔄 Key Differences: Phase 1 vs Phase 2

| Aspect               | Phase 1                       | Phase 2                     |
| -------------------- | ----------------------------- | --------------------------- |
| **Transaction Flow** | Gateway UI only               | Gateway → Test Bank Switch  |
| **Verification**     | 403 error (workaround needed) | ✅ Full JSON response       |
| **Required Fields**  | Basic (7 fields)              | Complete (30+ fields)       |
| **Tax Data**         | Not required                  | ✅ Required (IVA breakdown) |
| **Cart Items**       | Not required                  | ✅ Required                 |
| **Test Mode**        | Not specified                 | `testMode=EXTERNAL`         |
| **Success Code**     | `000.100.110`                 | `000.100.112`               |
| **Card Data**        | Not returned                  | ✅ Full card details        |
| **Bank Codes**       | Not returned                  | ✅ Acquirer, AuthCode, etc. |

---

## 🧪 Testing Instructions

### Test Card Details (Phase 2)

According to the Datafast guide:

- **Card Number:** 4200 0000 0000 0000
- **Card Holder:** Any name
- **Expiry Date:** Any future date (e.g., 12/25)
- **CVV:** 123

### Transaction Limits

**Phase 2 Recommendation:** Keep transactions **under $50 USD** to avoid consuming test card limits quickly.

**Your Current Amount:** $67.25 USD

- **⚠️ Consider testing with a smaller amount** or adjust pricing for Phase 2 testing

### Steps to Test

1. **Restart your dev server** to load new environment variables:

   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   # or
   pnpm dev
   ```

2. **Go to purchase flow:**

   - Select an event
   - Add to cart / start purchase
   - Fill billing information
   - Check terms & conditions
   - Wait for Datafast payment widget to load

3. **Enter test card details:**

   - Card: 4200 0000 0000 0000
   - Name: Test User
   - Expiry: 12/25
   - CVV: 123

4. **Click "Pay Now"**

5. **Check terminal logs for:**

   ```
   === Datafast Payment Verification (Phase 2) ===
   ╔════════════════════════════════════════════════════════════════╗
   ║  DATAFAST SECTION 3.1.3: Transaction Status JSON Response     ║
   ╚════════════════════════════════════════════════════════════════╝
   ```

6. **Expected Response:**
   - ✅ Result Code: `000.100.112` (Phase 2 success)
   - ✅ Description: "Request successfully processed in 'Merchant in Connector Test Mode'"
   - ✅ Full card details (BIN, last 4 digits, holder name)
   - ✅ Auth Code
   - ✅ Reference Number
   - ✅ Acquirer Code
   - ✅ Card Type

---

## 🐛 Troubleshooting

### If verification still fails with 403:

1. **Check environment variables loaded:**

   ```bash
   cat .env.local | grep DATAFAST
   ```

2. **Restart dev server** (environment variables only load on startup)

3. **Check terminal logs** for:
   - "Phase 2" in log messages
   - Correct Entity ID: `8ac7a4c799ebf2140199eef88b5e0683`
   - Correct MID: `1000000505`

### If you see "Invalid tax number" error:

This means the tax calculation is incorrect. The formula should be:

```
Total Amount = Base Imponible + IVA Amount
Base Imponible = Total Amount / (1 + IVA_RATE)
IVA Amount = Total Amount - Base Imponible
Base 0 = 0.00 (for fully taxed transactions)
```

### If you see "testMode" parameter errors:

Make sure `testMode: "EXTERNAL"` is included in the checkout creation payload.

---

## 📊 What to Expect in Logs

### Create Checkout (Terminal):

```
=== START: Datafast Create Checkout ===
Datafast API Request (Phase 2):
- Entity ID: <YOUR_TEST_ENTITY_ID>
- MID: <YOUR_TEST_MID>
- TID: <YOUR_TEST_TID>
- testMode: EXTERNAL (Phase 2)
Tax calculation:
- Total amount: 67.25
- Base 0% (tax-exempt): 0.00
- Base imponible (taxable): 58.48
- IVA amount: 8.77
✅ Checkout ID received: [checkout-id]
```

### Verify Payment (Terminal):

```
=== Datafast Payment Verification (Phase 2) ===
╔════════════════════════════════════════════════════════════════╗
║  DATAFAST SECTION 3.1.3: Transaction Status JSON Response     ║
╚════════════════════════════════════════════════════════════════╝
{
  "id": "...",
  "result": {
    "code": "000.100.112",
    "description": "Request successfully processed in 'Merchant in Connector Test Mode'"
  },
  "resultDetails": {
    "AuthCode": "123456",
    "ReferenceNo": "000123",
    "AcquirerCode": "04",
    "CardType": "VG",
    "clearingInstituteName": "Datafast"
  },
  "card": {
    "bin": "420000",
    "last4Digits": "0000",
    "holder": "Test User"
  }
}
```

---

## 🎯 Next Steps

After successful Phase 2 testing:

1. **Request Production Credentials** from Datafast:

   - Email: servbdpago@datafast.com.ec
   - Request: Production `entityId`, `Bearer token`, `MID`, `TID`

2. **Update environment variables** for production:

   ```bash
   DATAFAST_PRODUCTION_URL=https://oppwa.com
   DATAFAST_PRODUCTION_ENTITY_ID=[from Datafast]
   DATAFAST_PRODUCTION_BEARER_TOKEN=[from Datafast]
   DATAFAST_PRODUCTION_MID=[from Datafast]
   DATAFAST_PRODUCTION_TID=[from Datafast]
   ```

3. **Remove `testMode=EXTERNAL`** parameter in production

4. **Update success code check** to include `000.000.000` (production success)

---

## 📝 Files Modified

- ✅ `.env.local` - Phase 2 credentials
- ✅ `app/api/datafast/create-checkout/route.ts` - Phase 2 fields
- ✅ `app/api/datafast/verify-payment/route.ts` - Removed Phase 1 workaround

## 🔐 Backups Created

- `.env.local.phase1-backup` - Original Phase 1 credentials

---

**Status:** ⚠️ Deprecated — Historical Documentation Only

**Last Updated:** October 17, 2025 (Implementation Date)  
**Deprecated:** Late 2025 / Early 2026 (Replaced by Stripe Connect)

