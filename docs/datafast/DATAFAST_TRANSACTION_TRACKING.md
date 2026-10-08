# Datafast Transaction Tracking System

**Implementation Date:** October 17, 2025  
**Purpose:** Comprehensive transaction audit trail and reconciliation

## Overview

This system implements comprehensive transaction tracking for all Datafast payment attempts, both successful and failed. This follows Datafast's recommendation in their implementation guide (Section 3.2, line 747):

> "se recomienda que se guarde esta información ya sea en una transacción exitosa como en una fallida"  
> *(it is recommended to save this information whether in a successful or failed transaction)*

## Benefits

1. **Complete Audit Trail**: Every transaction attempt is logged with full details
2. **Financial Reconciliation**: Match transactions with bank records using Datafast's transaction IDs
3. **Debugging**: Quickly identify why transactions failed with detailed error logging
4. **Fraud Detection**: Track patterns in failed transactions
5. **Transaction Verification**: Support for Datafast's Transaction Verifier (Section 10 of guide)
6. **Compliance**: Meet financial auditing and regulatory requirements

## Database Schema

### Table: `datafast_transactions`

Created in migration: `20251017000000_create_datafast_transactions_table.sql`

#### Key Fields

**Transaction Identification:**
- `datafast_checkout_id` - Checkout ID from Datafast (step 1)
- `datafast_transaction_id` - Final transaction ID from Datafast (step 3)
- `merchant_transaction_id` - Our unique transaction ID

**Status Tracking:**
- `status` - Current status:
  - `pending` - Checkout created, waiting for payment
  - `processing` - Payment verified, order completion in progress
  - `processed` - Order completed successfully
  - `failed` - Transaction failed (checkout or verification)
  - `timeout` - Verification request failed
- `transaction_type` - Type of transaction event:
  - `checkout_created` - Initial checkout session created
  - `checkout_creation_failed` - Failed to create checkout
  - `payment_verified` - Payment successfully verified
  - `payment_failed` - Payment verification failed
  - `verification_failed` - Verification request failed

**Payment Details:**
- `amount`, `currency`, `payment_type`
- `payment_brand` - VISA, MASTER, AMEX, etc.
- `result_code`, `result_description` - Datafast response codes

**Card Information (Masked for PCI Compliance):**
- `card_bin` - First 6 digits
- `card_last4` - Last 4 digits
- `card_holder`, `card_expiry_month`, `card_expiry_year`
- `card_bin_country` - Card issuing country

**Transaction Details (from Datafast `resultDetails`):**
- `auth_code` - Authorization code from bank
- `reference_no` - Bank reference number
- `batch_no` - Processing batch number
- `acquirer_code` - Bank acquirer code (01=Pacificard, 02=Diners, etc.)
- `card_type` - Card type code (MP, VG, etc.)
- `acquirer_response` - Bank response message
- `extended_description` - Extended transaction description
- `clearing_institute_name` - Name of clearing bank

**Complete JSON Storage (for Full Audit):**
- `checkout_request_data` - What we sent to create checkout
- `checkout_response_data` - What Datafast returned (step 1)
- `verification_request_data` - What we sent to verify
- `verification_response_data` - Full Datafast verification response (Figure 12 data)

**Error Tracking:**
- `error_code`, `error_message`, `error_details`

**Timestamps:**
- `checkout_created_at` - When checkout was created
- `payment_attempted_at` - When user clicked "Pay" 
- `verified_at` - When we verified the transaction
- `processed_at` - When order was completed in our system
- `created_at`, `updated_at` - Record lifecycle

**Linkage:**
- `user_id` - Link to user who made purchase
- `order_id` - Link to completed order (after success)
- `hold_id` - Link to hold session (for hold-based purchases)

## Transaction Lifecycle

### 1. Checkout Creation (`pending`)

**API:** `/api/datafast/create-checkout`

When a user requests to pay:
- Create checkout session with Datafast
- Log initial transaction with status `pending`
- Store all request parameters for audit
- Store Datafast's checkout response

**Logged Data:**
```json
{
  "datafast_checkout_id": "9562471BE04CA6E55DB0DAA3535E4D0D.uat01-vm-tx01",
  "merchant_transaction_id": "ORD-1729182000000-ABC123",
  "status": "pending",
  "transaction_type": "checkout_created",
  "amount": 25.50,
  "currency": "USD",
  "user_id": "uuid",
  "customer_email": "user@example.com",
  "customer_ip": "192.168.1.1",
  "checkout_request_data": { /* full request */ },
  "checkout_response_data": { /* Datafast response */ },
  "checkout_created_at": "2025-10-17T10:30:00Z"
}
```

**Failure Scenarios:**
- HTTP error from Datafast → logged with `status: "failed"`, `transaction_type: "checkout_creation_failed"`
- Invalid result code (not `000.200.100`) → logged with error details

### 2. Payment Verification (`processing` or `failed`)

**API:** `/api/datafast/verify-payment`

When Datafast redirects back with `resourcePath`:
- Verify transaction status with Datafast
- Update transaction record with verification results
- Extract all transaction details (card, bank info, etc.)
- Store complete verification response

**Successful Verification (`processing`):**
```json
{
  "datafast_transaction_id": "8ac7a4a591f5d4e10191f6237ea80487",
  "status": "processing",
  "transaction_type": "payment_verified",
  "result_code": "000.100.112",
  "result_description": "Request successfully processed",
  "payment_brand": "VISA",
  "card_bin": "420000",
  "card_last4": "0000",
  "auth_code": "831000",
  "reference_no": "0111746460010000",
  "acquirer_code": "01",
  "verification_response_data": { /* full Figure 12 JSON */ },
  "payment_attempted_at": "2025-10-17T10:35:00Z",
  "verified_at": "2025-10-17T10:35:05Z"
}
```

**Failed Verification (`failed`):**
```json
{
  "status": "failed",
  "transaction_type": "payment_failed",
  "result_code": "800.100.155",
  "result_description": "Insufficient funds",
  "error_code": "800.100.155",
  "error_message": "Insufficient funds",
  "verified_at": "2025-10-17T10:35:05Z"
}
```

**Network Failure (`failed`):**
```json
{
  "status": "failed",
  "transaction_type": "verification_failed",
  "error_code": "503",
  "error_message": "Failed to verify payment",
  "error_details": { /* error response */ }
}
```

### 3. Order Completion (`processed`)

**APIs:** 
- `/api/purchase/complete-direct`
- `/api/purchase/complete-hold`

When order is successfully completed:
- Generate tickets
- Send confirmation email
- Mark transaction as `processed`
- Link to final order ID

**Final Transaction Record:**
```json
{
  "status": "processed",
  "order_id": "uuid-of-completed-order",
  "hold_id": "uuid-of-hold-session",
  "processed_at": "2025-10-17T10:35:10Z"
}
```

## Usage

### Query All Transactions for a User

```sql
SELECT 
  id,
  merchant_transaction_id,
  status,
  amount,
  result_code,
  result_description,
  created_at,
  processed_at
FROM datafast_transactions
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC;
```

### Find Pending/Stuck Transactions

```sql
SELECT 
  merchant_transaction_id,
  datafast_checkout_id,
  amount,
  customer_email,
  created_at,
  checkout_created_at
FROM datafast_transactions
WHERE status IN ('pending', 'processing')
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Reconcile with Datafast Reports

```sql
SELECT 
  merchant_transaction_id,
  datafast_transaction_id,
  amount,
  auth_code,
  reference_no,
  acquirer_code,
  clearing_institute_name,
  processed_at
FROM datafast_transactions
WHERE status = 'processed'
  AND DATE(processed_at) = '2025-10-17'
ORDER BY processed_at;
```

### Analyze Failed Transactions

```sql
SELECT 
  error_code,
  result_description,
  COUNT(*) as failure_count,
  SUM(amount) as total_amount
FROM datafast_transactions
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY error_code, result_description
ORDER BY failure_count DESC;
```

### Get Full Transaction Details (for Support)

```sql
SELECT 
  merchant_transaction_id,
  datafast_checkout_id,
  datafast_transaction_id,
  status,
  transaction_type,
  result_code,
  amount,
  customer_email,
  card_bin,
  card_last4,
  auth_code,
  reference_no,
  checkout_request_data,
  verification_response_data,
  error_details,
  checkout_created_at,
  verified_at,
  processed_at
FROM datafast_transactions
WHERE merchant_transaction_id = 'ORD-1729182000000-ABC123';
```

## Transaction Verifier Integration

Per Datafast guide Section 10, you can implement a transaction verifier that:

1. **Periodically checks pending transactions:**
```sql
SELECT datafast_checkout_id, merchant_transaction_id
FROM datafast_transactions
WHERE status = 'pending'
  AND checkout_created_at < NOW() - INTERVAL '30 minutes';
```

2. **Re-verify each transaction** by calling the verification endpoint
3. **Update status** based on verification results
4. **Handle timeouts** by marking as failed after X attempts

This ensures no successful payments are missed if the user closed their browser before redirect.

## Security & Privacy

- **PCI Compliance**: Only masked card data is stored (BIN + Last 4)
- **Row Level Security (RLS)**: Users can only view their own transactions
- **Service Role Access**: API routes use service role for full access
- **Audit Trail**: All changes are timestamped via `updated_at` trigger

## Indexes

Optimized queries for:
- `datafast_checkout_id` - Fast lookups during verification
- `datafast_transaction_id` - Reconciliation with Datafast reports
- `merchant_transaction_id` - Internal order tracking
- `status` - Find pending/failed transactions
- `user_id` - User transaction history
- `order_id` - Link transactions to orders
- `result_code` - Analyze error patterns
- `created_at` - Time-based queries
- Partial index on unprocessed transactions for verifier

## Best Practices

1. **Never delete transaction records** - They are your audit trail
2. **Monitor pending transactions** - Alert if stuck > 1 hour
3. **Reconcile daily** - Compare with Datafast's transaction reports
4. **Analyze failures** - Review failed transactions weekly to identify patterns
5. **Preserve JSON responses** - Critical for debugging and dispute resolution
6. **Archive old data** - Consider moving processed transactions >1 year to archive table

## Support Queries

### Customer says "I paid but didn't get tickets"

```sql
SELECT 
  status,
  result_code,
  result_description,
  order_id,
  processed_at,
  error_message
FROM datafast_transactions
WHERE customer_email = 'user@example.com'
  AND DATE(created_at) = '2025-10-17'
ORDER BY created_at DESC;
```

### Customer was charged twice

```sql
SELECT 
  merchant_transaction_id,
  datafast_transaction_id,
  amount,
  status,
  auth_code,
  reference_no,
  created_at
FROM datafast_transactions
WHERE customer_email = 'user@example.com'
  AND amount = 25.50
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at;
```

### Need details for Datafast support ticket

Provide the full `verification_response_data` JSON along with:
- `merchant_transaction_id`
- `datafast_transaction_id`
- `auth_code`
- `reference_no`

## Migration to Production

When moving to production:

1. Keep the same table structure
2. Update credentials in `.env`
3. Remove `testMode=EXTERNAL` from create-checkout
4. Update success codes to include `000.000.000`
5. Implement automated reconciliation with production Datafast reports

## Monitoring & Alerts

Recommended alerts:

1. **Stuck Transactions**: Status = pending for > 1 hour
2. **High Failure Rate**: > 10% failures in last hour
3. **Missing Order Link**: Status = processed but order_id IS NULL
4. **Verification Errors**: Network failures during verification

---

**Implementation Status:** ✅ Complete  
**Tested:** Pending user testing  
**Production Ready:** Yes (after testing Phase 2 flow)

