# Testing Checklist - PR Review Fixes

> **Branch:** `promotional-codes`  
> **Date:** October 25, 2025  
> **Purpose:** Comprehensive testing guide for PR review fixes including security enhancements, data integrity validations, and bug fixes.

---

## 📋 Overview

This testing checklist covers all changes made in response to PR reviews, organized by feature area. Each section includes what was changed, why it was changed, and specific test cases.

---

## 🔒 1. Security & PII Protection

### 1.1 Email Masking in Logs

**Files Changed:**

- ✨ **NEW:** `app/lib/utils/email-mask.ts`
- `app/api/organizer/promotional-tickets/route.ts` (lines 179, 197, 200)
- `app/api/purchase/validate-token/route.ts` (import added)

**What Changed:**

- Created utility function to mask email addresses for logging (e.g., `john.doe@gmail.com` → `j***@gmail.com`)
- Applied email masking to all promotional ticket creation logs

**Test Cases:**

- [ ] **Test 1.1.1:** Create a promotional ticket and verify logs show masked email (`j***@example.com`)
- [ ] **Test 1.1.2:** Check that email sent to recipient is NOT masked (full email)
- [ ] **Test 1.1.3:** Verify database stores full email (not masked)
- [ ] **Test 1.1.4:** Review server logs for any PII leakage

---

### 1.2 DocumentId Exclusion from SessionStorage

**Files Changed:**

- `app/purchase/page.tsx` (lines 175-181, 742-750)

**What Changed:**

- Document IDs (PII) are no longer saved to sessionStorage
- Users must re-enter document ID on payment retry
- Prevents sensitive ID information from persisting in browser storage

**Test Cases:**

- [ ] **Test 1.2.1:** Start purchase, fill billing info with document ID → Check sessionStorage doesn't contain documentId
- [ ] **Test 1.2.2:** Simulate payment failure → Verify document ID field is empty on retry page
- [ ] **Test 1.2.3:** Verify other billing fields (name, address) ARE restored correctly
- [ ] **Test 1.2.4:** Complete successful payment → Verify sessionStorage is cleared

---

### 1.3 PII Redaction in Datafast Logs

**Files Changed:**

- `app/api/datafast/create-checkout/route.ts` (lines 254-261, 315-320, 386-394)

**What Changed:**

- Email addresses are SHA-256 hashed in error logs
- Sensitive fields (phone, address, documentId) completely omitted from logs
- Only first character of name fields retained for debugging

**Test Cases:**

- [ ] **Test 1.3.1:** Trigger Datafast checkout failure → Verify logs show email hash, not plain email
- [ ] **Test 1.3.2:** Check that phone, address, documentId are NOT in logged JSON
- [ ] **Test 1.3.3:** Verify firstName/lastName show only first character (e.g., "J", "D")
- [ ] **Test 1.3.4:** Confirm database still stores full PII correctly

---

## 💰 2. Promotional Code Validation & Security

### 2.1 Monetary Amount Bounds Checking

**Files Changed:**

- `app/api/purchase/validate-promo-code/route.ts` (lines 36-61)

**What Changed:**

- Added validation: `subtotal_cents` must be integer between 0 and 100,000,000 cents ($1M)
- Prevents arithmetic overflow and malicious inputs
- Proper integer parsing with `Math.trunc()`

**Test Cases:**

- [ ] **Test 2.1.1:** Valid promo code with subtotal $100 → Should succeed
- [ ] **Test 2.1.2:** Try subtotal with negative value → Should fail with error
- [ ] **Test 2.1.3:** Try subtotal > $1,000,000 → Should fail with bounds error
- [ ] **Test 2.1.4:** Try subtotal with decimal (e.g., `100.5`) → Should truncate to 100
- [ ] **Test 2.1.5:** Try subtotal as string `"1000"` → Should parse and succeed
- [ ] **Test 2.1.6:** Try subtotal as `NaN` or `null` → Should fail validation

---

### 2.2 Usage Limit Database Constraint

**Files Changed:**

- 🆕 **NEW:** `supabase/migrations/20251025140000_add_promotional_code_usage_check_constraint.sql`

**What Changed:**

- Added database-level CHECK constraint: `usage_count <= usage_limit`
- Prevents oversubscription even under race conditions
- Complements application-level checks

**Test Cases:**

- [ ] **Test 2.2.1:** Create promo code with limit 5 → Verify constraint exists in DB
- [ ] **Test 2.2.2:** Apply promo code 5 times → Should all succeed
- [ ] **Test 2.2.3:** Try to manually UPDATE usage_count to exceed limit → Should fail with constraint violation
- [ ] **Test 2.2.4:** Attempt concurrent promo code applications → Should handle gracefully
- [ ] **Test 2.2.5:** Check 6th attempt to use promo code → Should fail (limit reached)

---

### 2.3 Case-Insensitive Email Uniqueness

**Files Changed:**

- 🆕 **NEW:** `supabase/migrations/20251025000000_fix_promotional_tickets_email_case_sensitivity.sql`
- `app/api/organizer/promotional-tickets/route.ts` (lines 125, 144, 184)

**What Changed:**

- Replaced case-sensitive unique constraint with case-insensitive index
- Emails stored as lowercase in database
- Prevents duplicate promotional tickets for same email with different cases

**Test Cases:**

- [ ] **Test 2.3.1:** Send promo ticket to `test@example.com` → Should succeed
- [ ] **Test 2.3.2:** Try to send to `TEST@EXAMPLE.COM` for same event → Should fail (duplicate)
- [ ] **Test 2.3.3:** Try to send to `Test@Example.Com` → Should fail (duplicate)
- [ ] **Test 2.3.4:** Verify database stores email as lowercase: `test@example.com`
- [ ] **Test 2.3.5:** Send promo ticket to same email for DIFFERENT event → Should succeed

---

## 🎫 3. QR Scanner & Check-in Security

### 3.1 Atomic Check-in Updates

**Files Changed:**

- `app/api/qr-scanner/checkin/route.ts` (lines 136-149, 153-170)

**What Changed:**

- Added WHERE predicates to UPDATE: `.eq("status", "issued").is("checked_in_at", null)`
- Prevents double check-ins via race conditions
- Returns no rows if ticket already checked in (database-level protection)

**Test Cases:**

- [ ] **Test 3.1.1:** Normal check-in flow → Should succeed with status 200
- [ ] **Test 3.1.2:** Try to check in same ticket twice → Should fail with 409 conflict
- [ ] **Test 3.1.3:** Simulate concurrent check-in requests (same ticket) → Only one should succeed
- [ ] **Test 3.1.4:** Verify checked_in_at timestamp is set correctly
- [ ] **Test 3.1.5:** Test with promotional tickets → Same atomic behavior

**Testing Method for Concurrent Check-ins:**

```bash
# Use multiple curl requests simultaneously
for i in {1..5}; do
  curl -X POST /api/qr-scanner/checkin \
    -H "Content-Type: application/json" \
    -d '{"ticketId":"TICKET_ID","deviceId":"device-123"}' &
done
wait
# Verify only ONE check-in succeeded, others got 409 Conflict
```

---

## 🛡️ 4. Database Function Security

### 4.1 Monetary Validation in complete_hold_purchase

**Files Changed:**

- 🆕 **NEW:** `supabase/migrations/20251025150000_validate_monetary_amounts_in_complete_hold_purchase.sql`

**What Changed:**

- Database function now validates ALL monetary amounts server-side
- Computes expected prices from `ticket_tiers` table
- Validates promotional code discounts
- Raises exceptions on any price mismatch

**Test Cases:**

- [ ] **Test 4.1.1:** Normal purchase with correct amounts → Should succeed
- [ ] **Test 4.1.2:** Try to tamper with unit_price_cents → Should fail with "Unit price mismatch"
- [ ] **Test 4.1.3:** Try to tamper with subtotal_cents → Should fail with "Subtotal mismatch"
- [ ] **Test 4.1.4:** Try to tamper with total_cents → Should fail with "Total mismatch"
- [ ] **Test 4.1.5:** Apply promo code with correct discount → Should succeed
- [ ] **Test 4.1.6:** Try to tamper with discount_amount_cents → Should fail with "Discount amount mismatch"
- [ ] **Test 4.1.7:** Provide discount without promo code → Should fail

**Tamper Testing Method:**

```sql
-- Test tampered unit price (should fail)
SELECT complete_hold_purchase(
  'hold-id'::uuid,
  'user-id'::uuid,
  2,  -- quantity
  999,  -- WRONG unit_price_cents (should be from ticket_tiers)
  1998,  -- subtotal_cents
  0,  -- processing_fee_cents
  1998,  -- total_cents
  'org-id'::uuid,
  'event-id'::uuid,
  'tier-id'::uuid,
  'John Doe',
  'john@example.com',
  '[{"qr_token":"...","qr_code":"..."}]'::jsonb
);
-- Expected: Exception "Unit price mismatch"
```

---

### 4.2 Ticket Data Payload Validation

**Files Changed:**

- 🆕 **NEW:** `supabase/migrations/20251025151000_validate_ticket_data_in_complete_hold_purchase.sql`

**What Changed:**

- Validates `ticket_data` is a JSON array
- Ensures array length matches quantity
- Prevents silent failures and inventory mismatches

**Test Cases:**

- [ ] **Test 4.2.1:** Valid ticket_data with length = quantity → Should succeed
- [ ] **Test 4.2.2:** Provide ticket_data as object (not array) → Should fail
- [ ] **Test 4.2.3:** Provide ticket_data with length < quantity → Should fail with cardinality error
- [ ] **Test 4.2.4:** Provide ticket_data with length > quantity → Should fail with cardinality error
- [ ] **Test 4.2.5:** Provide empty array when quantity > 0 → Should fail

**Test Method:**

```sql
-- Test mismatched quantity (should fail)
SELECT complete_hold_purchase(
  ...
  3,  -- quantity = 3
  ...
  '[{"qr_token":"...","qr_code":"..."}]'::jsonb  -- Only 1 ticket!
);
-- Expected: Exception "ticket_data length (1) must equal quantity (3)"
```

---

## 🔑 5. Row-Level Security (RLS) Improvements

### 5.1 Promotional Codes Policy Rename

**Files Changed:**

- 🆕 **NEW:** `supabase/migrations/20251025145000_rename_promotional_codes_policy.sql`

**What Changed:**

- Renamed policy from "Anyone can view..." to "Authenticated users can view..."
- Policy requires authentication (`auth.uid() IS NOT NULL`)
- Clarifies that only logged-in users can access promo codes

**Test Cases:**

- [ ] **Test 5.1.1:** Query `promotional_codes` while authenticated → Should succeed
- [ ] **Test 5.1.2:** Query `promotional_codes` as anonymous user → Should fail (RLS blocks)
- [ ] **Test 5.1.3:** Verify policy name in DB: `\d+ promotional_codes` shows correct policy name
- [ ] **Test 5.1.4:** Check only published event promo codes are visible

---

## 📊 6. API Endpoint Permission Checks

### 6.1 Promotional Code Deletion

**Files Changed:**

- `app/api/organizer/promotional-codes/[id]/route.ts` (lines 40-80)

**What Changed:**

- Verifies user is member of organization before allowing deletion
- Proper ownership validation via `organization_members` join

**Test Cases:**

- [ ] **Test 6.1.1:** Organizer deletes their own promo code → Should succeed
- [ ] **Test 6.1.2:** Try to delete another organizer's promo code → Should fail with 403 Forbidden
- [ ] **Test 6.1.3:** Non-authenticated user attempts deletion → Should fail with 401 Unauthorized
- [ ] **Test 6.1.4:** Admin user deletes any promo code → Should succeed (if admin role)

---

### 6.2 Promotional Tickets Viewing

**Files Changed:**

- `app/api/organizer/promotional-tickets/[eventId]/route.ts` (lines 40-76)

**What Changed:**

- Verifies user is organization member before showing promotional tickets
- Prevents unauthorized viewing of ticket data

**Test Cases:**

- [ ] **Test 6.2.1:** Organizer views their event's promo tickets → Should succeed with list
- [ ] **Test 6.2.2:** Try to view another organization's promo tickets → Should fail with 403 Forbidden
- [ ] **Test 6.2.3:** Non-authenticated user attempts viewing → Should fail with 401 Unauthorized
- [ ] **Test 6.2.4:** Verify returned data includes ticket details (email, name, status)

---

## 🧪 7. Integration & End-to-End Tests

### 7.1 Complete Purchase Flow with Promo Code

**Test Scenario:**

1. User selects tickets ($50 each, quantity 2 = $100 subtotal)
2. Applies promo code "SAVE20" (20% off)
3. Fills billing information (including document ID)
4. Proceeds to payment
5. Payment fails (retry scenario)
6. Billing info restored, document ID cleared
7. Re-enters document ID
8. Payment succeeds

**Verification Points:**

- [ ] Promo code discount applied correctly: $100 - $20 = $80 total
- [ ] Promotional code usage_count incremented by 1
- [ ] Document ID not in sessionStorage after step 3
- [ ] Document ID field empty on step 6
- [ ] Order created with correct amounts in database
- [ ] Tickets issued with proper QR codes
- [ ] Email sent with masked address in logs

---

### 7.2 Race Condition Testing: Check-ins

**Test Scenario:**

1. Generate QR code for ticket
2. Launch 10 concurrent check-in requests for same ticket
3. Verify only 1 succeeds, others get 409 Conflict

**Tools:**

- Apache Bench: `ab -n 10 -c 10 -T 'application/json' -p checkin.json https://app.flme.co/api/qr-scanner/checkin`
- Artillery.io load testing
- Custom script with Promise.all()

---

### 7.3 Race Condition Testing: Promo Code Usage Limits

**Test Scenario:**

1. Create promo code with usage_limit = 5
2. Launch 10 concurrent purchase attempts using same code
3. Verify exactly 5 succeed, others fail with "limit reached"

**Verification:**

- [ ] Final `usage_count` in database = 5 (not more)
- [ ] Check constraint prevents `usage_count > usage_limit`
- [ ] No duplicate orders created

---

## 🔍 8. Manual Testing Checklist

### Pre-Deployment Validation

- [ ] All migrations applied successfully to staging DB
- [ ] No migration rollback errors
- [ ] RLS policies active and correct
- [ ] Database constraints functioning

### Organizer Dashboard

- [ ] Create promotional code → Success
- [ ] Edit promotional code → Success
- [ ] Delete promotional code → Success
- [ ] View promotional tickets for event → Success
- [ ] Send promotional ticket → Email masked in logs

### Customer Purchase Flow

- [ ] Browse events → Success
- [ ] Select tickets → Success
- [ ] Apply promo code → Discount applied
- [ ] Fill billing info → Validation works
- [ ] Payment succeeds → Tickets issued
- [ ] Check sessionStorage → Document ID not present

### QR Scanner App

- [ ] Scan regular ticket → Check-in succeeds
- [ ] Scan same ticket again → Fails (already checked in)
- [ ] Scan promotional ticket → Check-in succeeds
- [ ] Concurrent scans → Only one succeeds

---

## 🐛 9. Regression Testing

### Areas to Check for Regressions

- [ ] Normal ticket purchase (without promo code)
- [ ] RSVP-to-purchase flow
- [ ] Event creation by organizers
- [ ] User registration and login
- [ ] Admin dashboard functionality
- [ ] Email deliverability (tickets, RSVPs, promos)

---

## 📈 10. Performance & Monitoring

### Database Performance

- [ ] Check query performance on `promotional_codes` with new constraint
- [ ] Verify indexes are used: `EXPLAIN ANALYZE` on key queries
- [ ] Monitor lock contention on concurrent check-ins
- [ ] Check `complete_hold_purchase` function execution time

### Logging & Observability

- [ ] Verify logs don't contain plain-text PII
- [ ] Check error logs for proper masking
- [ ] Monitor Datafast transaction logs
- [ ] Set up alerts for constraint violations

---

## ✅ Sign-Off

### Testing Completed By:

- **Tester Name:** ****\*\*\*\*****\_\_\_****\*\*\*\*****
- **Date:** ****\*\*\*\*****\_\_\_****\*\*\*\*****
- **Environment:** [ ] Staging [ ] Production
- **All Tests Passed:** [ ] Yes [ ] No

### Issues Found:

```
[List any issues discovered during testing]
```

### Deployment Approval:

- [ ] All critical tests passed
- [ ] No regressions detected
- [ ] Documentation updated
- [ ] Team notified

---

## 📚 Appendix

### Related Documentation

- `docs_guides/DATAFAST_ERROR_CATEGORIZATION.md`
- `docs_guides/ERROR_HANDLING_GUIDE.md`
- `docs_guides/FEATURE_DEVELOPMENT_GUIDE.md`

### Database Migration Order

1. `20251025000000_fix_promotional_tickets_email_case_sensitivity.sql`
2. `20251025140000_add_promotional_code_usage_check_constraint.sql`
3. `20251025145000_rename_promotional_codes_policy.sql`
4. `20251025150000_validate_monetary_amounts_in_complete_hold_purchase.sql`
5. `20251025151000_validate_ticket_data_in_complete_hold_purchase.sql`

### Test Data Setup

```sql
-- Create test promotional code
INSERT INTO promotional_codes (event_id, code, discount_percentage, usage_limit)
VALUES ('event-uuid', 'TEST20', 20, 5);

-- Create test promotional ticket
INSERT INTO promotional_tickets (event_id, ticket_tier_id, email, customer_name)
VALUES ('event-uuid', 'tier-uuid', 'test@example.com', 'Test User');
```

---

**End of Testing Checklist**
