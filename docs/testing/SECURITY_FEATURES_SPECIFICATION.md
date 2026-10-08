# Security Features Specification

This document defines the **specifications** for the security and error-recovery features added in the sentry branch.
Tests should verify the code meets these specifications, not just that the code does what the code says.

---

## 1. Sensitive Data Redaction

### 1.1 Purpose
Prevent Personal Identifiable Information (PII) from being sent to external error tracking services (Sentry).

### 1.2 Specification

**SPEC-REDACT-001: Sensitive Field Replacement**
- The following field names MUST be replaced with "[REDACTED]" when present:
  - `card_number`, `pan`, `cvv`, `card_cvv`
  - `card_expiry`, `expiry`, `cardholder_name`
  - `email`, `phone`, `mobile`
  - `customer_email`, `billing_email`
  - `documentId`, `document_id`
  - `billingAddress`, `billing_address`

**SPEC-REDACT-002: Nested Object Handling**
- When `card` object is present, only `bin` and `last4Digits` should be preserved
- When `card.holder` is present, it MUST be replaced with "[REDACTED]"
- When `payment_method.details` is present, it MUST be replaced with "[REDACTED]"

**SPEC-REDACT-003: Customer Object Handling**
- When `customer.email` is present, it MUST be replaced with "[REDACTED]"
- When `customer.phone` is present, it MUST be replaced with "[REDACTED]"
- When `customer.name` is present, it MUST be replaced with "[REDACTED]"

**SPEC-REDACT-004: Billing Object Handling**
- When `billing.email` is present, it MUST be replaced with "[REDACTED]"
- When `billing.phone` is present, it MUST be replaced with "[REDACTED]"
- When `billing.address` is present, it MUST be replaced with "[REDACTED]"

**SPEC-REDACT-005: Non-Destructive Operation**
- The original input object MUST NOT be mutated
- A deep copy with redacted values MUST be returned

**SPEC-REDACT-006: Null/Undefined Handling**
- When input is null, return null
- When input is undefined, return undefined

---

## 2. Transaction Recovery Service

### 2.1 Purpose
Recover transactions that were verified as paid but failed to complete order/ticket creation.

### 2.2 Specification

**SPEC-RECOVER-001: Hold Lookup**
- When `hold_id` is provided and valid, use the existing hold
- When `hold_id` is missing or invalid, attempt to reconstruct from `verification_response_data`

**SPEC-RECOVER-002: Hold Reconstruction Safety**
- When reconstructing from event/tier names:
  - If multiple events match the name, FAIL with error listing all candidates
  - If multiple tiers match the name for the event, FAIL with error listing all candidates
  - Never auto-select when ambiguous

**SPEC-RECOVER-003: Quantity Validation**
- Quantity MUST be a positive integer
- Quantity = 0, negative, or non-integer MUST fail with error: "Invalid quantity value"
- Quantity MUST NOT be NaN

**SPEC-RECOVER-004: Email Requirement**
- When creating tickets, `attendee_email` MUST be present
- If neither user.email nor transaction.customer_email is available, FAIL with descriptive error

**SPEC-RECOVER-005: Idempotency Protection**
- Orders MUST use a deterministic `idempotency_key` derived from transaction ID
- When duplicate order is detected (code 23505), fetch existing order instead of failing
- Never create duplicate orders for the same transaction

**SPEC-RECOVER-006: Ticket Creation Rollback**
- If ticket creation fails mid-way:
  - All NEWLY CREATED tickets in this run MUST be deleted
  - Pre-existing tickets from previous attempts MUST NOT be deleted
  - The order MUST be deleted IF it was created in this run
  - Pre-existing orders MUST NOT be deleted

**SPEC-RECOVER-007: Data Integrity Check**
- After ticket creation, verify: `ticketIds.length >= quantity`
- If insufficient tickets exist, perform rollback per SPEC-RECOVER-006

**SPEC-RECOVER-008: Dry Run Mode**
- When `dryRun = true`:
  - Return `action: "would_create_order"` and `dry_run: true`
  - DO NOT create any orders or tickets
  - DO NOT modify any database records

---

## 3. Payment Verification Error Logging

### 3.1 Purpose
Ensure all payment failures are captured in Sentry with proper categorization for monitoring and alerting.

### 3.2 Specification

**SPEC-LOG-001: Verification Failure Logging**
- When payment verification returns `isSuccess = false`:
  - MUST call `Sentry.captureException` with:
    - `tags.category = "payment_critical"`
    - `tags.checkoutId` containing the checkout ID
  - MUST include redacted error data in `extra.fullError`

**SPEC-LOG-002: Network Failure Logging**
- When network error occurs during verification API call:
  - MUST call `Sentry.captureException` with:
    - `tags.category = "payment_network_failure"`
    - `tags.checkoutId` containing the checkout ID

**SPEC-LOG-003: No PII in Logs**
- All data sent to Sentry MUST be processed through `redactSensitiveData()`
- No raw customer emails, card numbers, or personal data in logs

---

## 4. Pending Checkout Recovery

### 4.1 Purpose
Find and recover checkouts where payment succeeded but browser callback never reached server (ghost payments).

### 4.2 Specification

**SPEC-PENDING-001: Selection Criteria**
- Only select checkouts where:
  - `status = 'pending'`
  - `transaction_type = 'checkout_created'`
  - `datafast_checkout_id IS NOT NULL`
  - `datafast_transaction_id IS NULL` (never verified)
  - `checkout_created_at < NOW() - minMinutes`
  - `recovery_in_progress = false`

**SPEC-PENDING-002: MinMinutes Validation**
- `minMinutes` parameter MUST be:
  - A positive integer
  - Between 1 and 1440 (inclusive)
- If invalid, return HTTP 400 with descriptive error

**SPEC-PENDING-003: Concurrency Protection**
- Selected rows MUST be locked using `FOR UPDATE SKIP LOCKED`
- `recovery_in_progress` MUST be set to `true` atomically before processing
- This prevents two workers from processing the same checkout

**SPEC-PENDING-004: Admin Access Required**
- Endpoint MUST require authentication
- Endpoint MUST verify user has `is_admin = true`
- Return 401 if not authenticated
- Return 403 if not admin

---

## 5. Sentry Configuration

### 5.1 Specification

**SPEC-SENTRY-001: PII Scrubbing in beforeSend**
- The `beforeSend` hook MUST scrub sensitive keys from:
  - `event.extra`
  - `event.request.data`
  - `event.tags`
- Sensitive keys include: cardNumber, cvv, cardHolderName, email, documentId, billingAddress, password, secret

**SPEC-SENTRY-002: Session Replay Privacy**
- Session replay MUST have `maskAllText: true`
- Session replay MUST have `blockAllMedia: true`

