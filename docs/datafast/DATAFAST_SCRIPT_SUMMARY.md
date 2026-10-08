# Datafast Test Script - Summary

## Overview

I've analyzed your successful Datafast transactions and filled out the test script (`SCRIPT_FILLED_OUT.csv`) based on your actual testing data from October 17-20, 2025.

## Key Findings

### Your Configuration

- **TID (Terminal ID):** PDxxxxxx
- **MID (Merchant ID):** 1000000xxx
- **Test Card:** VISA 4200 0000 0000 0000
- **Card Type:** MP (Mastercard/Visa Pacífico)
- **Test Mode:** Connector Test Mode (testMode=EXTERNAL)

### Successful Transactions Summary

You have **7 successful test transactions**, all using **Crédito corriente/ Rotativo** (Type 00 - Current/Revolving Credit):

| Transaction ID                   | Amount | Customer ID (First 16 chars) | Auth Code | Reference     | Batch  | Date          |
| -------------------------------- | ------ | ---------------------------- | --------- | ------------- | ------ | ------------- |
| tx-8ac7a49f99f20a6c0199f422b69c0 | $40.00 | cust-116b548a-05             | 123456    | 251017_000074 | 251017 | Oct 17, 21:45 |
| tx-8ac7a4a299f20feb0199f4264af56 | $28.00 | cust-116b548a-05             | 123457    | 251017_000075 | 251017 | Oct 17, 21:49 |
| tx-8ac7a49f99f20a6c0199f42fcaa41 | $28.00 | cust-86e9f676-e2             | 123458    | 251017_000080 | 251017 | Oct 17, 21:59 |
| tx-8ac7a4a299f20feb0199f433fa640 | $6.50  | cust-86e9f676-e2             | 123459    | 251017_000082 | 251017 | Oct 17, 22:04 |
| tx-8ac7a4a099f20fd00199f4b15b0a0 | $64.00 | cust-4b37f20c-10             | 123460    | 251017_000090 | 251017 | Oct 18, 00:21 |
| tx-8ac7a4a199f20a750199fe07210c7 | $15.00 | cust-f5779074-a4             | 123461    | 251019_000014 | 251019 | Oct 19, 19:51 |
| tx-8ac7a4a199ff8eb2019a032fa3a15 | $28.00 | cust-b42283d5-85             | 123462    | 251020_000083 | 251020 | Oct 20, 19:54 |

### Important Details from Your Transactions

#### All transactions show:

- **Result Code:** 000.100.112 (Request successfully processed in 'Merchant in Connector Test Mode')
- **Response:** 00 (Approved)
- **AcquirerCode:** 01 (Pacificard)
- **Extended Description:** "Transaccion aprobada"
- **Clearing Institute:** Datafast

#### Tax Breakdown (All transactions):

- **Base 0%:** $0.00
- **Base 12% (IVA):** Full amount
- **IVA Value:** $0.00 (You're sending the full amount as base imponible but IVA as 0.00)
- **Interest:** $0.00 (No deferred payments with interest)

## What Was NOT Tested

According to the Datafast guide requirements, you still need to test:

### Credit Options NOT Tested:

1. **Credito Diferido con interés** (Deferred with interest - Type 02)

   - Requires 9 months installment plan
   - Need 2 test transactions

2. **Credito Diferido Sin interés** (Deferred without interest - Type 03)

   - Requires 3 months installment plan
   - Need 2 test transactions

3. **Credito Diferido Corriente especial** (Special deferred - Type 01)

   - Need 2 test transactions

4. **Anulaciones** (Cancellations/Refunds)
   - Test cancellation of current credit
   - Test cancellations of deferred payments

## Recommendations for Datafast Certification

### 1. Before Submitting to Datafast:

- [ ] Confirm with Datafast which credit types are authorized for your merchant account
- [ ] If only "Crédito corriente/Rotativo" is authorized, note this in the script
- [ ] Consider testing at least one cancellation/refund

### 2. Information Already Correctly Implemented:

✅ Customer data (name, email, phone, ID)
✅ IP address capture
✅ Merchant transaction ID (unique per transaction)
✅ Tax information (Base 0, Base IVA, IVA value)
✅ Cart items with descriptions
✅ Billing and shipping addresses
✅ All custom parameters (SHOPPER_ECI, SHOPPER_MID, SHOPPER_TID, etc.)

### 3. Notes on Your Tax Structure:

Your transactions show:

- `SHOPPER_VAL_BASE0: "0.00"`
- `SHOPPER_VAL_BASEIMP: [full amount]`
- `SHOPPER_VAL_IVA: "0.00"`

This means you're treating all sales as taxable base but with 0% IVA. According to the guide (Table 3), you should verify:

- If this is correct for your business model (services vs products)
- Example from guide shows: For $3.12 total → $1.00 base + $0.12 IVA + $2.00 base0 = $3.12

### 4. Next Steps for Certification:

1. **Review with Datafast:** Send the filled script and confirm:

   - Do you need to test deferred payments?
   - Is your tax calculation structure correct?
   - Should you test cancellations?

2. **Vulnerability Scan:** After Datafast approves your script, they will scan your website (2-day process)

3. **Production Credentials:** Once approved, Datafast will provide:

   - Production entityId
   - Production Authorization Bearer token
   - Production MID and TID

4. **Code Updates for Production:** You'll need to:
   - Change URLs from `eu-test.oppwa.com` to `eu-prod.oppwa.com`
   - Remove `testMode=EXTERNAL` parameter
   - Update credentials
   - Add certification badge/logo

## Current Test Environment Details

Your implementation is correctly using:

- **Gateway URL:** https://eu-test.oppwa.com
- **Test Mode:** EXTERNAL
- **Entity ID:** (configured in your system)
- **Version:** SHOPPER_VERSIONDF = 2

## Files Generated

- `SCRIPT_FILLED_OUT.csv` - Your completed test script with actual transaction data
- `DATAFAST_SCRIPT_SUMMARY.md` - This summary document

## Questions to Clarify with Datafast

1. **Tax Structure:** Confirm that sending all amounts as BASEIMP with 0% IVA is correct for ticket sales
2. **Credit Types:** Which types are authorized for your merchant account?
3. **Deferred Payments:** Do you plan to offer installment plans? If so, which types?
4. **Cancellation Policy:** Do you need to implement refunds/cancellations?

---

**Generated:** October 20, 2025  
**Test Period:** October 17-20, 2025  
**Total Successful Transactions:** 7  
**Total Test Amount:** $209.50
