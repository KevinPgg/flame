# QR Code Security Analysis for Project Flame

**Date:** November 4, 2025  
**Status:** Security Review Complete

## Executive Summary

Your current QR code implementation follows **some** security best practices but has **gaps** in privacy protection and tamper detection. This document provides a detailed analysis and recommendations focused on your specific concerns: **protecting user privacy** and **preventing QR code tampering**.

**Note:** Screenshot sharing is mitigated by your physical ID verification process at venue entry, so dynamic QR codes are not prioritized.

### 🎯 Quick Summary

**What You're Doing Right:**

- ✅ Real-time database validation
- ✅ Single-use check-in locks
- ✅ Physical ID verification at venue
- ✅ Permission-based scanner access

**What Needs Fixing:**

- ❌ **Privacy Issue:** QR codes contain plaintext data (user IDs, order info) that anyone can read
- ❌ **Tampering Risk:** No digital signatures - fake/modified QR codes could work
- 🟡 **Inconsistency:** Two different QR systems (hold-based vs direct purchase)

**Recommended Fix:**

- **2-3 days of work:** Add HMAC signatures + standardize on tokenization
- **Result:** QR codes contain only random UUIDs + tamper-proof signatures
- **Impact:** Zero user friction, backwards compatible, solves both problems

---

## Current Implementation Analysis

### ✅ What You're Doing Well

1. **Real-Time Database Validation**

   - All QR scans query the database to validate ticket status
   - No offline-only validation that could be exploited
   - Location: `app/api/qr-scanner/verify/route.ts`

2. **Single-Use Lock with Atomic Updates**

   - Tickets can only be checked in once
   - Uses atomic database updates with WHERE predicates to prevent race conditions
   - Code: `.eq("status", "issued").is("checked_in_at", null)`
   - Location: `app/api/qr-scanner/checkin/route.ts` (lines 154-187)

3. **Permission-Based Access Control**

   - Only organizers and admins can scan QR codes
   - Organizers can only scan tickets for their own events
   - Verification checks user role and organization membership

4. **Status Validation**

   - Prevents scanning of void or refunded tickets
   - Tracks check-in timestamp and device ID
   - Proper status transitions (issued → checked_in)

5. **Cryptographically Secure Tokens (Partial)**
   - Hold-based tickets use `crypto.randomUUID()` for unique tokens
   - UUID v4 provides 122 bits of entropy (highly secure)
   - Location: `app/api/purchase/complete-hold/route.ts` (line 212)

---

## ⚠️ Security Gaps to Address

### 1. **No Encryption - Plaintext JSON in QR Codes** ⚠️ **HIGH PRIORITY (Privacy)**

**Current State:**

- QR codes contain **plaintext JSON** data that anyone can read
- Example from `complete-direct/route.ts`:

```json
{
  "orderId": "uuid-here",
  "eventId": "uuid-here",
  "userId": "uuid-here",
  "tierName": "VIP Pass",
  "eventName": "Concert Night",
  "ticketNumber": 1,
  "timestamp": "2025-11-04T..."
}
```

**Security Risk:**

- **Privacy Leak:** Anyone with a scanner app can read attendee information
- **No Tamper Detection:** A malicious actor could theoretically modify the JSON and regenerate the QR code
- **Information Disclosure:** Exposes internal IDs, user associations, event details

**Industry Standard:**

- QR codes should contain **encrypted ciphertext** or **opaque tokens only**
- Even if intercepted, the data should be unreadable without the private key

---

### 2. **Inconsistent Approach - Two Different QR Systems**

**Problem:**
You have **two different QR code generation strategies**:

**A. Hold-Based Tickets** (Tokenization Approach - BETTER)

- Generates: `crypto.randomUUID()` → stored as `qr_token` in database
- QR Contains:

```json
{
  "ticket_id": "qr-token-uuid",
  "event_id": "event-uuid",
  "tier_id": "tier-uuid",
  "attendee_email": "user@example.com",
  "timestamp": "2025-11-04..."
}
```

- Validation: Looks up ticket by `qr_token`
- Location: `complete-hold/route.ts`, `complete-hold-free/route.ts`

**B. Direct Purchase Tickets** (Full Data Approach - WORSE)

- No unique token generated
- QR Contains: Full order/event/user data (as shown above)
- Validation: Looks up by `orderId` and `ticketNumber`
- Location: `complete-direct/route.ts`, `complete-direct-free/route.ts`

**Security Risk:**

- **Inconsistent security posture** across purchase flows
- Direct purchase tickets expose **more sensitive data** than hold-based tickets
- Harder to maintain and audit

**Recommendation:**

- **Standardize on tokenization** for ALL ticket types

---

### 3. **Static QR Codes - Acceptable with ID Verification**

**Current State:**

- QR codes are generated **once** at purchase time
- Remain static forever
- Can be screenshotted, printed, or shared

**Your Mitigation:**

- ✅ Physical ID verification at venue entry
- ✅ Attendee name matching with government ID
- ✅ Single-use check-in prevents double scanning

**Risk Status:** **ACCEPTABLE** - Screenshot sharing is mitigated by physical verification controls at the door. The first person to scan must match the ticket holder's ID.

**Note:** Dynamic QR codes (rotating every 30-60 seconds) are NOT required for your use case since you verify physical identity at entry. This is a valid security model used by many event platforms.

---

### 4. **No Digital Signatures - No Tamper Protection** ⚠️ **HIGH PRIORITY**

**Current State:**

- QR codes contain raw JSON or token data
- No cryptographic signature to verify authenticity
- No way to detect if QR data has been modified

**Security Risk:**

- A sophisticated attacker could:
  1. Decode a legitimate QR code
  2. Modify the JSON (e.g., change ticket tier, event ID)
  3. Regenerate a new QR code with fraudulent data
  4. System might accept it if validation logic has gaps

**Industry Standard:**

- **HMAC or RSA signatures** embedded in QR code
- Server verifies signature before processing
- Any modification invalidates the signature

**Example Secure QR Data:**

```json
{
  "token": "opaque-uuid",
  "timestamp": "1699123456",
  "signature": "hmac_sha256(token + timestamp + secret_key)"
}
```

---

### 5. **Direct Purchase Tickets Don't Use qr_token Field**

**Current State:**

- Database has `qr_token` field (UUID, unique) on `tickets` table
- Hold-based tickets populate and use this field
- **Direct purchase tickets leave it empty/null or use default**
- Validation for direct purchases uses `orderId` + `ticketNumber` instead

**Security Risk:**

- Not utilizing the secure token infrastructure already in place
- Order IDs might be sequential or predictable (easier to guess)
- Ticket numbers are simple integers (1, 2, 3...)

**Recommendation:**

- **ALL tickets** should generate and store a unique `qr_token`
- QR code should contain **only the token** (or encrypted token)
- Validation should **only** use `qr_token` lookup

---

## Comparison to Industry Best Practices

| Security Feature         | Industry Standard                | Your Implementation        | Gap                          |
| ------------------------ | -------------------------------- | -------------------------- | ---------------------------- |
| **Tokenization**         | ✅ All tickets use opaque tokens | 🟡 Only hold-based tickets | Medium                       |
| **Encryption**           | ✅ AES-256 encrypted QR data     | ❌ Plaintext JSON          | **High** (Privacy concern)   |
| **Digital Signatures**   | ✅ HMAC/RSA signatures           | ❌ None                    | **High** (Tampering risk)    |
| **Dynamic QR Codes**     | ✅ Rotate every 30-60s           | ❌ Static forever          | Low (mitigated by ID checks) |
| **Real-Time Validation** | ✅ Always check database         | ✅ Implemented             | None                         |
| **Single-Use Lock**      | ✅ Atomic updates                | ✅ Implemented             | None                         |
| **Permission Checks**    | ✅ Role-based access             | ✅ Implemented             | None                         |
| **Physical ID Verify**   | 🟡 Optional                      | ✅ Implemented             | None (your advantage)        |

---

## Threat Model

### What Your Current System **CAN** Prevent:

✅ Double check-ins (same ticket scanned twice)  
✅ Unauthorized scanner access (non-organizers)  
✅ Void/refunded ticket usage  
✅ Cross-event ticket fraud (event ID validation)  
✅ Screenshot fraud (mitigated by physical ID verification at door)

### What Your Current System **CANNOT** Prevent (Your Concerns):

❌ **Privacy leaks** - Anyone with a QR scanner app can read attendee information  
❌ **QR code tampering** - No signature verification to detect modifications  
❌ **Information disclosure** - Exposes internal IDs and user associations

### Threats You've Accepted (Mitigated by Operations):

🟡 Ticket sharing/resale - Controlled by ID verification at venue entry  
🟡 Screenshot distribution - First scanner must present matching ID

---

## Recommended Security Enhancements

**Focus Areas:** Privacy Protection & Tamper Detection

### 🔴 Priority 1: High - Address Privacy & Tampering (Implement ASAP)

#### 1.1 Add HMAC Signature Verification (Prevents Tampering)

**Action:**

- Add digital signature to all QR codes
- Verify signature on scan to prevent tampering

**Implementation:**

```typescript
import crypto from "crypto";

// Generate signature
function generateQRSignature(token: string, timestamp: string): string {
  const secret = process.env.QR_SIGNATURE_SECRET!; // Store in .env
  const data = `${token}:${timestamp}`;
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

// Verify signature
function verifyQRSignature(
  token: string,
  timestamp: string,
  signature: string
): boolean {
  const expected = generateQRSignature(token, timestamp);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// In QR code generation:
const qrData = {
  qrToken: qrToken,
  timestamp: timestamp,
  signature: generateQRSignature(qrToken, timestamp),
};

// In validation endpoint:
if (!verifyQRSignature(qrData.qrToken, qrData.timestamp, qrData.signature)) {
  return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
}
```

#### 1.2 Standardize on Tokenization for ALL Tickets (Reduces Privacy Leaks)

**Action:**

- Modify `complete-direct/route.ts` and `complete-direct-free/route.ts`
- Generate `qr_token` using `crypto.randomUUID()` for all tickets
- Store only the token in the QR code (no full user/order data)

**Code Change:**

```typescript
// Instead of:
const qrData = {
  orderId: order.id,
  eventId: rsvpDetails.event_id,
  userId: rsvpDetails.user_id,
  tierName: rsvpDetails.ticket_tiers.name,
  eventName: rsvpDetails.events.name,
  ticketNumber: i + 1,
  timestamp: new Date().toISOString(),
};

// Do this:
const qrToken = crypto.randomUUID();
const timestamp = new Date().toISOString();
const signature = generateQRSignature(qrToken, timestamp);

const qrData = {
  qrToken: qrToken,
  timestamp: timestamp,
  signature: signature,
};

// Store qrToken in database with ticket
ticketInserts.push({
  qr_token: qrToken, // ← Use this field!
  qr_code: qrCodeDataUrl,
  // ... other fields
});
```

#### 1.3 Update Validation to Use qr_token Only

**Action:**

- Modify `app/api/qr-scanner/verify/route.ts`
- Remove order-based lookup logic
- Use only `qr_token` for all ticket lookups

**Code Change:**

```typescript
// Simplified validation:
const { qrToken, timestamp, signature } = qrData;

// Verify signature first (prevents tampering)
if (!verifyQRSignature(qrToken, timestamp, signature)) {
  return NextResponse.json(
    { error: "Invalid ticket signature" },
    { status: 403 }
  );
}

// Look up ticket by token only
const { data: ticket } = await supabaseAdmin
  .from("tickets")
  .select("*")
  .eq("qr_token", qrToken)
  .single();

// Also check promotional_tickets by qr_token if not found above
```

**Benefits:**

- ✅ QR codes no longer expose user IDs, order IDs, or personal info
- ✅ Tokens are meaningless random UUIDs (122 bits entropy)
- ✅ Consistent security model across all ticket types
- ✅ Signature prevents tampering and fake QR codes

---

### 🟡 Priority 2: Optional - Additional Privacy Layer

#### 2.1 Encrypt QR Code Data (Maximum Privacy)

**Action:**

- Encrypt the entire QR payload with AES-256

**Implementation:**

```typescript
import crypto from "crypto";

function encryptQRData(data: string): string {
  const key = Buffer.from(process.env.QR_ENCRYPTION_KEY!, "hex"); // 32 bytes
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");

  // Return IV + encrypted data
  return iv.toString("base64") + ":" + encrypted;
}

function decryptQRData(encryptedData: string): string {
  const [ivBase64, encrypted] = encryptedData.split(":");
  const iv = Buffer.from(ivBase64, "base64");
  const key = Buffer.from(process.env.QR_ENCRYPTION_KEY!, "hex");

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
```

#### 2.2 Add Rate Limiting on Scanner Endpoints

**Action:**

- Prevent brute-force scanning attempts
- Limit to 100 scans per minute per device
- Protects against automated attacks

#### 2.3 Add Audit Logging

**Action:**

- Log all scan attempts (successful and failed)
- Track device ID, timestamp, ticket ID, result
- Useful for fraud detection and analytics

---

### 🟢 Priority 3: Not Needed (Already Mitigated)

#### 3.1 Dynamic QR Codes (Rotating)

**Status:** NOT RECOMMENDED - Your physical ID verification at venue entry makes this unnecessary.

**Why You Don't Need This:**

- Screenshot sharing is prevented by ID matching at the door
- Adds significant complexity to user experience (requires app, auto-refresh)
- Static QR codes work fine when combined with real-world identity verification
- Many major event platforms use the same model (Eventbrite, Ticketmaster for some events)

**If you want it anyway:** See Priority 2.2 implementation in earlier versions of this document.

---

## Migration Strategy

### Phase 1: Add Signatures + Standardize Tokenization (2-3 days)

**Goal:** Prevent tampering and reduce privacy leaks

1. Generate `QR_SIGNATURE_SECRET` environment variable
2. Create signature helper functions (`generateQRSignature`, `verifyQRSignature`)
3. Update **all** purchase endpoints to:
   - Generate `qr_token` using `crypto.randomUUID()`
   - Generate signature with token + timestamp
   - Store only `{ qrToken, timestamp, signature }` in QR code
4. Update verification endpoint to:
   - Verify signature first (reject if invalid)
   - Look up tickets by `qr_token` only
   - Make signature verification **optional at first** (for backwards compatibility)
5. Test thoroughly with new tickets
6. **Important:** Legacy tickets (already issued) will still work via old validation path

**After 2 weeks:** Make signature verification mandatory for all new scans.

### Phase 2: Encryption (Optional, 1-2 days)

**Goal:** Maximum privacy - even the QR structure is hidden

1. Generate `QR_ENCRYPTION_KEY` environment variable
2. Wrap QR data generation with AES-256 encryption
3. Add decryption to scanner (transparent to users)
4. This makes QR codes completely opaque

**Trade-off:** Adds ~100ms to scan time, but provides defense-in-depth.

---

## Environment Variables Required

Add to your `.env` file:

```bash
# QR Code Security Keys
QR_SIGNATURE_SECRET=your-64-character-hex-secret-here
QR_ENCRYPTION_KEY=your-64-character-hex-key-here  # Optional, for Phase 4

# Generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Testing Checklist

Before deploying security enhancements:

- [ ] Valid tickets scan successfully
- [ ] Void/refunded tickets are rejected
- [ ] Expired QR codes (if dynamic) are rejected
- [ ] Invalid signatures are rejected
- [ ] Double scan attempts are prevented
- [ ] Cross-event ticket fraud is prevented
- [ ] Organizers can only scan their own events
- [ ] Performance is acceptable (< 2s scan time)
- [ ] Legacy tickets (pre-upgrade) still work

---

## Cost-Benefit Analysis

| Enhancement           | Development Time | Security Gain                 | User Impact            | Priority     |
| --------------------- | ---------------- | ----------------------------- | ---------------------- | ------------ |
| Signatures + Tokens   | 2-3 days         | **High** (Prevents tampering) | None (transparent)     | **Must Do**  |
| Encryption            | 1-2 days         | Medium (Additional privacy)   | ~100ms scan delay      | Optional     |
| Rate Limiting         | 1 day            | Low (Prevents brute force)    | None                   | Nice to Have |
| Audit Logging         | 1 day            | Low (Detection & analytics)   | None                   | Nice to Have |
| Dynamic QR (rotating) | 3-5 days         | Low (Already mitigated by ID) | High (requires app/UX) | Not Needed   |

**Recommendation:** Implement Phase 1 (Signatures + Tokenization) immediately. This addresses both your concerns (privacy & tampering) with minimal effort and zero user impact.

---

## Conclusion

Your current implementation has a **solid foundation** with real-time validation, single-use locks, and physical ID verification. The main gaps are **privacy leaks** (plaintext data in QR codes) and **lack of tamper protection** (no signatures).

**Key Takeaways:**

1. ✅ You're doing well on preventing double check-ins and fraud (ID verification)
2. ❌ **You need signatures** to prevent QR code tampering (HIGH PRIORITY)
3. ❌ **You need tokenization** for privacy and consistency (HIGH PRIORITY)
4. ✅ You DON'T need dynamic QR codes - your ID verification handles screenshot fraud
5. 🟡 Encryption is optional but recommended for maximum privacy

**Recommended Action Plan:**

1. **Week 1-2:** Implement Phase 1 (Signatures + Tokenization) - **2-3 days of work**
   - Addresses both your concerns (privacy & tampering)
   - Zero impact on users
   - Backwards compatible with existing tickets
2. **Optional:** Add encryption for additional privacy layer if desired

3. **Monitor:** Track any security incidents or attempted fraud

**ROI:** High security improvement with minimal development effort and zero user friction.

---

**Document Version:** 2.0 (Updated based on business context)  
**Last Updated:** November 4, 2025  
**Reviewed By:** AI Security Analysis  
**Risk Acceptance:** Screenshot sharing (mitigated by physical ID verification)
