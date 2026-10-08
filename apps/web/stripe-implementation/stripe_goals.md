# Technical Specification: Stripe Connect Migration (Guaranteed Net Model)

**Version:** 2.1
**Date:** January 2026
**Target System:** Stripe Connect (Express) + Supabase
**Context:** Migration from Datafast to Stripe for a Ticket Marketplace (Intermediary Model).

---

## 1. Executive Summary

We are migrating a ticket-selling platform to **Stripe Connect** acting as a marketplace intermediary. The architecture separates platform revenue from organizer ticket revenue.

**Key Objectives:**

- **Guaranteed Net Payout:** The Organizer must receive the **exact base price** of the ticket (e.g., $100.00). The Platform absorbs all variable Stripe fees and keeps the surplus.
- **Merchant of Record:** The Organizer is the merchant of record for the ticket price. The Platform is the merchant of record for the markup.
- **Profit Protection:** Use "Auth & Capture" to prevent non-refundable Stripe fees on rejected RSVPs.

---

## 2. Architecture: Stripe Connect

### 2.1 Account Type

- **Organizer Accounts:** `Stripe Express` Accounts.
- **Onboarding:** Custom redirect flow to Stripe-hosted onboarding.
- **Payout Schedule:** `manual`. (Organizers request payouts via platform UI).

### 2.2 Payment Flow Model

- **Charge Type:** **Destination Charges** (Critical).
- **Parameter:** `on_behalf_of: {{ORGANIZER_ACCOUNT_ID}}`.
  - _Effect:_ Stripe sees the Organizer as the seller. Chargebacks and ticket taxes are linked to the Organizer.

---

## 3. Financial Logic: The "Guaranteed Net" Strategy

### 3.1 The "12.5% + $0.30" Rule

To ensure the Platform is profitable even when users pay with expensive international cards (approx. 5.4% fee), we apply a **standard worst-case markup**.

- **Organizer Receives:** Exactly `Base Price`.
- **Platform Profit:** `Total Charged` - `Base Price` - `Stripe Fees`.

### 3.2 Dynamic Calculation (Server-Side)

The markup is **database-driven**, not hardcoded.

**The Variables (from Supabase):**

- `markup_percent`: **12.5** (Default)
- `markup_fixed_cents`: **30** (Default)

**The Formula:**

1. **Retrieve Markup:** Query `markup_percent` and `markup_fixed_cents` from DB.
2. **Calculate Total (Cents):**
  $$\text{Total} = \text{Base} + (\text{Base} \times \frac{\text{Markup Percent}}{100}) + \text{Fixed Fee}$$

  _Plain Text:_ `Total = Base + (Base * 0.125) + 30`

**Example Scenario ($100 Ticket):**

- **Base Ticket Price:** $100.00 (`10000` cents)
- **Markup:** 12.5% (`1250` cents) + $0.30 (`30` cents)
- **Customer Pays:** **$112.80** (`11280` cents)
- **Organizer Receives:** **$100.00** (`10000` cents) - _Guaranteed via Transfer Data_
- **Platform Gross Revenue:** $12.80
  - _Less Stripe Domestic Fee (~$3.60):_ **Net Profit ~$9.20**
  - _Less Stripe Int'l Fee (~$6.40):_ **Net Profit ~$6.40**

### 3.3 Implementation Details (Critical)

- **Fixed Transfer:** You MUST use `transfer_data[amount]` set to the `base_price_cents`. Do not rely on percentages for the split.
- **Rounding:** Use `Math.round()` on the markup calculation to ensure we don't lose fractional cents.
- **Validation:** The backend MUST re-calculate the total from the `base_price`. Never trust client-submitted totals.

### 3.4 Database Schema Requirements (Supabase)

To ensure auditability, the `orders` table must store:

- `base_price_cents` (Integer) - _What the Organizer gets_
- `markup_percent` (Decimal) - _e.g., 12.5_
- `markup_fixed_cents` (Integer) - _e.g., 30_
- `total_paid_cents` (Integer) - _What the User paid_
- `stripe_payment_intent_id` (Text) - _Unique; indexed for audit_
- `stripe_transfer_id` (Text, Nullable) - _Indexed for payout tracking_
- `stripe_fee_cents` (Integer, Nullable) - _Stripe fee charged_
- `organizer_account_id` (Text/UUID) - _Indexed for routing audits_
- `payment_status` (Enum) - _authorized | captured | canceled | failed_
- `authorized_at` (Timestamp)
- `captured_at` (Timestamp, Nullable)
- `canceled_at` (Timestamp, Nullable)
- **Indexes:** enforce uniqueness on `stripe_payment_intent_id` and add indexes on `stripe_transfer_id` and `organizer_account_id` to keep lookups fast; keep nullable fields nullable for safe migrations.

---

## 4. The RSVP "Auth & Capture" Workflow

**Objective:** Prevent financial loss from non-refundable Stripe fees when an Organizer rejects an RSVP.

### 4.1 The Flow

1. **User Requests RSVP:**
  - Backend creates a `PaymentIntent` with **`capture_method: 'manual'`**.
  - **Result:** Funds are "Authorized" (Frozen). Platform pays $0 fees.
2. **Organizer Action:**
  - **IF APPROVED:** Backend calls `payment_intent.capture()`. Fees are charged; money moves.
  - **IF REJECTED:** Backend calls `payment_intent.cancel()`. Authorization released. **Cost: $0.**
3. **Timeout Safety:**
  - **Cron Job:** Monitor RSVPs approaching 6 days. Notify Organizer or auto-cancel.

### 4.2 Authorization Expiry Monitoring (Cron Job)

- **Schedule:** Run every 6 hours (`0 */6 * * *`)
- **Features:**
  - Checks RSVPs in 3-7 day window (optimized for Visa card 5-day expiry).
  - Verifies `PaymentIntent` status before cancelling.
  - Uses `Idempotency-Key` on cancel operations.
  - **Validation:** Verify `metadata.rsvpId` matches the database record before acting.
  - **Concurrency:** Uses optimistic locking on `status` and `last_notified_at` to prevent race conditions.

---

## 5. Global Operations (Ecuador Payouts)

### 5.1 Logic

- **Source:** US Platform (USD).
- **Destination:** Ecuadorian Bank Account (USD).
- **Mechanism:** Stripe Cross-Border Payouts.

### 5.2 Fee Handling

- **Cost:** Approx 1% + $1.50 per payout (USD minimum $1.00).
- **Payer:** The Organizer.
- **Execution:** Deducted from the Organizer’s Stripe Balance **at the moment of withdrawal**.
- **Transparency:** UI must display "Estimated Payout Fee: ~$1.50 + 1%" on the dashboard.

---

## 6. Instructions for the AI Developer (MCP)

**Specific Instructions:**

1.  **Pricing:** Retrieve `markup_percent` (12.5) and `markup_fixed_cents` (30) from the DB.
2.  **Stripe Intent:**
    ```typescript
    const paymentIntent = await stripe.paymentIntents.create({
      amount: calculatedTotalCents, // Base + Markup
      currency: "usd",
      capture_method: "manual",
      transfer_data: {
        amount: basePriceCents, // EXACT Organizer Amount
        destination: organizerAccountId,
      },
      on_behalf_of: organizerAccountId,
    });
    ```
3.  **Webhooks:** Implement `payment_intent.amount_capturable_updated` (RSVP Ready), `payment_intent.succeeded` (Ticket Sold), and `payment_intent.canceled` (RSVP Rejected).

---

## 7. Security & Compliance Checklist

### Essential Security Controls

- [ ] **HTTPS:** Enforced on all endpoints.
- [ ] **Signature Verification:** Validate `stripe-signature` on webhooks.
- [ ] **Idempotency:** Use keys on all `PaymentIntent` creation and capture calls.

### Additional Measures

- [ ] **Metadata Validation:** Validate `metadata.rsvpId` matches the database ID before capture.
- [ ] **Rate Limiting:** Protect payment endpoints from card testing attacks.
- [ ] **Audit Logging:** Log all capture/cancel events with timestamps and User IDs.
- [ ] **Concurrency:** Use database locks (`SELECT ... FOR UPDATE`) during the RSVP approval process to prevent double-approvals.

---

## 8. PaymentIntent Metadata Schema

### 8.1 Metadata Schema

Updated to reflect the new pricing model.

**For RSVP Flow (Auth & Capture):**

```typescript
{
  type: "rsvp_request",
  rsvpId: string,
  eventId: string,
  ticketTierId: string,
  quantity: string,

  // Financial Audit Fields
  basePriceCents: string,      // e.g. "10000"
  markupPercent: string,       // e.g. "12.5"
  markupFixedCents: string,    // e.g. "30"

  userId: string,
  organizationId: string
}
```
