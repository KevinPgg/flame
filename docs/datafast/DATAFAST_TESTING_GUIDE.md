# Datafast Phase 1 Testing Guide

## Overview

This guide provides instructions for testing the Datafast payment gateway integration (Phase 1 - Test Environment).

## What Was Implemented

### 1. Database Changes

- Added billing information fields to `users` table:
  - `phone`, `billing_address`, `billing_city`, `billing_country`
  - `document_type`, `document_id`, `ip_address`
- Migration file: `supabase/migrations/20251016000000_add_user_billing_fields.sql`

### 2. API Routes Created

- **`/api/datafast/create-checkout`** - Creates Datafast checkout session
- **`/api/datafast/verify-payment`** - Verifies payment after completion

### 3. Updated Purchase Flow

- **`/app/purchase/page.tsx`** - Complete rewrite with:
  - Billing information form (pre-filled if user has saved data)
  - Datafast payment widget integration
  - Payment callback handling
  - Terms and conditions before payment

### 4. Updated Order Completion

- **`/app/api/purchase/complete-direct/route.ts`** - Now accepts Datafast transaction data
- **`/app/api/purchase/complete-hold/route.ts`** - Now accepts Datafast transaction data
- Both store Datafast metadata in orders table

### 5. Styling

- Added comprehensive styles for billing form and payment widget in `purchase.css`

## Testing Instructions

### Prerequisites

1. **Run Database Migration**

   ```bash
   # Apply the migration to add billing fields
   # This can be done via Supabase dashboard or CLI
   ```

2. **Verify Environment**
   - Test credentials are hardcoded in the API routes (Phase 1 only)
   - URL: `https://eu-test.oppwa.com`
   - EntityID: `8a829418533cf31d01533d06f2ee06fa`

### Test Scenarios

#### Scenario 1: RSVP Purchase Flow

1. **Setup**: Create an RSVP with approved status for a test event
2. **Navigate**: Go to purchase page via RSVP token link
3. **Fill Billing Info**:
   - First Name: Test
   - Last Name: User
   - Email: test@example.com
   - Phone: +593123456789
   - Address: Calle Falsa 123
   - City: Quito
   - Country: EC (Ecuador)
   - Document Type: IDCARD
   - Document ID: 1234567890
4. **Agree to Terms**: Check the terms and conditions checkbox
5. **Click "Proceed to Payment"**
6. **Payment Form Should Appear** with Datafast widget
7. **Enter Test Card Details**:
   - Card Number: `4200000000000000`
   - Card Holder: `TestCompany` (or your company name)
   - Expiry Date: `12/25` (any future date)
   - CVV: `123`
8. **Submit Payment**
9. **Expected Result**: Redirected to success page with order confirmation

#### Scenario 2: Hold Purchase Flow

1. **Setup**: Create a hold for a test event
2. **Navigate**: Go to purchase page via hold session link
3. **Follow Steps 3-9** from Scenario 1
4. **Verify**: Timer countdown should be visible at top
5. **Expected Result**: Same as Scenario 1

#### Scenario 3: Billing Info Pre-fill

1. **Complete** Scenario 1 once
2. **Create** another RSVP/hold for the same user
3. **Navigate** to purchase page
4. **Expected**: Billing form should be pre-filled with saved data
5. **Modify** any field if needed
6. **Complete** purchase
7. **Verify**: Updated data is saved

### What to Look For

#### Success Indicators

✅ Billing form renders correctly  
✅ All fields are properly validated  
✅ Terms checkbox works correctly  
✅ Datafast payment widget loads after clicking "Proceed to Payment"  
✅ Payment form shows test credentials note  
✅ Form accepts test card data  
✅ Payment processes successfully  
✅ Order is created with `payment_method: "datafast"`  
✅ Order metadata contains Datafast transaction info  
✅ Tickets are generated  
✅ Email confirmation is sent  
✅ Success page displays properly

#### Error Scenarios to Test

1. **Missing Billing Info**: Try proceeding without filling all fields

   - Expected: Validation errors appear

2. **Terms Not Agreed**: Try proceeding without checking terms

   - Expected: Error message appears

3. **Invalid Card**: Use card `4111111111111111`

   - Expected: Datafast rejects with appropriate error

4. **Expired Hold**: Wait for hold to expire, then try to complete
   - Expected: Error message about expired hold

### Response Codes

According to Datafast documentation:

- **Success (Phase 1)**: `000.100.110` - "Request successfully processed in 'Merchant in Integrator Test Mode'"
- **Success (Phase 2)**: `000.100.112` - "Request successfully processed in 'Merchant in Connector Test Mode'"
- **Production Success**: `000.000.000` - "Transaction succeeded"

Common error codes are mapped to user-friendly messages in `/api/datafast/verify-payment/route.ts`.

### Database Verification

After a successful test purchase, verify in Supabase:

1. **Orders Table**:

   - Check `payment_method = "datafast"`
   - Verify `metadata` contains Datafast transaction info
   - Verify `status = "completed"`

2. **Users Table**:

   - Verify billing fields are populated
   - Check `phone`, `billing_address`, etc.

3. **Tickets Table**:
   - Verify tickets were created
   - Check `order_id` matches

### Known Phase 1 Limitations

1. **Test Environment Only**: All transactions use test credentials
2. **No Real Charges**: No actual money is processed
3. **Limited Card Types**: Only test cards work
4. **Fixed Entity ID**: Using shared test entity ID

## Next Steps (Phase 2)

To move to Phase 2 (requires Datafast approval):

1. **Request Production Credentials** from Datafast:

   - Production URL
   - Production Entity ID
   - Production Bearer Token
   - MID (Merchant ID)
   - TID (Terminal ID)

2. **Code Changes Needed**:

   - Update API routes to use production credentials
   - Remove `testMode` parameter
   - Add MID/TID to transaction data
   - Update Phase 1 response code checks

3. **Additional Requirements**:
   - SSL certificate (TLS 1.2 with SHA-256)
   - Complete Datafast certification process
   - Vulnerability scan of website
   - Update terms and privacy policy

## Troubleshooting

### Payment Widget Not Loading

- Check browser console for errors
- Verify checkoutId is being generated
- Ensure Datafast scripts are loading (check Network tab)

### Payment Fails Immediately

- Verify billing info is complete and valid
- Check document ID is max 10 characters
- Ensure phone number is at least 7 characters

### Callback Not Working

- Check that resourcePath is being received
- Verify verification API is being called
- Look for errors in server logs

### Order Not Created

- Check complete-direct or complete-hold API logs
- Verify Datafast verification returned success
- Check database connection

## Support

For Datafast-related issues:

- Email: servbdpago@datafast.com.ec
- Refer to implementation guide: `/datafast-info/guia_implementacion.md`

For integration issues:

- Check server logs
- Review browser console
- Verify database migrations ran successfully
