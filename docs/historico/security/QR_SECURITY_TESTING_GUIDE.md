# QR Security Enhancement Testing Guide

## ✅ Implementation Complete

All QR security enhancements have been implemented:

- ✅ Created `app/lib/qr-security.ts` with signature generation/verification
- ✅ Updated all purchase endpoints (direct, direct-free, hold, hold-free)
- ✅ Updated promotional ticket generation
- ✅ Updated scanner verification endpoint
- ✅ Generated QR signature secret

## 🔧 Setup Instructions

### 1. Add Environment Variable

**CRITICAL STEP:** Copy the secret from `QR_SECURITY_SECRET.txt` to your `.env.local` file:

```bash
# Create .env.local if it doesn't exist
touch .env.local

# Add this line (get the value from QR_SECURITY_SECRET.txt):
echo "QR_SIGNATURE_SECRET=d0abe1fd9eb4bb2f90d3691723bf868ca3a65de48dc36e17241d6f230b743440" >> .env.local
```

**Important:** Make sure `.env.local` is in your `.gitignore` (it should be by default).

### 2. Restart Your Development Server

```bash
# Stop the current server (Ctrl+C) and restart:
npm run dev
# or
pnpm dev
```

## 🧪 Testing Plan

### Phase 1: Basic Functionality Tests

#### Test 1: Direct Purchase (Paid Ticket)

**Goal:** Verify new tokens and signatures work for direct purchases

**Steps:**

1. Navigate to an event that requires payment
2. Complete the RSVP process
3. Make a payment through Datafast
4. Check the ticket email/PDF

**Expected Results:**

- ✅ Purchase completes successfully
- ✅ Email received with ticket PDF
- ✅ Download the PDF
- ✅ Scan the QR code with a generic QR reader app (like your phone camera)
- ✅ Should see ONLY: `{"qrToken":"<uuid>","timestamp":"<iso-date>","signature":"<hex>"}`
- ✅ NO personal data visible (no orderId, userId, eventName, etc.)

**How to Verify:**

```bash
# Use any QR code reader app on your phone
# Or use an online QR decoder: https://zxing.org/w/decode.jhtml
# Upload the QR image and verify the decoded JSON
```

---

#### Test 2: Direct Free Purchase

**Goal:** Verify free tickets also use secure QR codes

**Steps:**

1. Create an event with a $0 ticket tier OR use a 100% discount code
2. Complete the RSVP and purchase
3. Check the ticket

**Expected Results:**

- ✅ Same as Test 1 - secure QR format only

---

#### Test 3: Hold-Based Purchase

**Goal:** Verify hold purchases use signatures now

**Steps:**

1. Start a purchase that creates a hold
2. Complete the payment before hold expires
3. Check the ticket

**Expected Results:**

- ✅ QR code contains: token, timestamp, signature
- ✅ No event_id, tier_id, or attendee_email in QR

---

#### Test 4: Promotional Ticket

**Goal:** Verify promotional tickets use secure format

**Steps:**

1. Log in as an organizer
2. Go to your event's dashboard
3. Create a promotional ticket (send to an email)
4. Check the received ticket

**Expected Results:**

- ✅ Secure QR format (token + timestamp + signature)
- ✅ No ticketId, eventName, attendeeName in QR

---

### Phase 2: Scanner Tests

#### Test 5: Scan Valid Ticket

**Goal:** Verify scanner accepts valid signed QR codes

**Steps:**

1. Have a ticket from any of the above tests
2. Log in as organizer/admin
3. Go to QR Scanner page
4. Scan the ticket QR code

**Expected Results:**

- ✅ Scanner successfully verifies the ticket
- ✅ Shows ticket details (name, email, tier, event)
- ✅ "Check In" button appears
- ✅ Can successfully check in the ticket

---

#### Test 6: Tamper Detection (Manual Test)

**Goal:** Verify signature prevents tampering

**Steps:**

1. Get a valid QR code JSON: `{"qrToken":"abc-123","timestamp":"2025-11-04T12:00:00Z","signature":"valid-sig"}`
2. Modify the token: `{"qrToken":"MODIFIED","timestamp":"2025-11-04T12:00:00Z","signature":"valid-sig"}`
3. Generate a new QR code with this modified data (use https://www.qr-code-generator.com/)
4. Try to scan it

**Expected Results:**

- ❌ Scanner rejects with "Invalid or tampered QR code" (403 error)
- ✅ Cannot proceed with check-in

---

#### Test 7: Invalid Signature Test

**Goal:** Verify invalid signatures are rejected

**Steps:**

1. Get a valid QR JSON
2. Change just the signature to random hex: `{"qrToken":"abc-123","timestamp":"2025-11-04T12:00:00Z","signature":"FAKE"}`
3. Generate QR and scan

**Expected Results:**

- ❌ Scanner rejects with "Invalid or tampered QR code" (403 error)

---

#### Test 8: Double Scan Prevention

**Goal:** Verify single-use lock still works

**Steps:**

1. Scan and check in a valid ticket
2. Try to scan the same ticket again

**Expected Results:**

- ✅ First scan: Success + check-in
- ❌ Second scan: "Ticket already checked in" error

---

### Phase 3: Privacy Verification

#### Test 9: Privacy Check - Regular Tickets

**Goal:** Confirm no personal data in QR codes

**Steps:**

1. Purchase a ticket (any type)
2. Extract QR code from PDF
3. Decode with QR reader

**Checklist - QR Should NOT Contain:**

- ❌ orderId
- ❌ userId
- ❌ eventId
- ❌ tierName
- ❌ eventName
- ❌ attendee name
- ❌ attendee email
- ❌ ticket number

**Checklist - QR SHOULD Contain:**

- ✅ qrToken (random UUID)
- ✅ timestamp (ISO format)
- ✅ signature (64-char hex)

---

#### Test 10: Privacy Check - Promotional Tickets

**Goal:** Confirm promotional tickets are also private

**Steps:**

1. Create promotional ticket
2. Decode the QR

**Expected:**

- ✅ Only token + timestamp + signature
- ❌ No customer name, email, ticketId, eventName

---

### Phase 4: Database Verification

#### Test 11: Check Database Records

**Goal:** Verify qr_token is being stored correctly

**Steps:**

1. After creating any ticket, query the database:

```sql
-- Regular tickets
SELECT id, qr_token, attendee_name, attendee_email, status
FROM tickets
ORDER BY created_at DESC
LIMIT 5;

-- Promotional tickets
SELECT id, qr_token, customer_name, email, status
FROM promotional_tickets
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Results:**

- ✅ `qr_token` column is populated with UUID values (not null)
- ✅ Each ticket has a unique qr_token
- ✅ All recent tickets have qr_token values

---

### Phase 5: Error Handling Tests

#### Test 12: Missing Signature

**Goal:** Verify scanner rejects QR without signature

**Steps:**

1. Create QR with: `{"qrToken":"abc-123","timestamp":"2025-11-04T12:00:00Z"}`
2. Try to scan

**Expected:**

- ❌ "Invalid QR code format" (400 error)

---

#### Test 13: Missing Environment Variable

**Goal:** Verify graceful error when secret not configured

**Steps:**

1. Temporarily remove `QR_SIGNATURE_SECRET` from `.env.local`
2. Restart server
3. Try to purchase a ticket

**Expected:**

- ❌ Server error with clear message about missing QR_SIGNATURE_SECRET
- ✅ Error includes instructions: "Generate one with: node -e ..."

---

## 📊 Test Results Checklist

Copy this checklist and mark each test as you complete it:

```
Purchase Tests:
[ ] Test 1: Direct Purchase - QR is secure
[ ] Test 2: Direct Free Purchase - QR is secure
[ ] Test 3: Hold-Based Purchase - QR is secure
[ ] Test 4: Promotional Ticket - QR is secure

Scanner Tests:
[ ] Test 5: Scan Valid Ticket - Works
[ ] Test 6: Tamper Detection - Rejects modified token
[ ] Test 7: Invalid Signature - Rejects fake signature
[ ] Test 8: Double Scan Prevention - Works

Privacy Tests:
[ ] Test 9: Regular Tickets - No personal data in QR
[ ] Test 10: Promotional Tickets - No personal data in QR

Database Tests:
[ ] Test 11: qr_token stored correctly

Error Handling:
[ ] Test 12: Missing signature rejected
[ ] Test 13: Missing env var error message clear
```

---

## 🐛 Troubleshooting

### Issue: "QR_SIGNATURE_SECRET environment variable is not configured"

**Solution:**

1. Check that `.env.local` exists in project root
2. Verify the secret is in the file
3. Restart your dev server
4. If using Vercel/production, add the env var to your hosting platform

### Issue: Scanner shows "Invalid or tampered QR code" for valid tickets

**Possible Causes:**

1. Secret mismatch between generation and verification
2. Old tickets created before implementation (expected - they won't work)
3. Timestamp format issue

**Solution:**

- Create a NEW ticket after implementation
- Verify QR_SIGNATURE_SECRET is the same in all environments

### Issue: QR codes still show old format with personal data

**Solution:**

- Clear your browser cache
- Hard refresh the page (Cmd+Shift+R or Ctrl+Shift+R)
- Restart the dev server
- Create a NEW ticket (old ones will have old format)

---

## ✨ Success Criteria Summary

Implementation is successful when:

1. ✅ **Privacy Protected:** QR codes contain ONLY token, timestamp, signature
2. ✅ **Tampering Prevented:** Modified QR codes are rejected with 403 error
3. ✅ **Consistent Approach:** All ticket types (direct, hold, promotional) use same format
4. ✅ **Functionality Preserved:** Purchase, scan, and check-in all work normally
5. ✅ **Database Integrity:** All tickets have unique qr_token values

---

## 📝 Quick Test Commands

```bash
# Generate a test QR secret (for testing only)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Check if env var is loaded (in Node console)
node -e "require('dotenv').config({ path: '.env.local' }); console.log('QR Secret:', process.env.QR_SIGNATURE_SECRET ? 'LOADED' : 'MISSING')"

# Decode a QR code from image (requires zxing library)
# Or use: https://zxing.org/w/decode.jhtml
```

---

## 🎯 Next Steps After Testing

Once all tests pass:

1. **Deploy to staging** (if you have one)
2. **Add monitoring** for signature verification failures
3. **Consider adding** rate limiting on scanner endpoints (Phase 2 of security plan)
4. **Document** the security model for your team
5. **Optional:** Implement encryption for additional privacy (Phase 2 of security plan)

---

**Questions or Issues?** Check the implementation files:

- Core logic: `app/lib/qr-security.ts`
- Scanner: `app/api/qr-scanner/verify/route.ts`
- Purchase endpoints: `app/api/purchase/complete-*.ts`
