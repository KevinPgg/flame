# Stripe Connect Migration Complete

This document summarizes the migration from Datafast to Stripe Connect for payment processing.

## Migration Overview

| Aspect               | Before (Datafast)                      | After (Stripe Connect)       |
| -------------------- | -------------------------------------- | ---------------------------- |
| **Payment Provider** | Datafast (Ecuador)                     | Stripe Connect               |
| **Checkout Fields**  | 10+ mandatory fields                   | Just PaymentElement          |
| **Billing Form**     | Required (name, address, cedula, DOB)  | Not required                 |
| **Fee Model**        | Complex IVA calculation (7% + 15% tax) | Simple markup: 12.5% + $0.30 |
| **RSVP Flow**        | Manual tracking                        | Auth & Capture               |
| **Payouts**          | Bank transfer                          | Stripe Connect Express       |

## What Was Removed

### 🗑️ Checkout Form Fields (No Longer Required)

The following fields were **required by Datafast** but are **not needed for Stripe**:

| Field            | Datafast             | Stripe                       |
| ---------------- | -------------------- | ---------------------------- |
| `firstName`      | ✅ Required          | ❌ Optional (auto from user) |
| `lastName`       | ✅ Required          | ❌ Optional (auto from user) |
| `email`          | ✅ Required          | ❌ Optional (auto from user) |
| `phone`          | ✅ Required          | ❌ Not needed                |
| `billingAddress` | ✅ Required          | ❌ Not needed                |
| `billingCity`    | ✅ Required          | ❌ Not needed                |
| `billingCountry` | ✅ Required          | ❌ Not needed                |
| `documentType`   | ✅ Required (IDCARD) | ❌ Not needed                |
| `documentId`     | ✅ Required (Cédula) | ❌ Not needed                |
| `dateOfBirth`    | ✅ Required          | ❌ Not needed                |

### 🗑️ Deleted Files

#### Documentation (Outdated)

- `MIGRATION_INFO/DATAFAST_PHASE2_TESTING.md` - Datafast testing instructions
- `datafast-info/guia_implementacion.md` - Datafast implementation guide

#### Error Handling (No Longer Relevant)

- `datafast_errors/DATAFAST_CONTACT_TEMPLATES.md`
- `datafast_errors/DATAFAST_ERROR_ANALYSIS.md`
- `datafast_errors/DATAFAST_STUCK_TRANSACTION_ANALYSIS.md`
- `datafast_errors/PAYMENT_BUG_FIX_SUMMARY.md`
- `datafast_errors/recover-stuck-transaction.ts`

#### Validation (No Longer Required)

- `app/lib/validation/cedula.ts` - Cédula validation for checkout

### 🗑️ Code Changes

#### Simplified Interfaces

**`app/lib/hooks/useUserProfile.ts`**

```typescript
// Before (Datafast)
export interface UserProfile {
  id: string;
  email: string;
  clerk_id: string;
  first_name: string | null;
  last_name: string | null;
  document_id: string | null; // ❌ Removed
  phone: string | null; // ❌ Removed
  billing_address: string | null; // ❌ Removed
  billing_city: string | null; // ❌ Removed
  billing_country: string | null; // ❌ Removed
  document_type: string | null; // ❌ Removed
}

// After (Stripe)
export interface UserProfile {
  id: string;
  email: string;
  clerk_id: string;
  first_name: string | null;
  last_name: string | null;
}
```

**`app/lib/utils/purchase-data.ts`**

```typescript
// Before (Datafast)
export interface Purchase {
  // ... other fields
  documentId: string | null; // ❌ Removed
  dateOfBirth: string | null; // ❌ Removed
}

// After (Stripe)
export interface Purchase {
  // ... other fields (no billing info)
}
```

#### Simplified API Responses

**`app/api/holds/validate/route.ts`**

```typescript
// Before: returned billing info for Datafast form pre-fill
user: {
  email,
    first_name,
    last_name,
    phone,
    billing_address,
    billing_city,
    billing_country,
    document_type,
    document_id;
}

// After: just essential user info
user: {
  email, first_name, last_name;
}
```

**`app/api/purchase/validate-token/route.ts`**

```typescript
// Before: returned billing info
// After: simplified user object
```

**`app/api/user/profile/route.ts`**

```typescript
// Before: fetched billing fields
// After: only fetches essential fields
```

## What's Still Available (Optional)

The following remain in the database for **backward compatibility** and **optional organizer features**:

### Database Columns (Retained)

- `users.phone`
- `users.billing_address`
- `users.billing_city`
- `users.billing_country`
- `users.document_type`
- `users.document_id`
- `users.date_of_birth`

### Deprecation & Sunset Plan

| Component                 | Status        | Removal Plan                                                                                                                                                             |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users` billing columns   | ⚠️ Deprecated | Retained indefinitely for historical data. No new data will be written to these columns by the purchase flow.                                                            |
| `cedula` features         | ⚠️ Optional   | Validation logic removed. Organizers may still request this data via custom registration questions if needed, but it is no longer enforced by the platform for payments. |
| `/api/user/update-cedula` | ⚠️ Deprecated | Endpoint remains active to support legacy frontend components. No specific removal timeline set; will be removed when legacy components are fully migrated (TBD).        |

### Optional Features

- **Cedula collection via registration forms** - Organizers can add cédula field to event registration
- **Cedula display in RSVP management** - If collected, organizers can view it
- **Cedula update API** - `/api/user/update-cedula` still works for optional updates

## New Stripe Checkout Flow

### For Users

```text
1. Select tickets → 2. Click "Buy" → 3. Stripe PaymentElement → 4. Done!
```

No billing form, no cédula, no address - just payment details handled by Stripe.

**3DS Redirect Handling (RSVP):**

- Before confirming Stripe payment, the client calls `POST /api/rsvp/pending` to store RSVP details server-side.
- The browser only stores `{ pendingRsvpId, paymentIntentId }` in `sessionStorage`.
- After redirect, `app/rsvp/success/page.tsx` submits the RSVP using `pending_rsvp_id` + `paymentIntentId`.

### For Organizers

```text
1. Connect Stripe account (one-time)
2. Receive payments directly to Stripe account
3. Platform fee automatically deducted
4. Payouts via Stripe Express dashboard
```

## Technical Details

### Stripe Connect Configuration

- **Account Type**: Express
- **Fee Model**: Fee-on-Top (platform fee added to base price)
- **Default Fee**: 12.5% + $0.30 (configurable per organization)
- **Zero-Fee Support**: Explicit 0% fees are supported and correctly handled (preventing fallback to default).
- **Capture Method**:
  - Direct purchases: Immediate capture
  - RSVP: Manual capture (Auth & Capture)

### Error Handling & Recovery

#### Order Error Tracking

When payment succeeds but order/ticket creation fails, orders are marked for manual review instead of being deleted:

| Order Status             | Meaning                                          |
| ------------------------ | ------------------------------------------------ |
| `pending`                | Payment not yet completed                        |
| `paid`                   | Payment successful, tickets issued               |
| `failed`                 | Payment failed                                   |
| `requires_manual_review` | **Payment succeeded but ticket creation failed** |
| `refunded`               | Order was refunded                               |

**`order_errors` Table:**

- Tracks critical failures for ops reconciliation
- Fields: `order_id`, `error_type`, `error_message`, `error_details` (JSONB)
- Severity levels: `low`, `medium`, `high`, `critical`
- Resolution tracking: `resolved`, `resolved_at`, `resolved_by`, `resolution_notes`

#### Precise Inventory Compensation

In the event of partial failures during a multi-item order (e.g., ticket creation fails for one item):

- The system tracks exactly which inventory increments succeeded.
- It rolls back _only_ the successful increments in reverse order.
- This prevents negative inventory and ensures data consistency.

#### Payout Race Protection

**Critical Update (January 2026):** The payout system uses multi-layered protection instead of relying solely on advisory locks due to connection pooling limitations:

**Layer 1 - Recent Payout Check:**

- Queries Stripe for payouts in the last 5 minutes
- Returns 409 Conflict if any payout is still `pending` or `in_transit`
- Provides immediate feedback before Stripe API calls

**Layer 2 - Organization-Scoped Idempotency:**

- Idempotency key format: `payout-${accountId}-${timeWindowHour}`
- **CRITICAL:** Does NOT include `user.id` (prevents race between different admins)
- Time window (1 hour) allows intentional retries while preventing duplicates
- Stripe enforces idempotency at API level

**Layer 3 - Stripe Balance Validation:**

- Validates minimum payout threshold ($1.00 for USD) before API call
- Stripe rejects payouts exceeding available balance
- Final protection against concurrent payout attempts

**Why Not Advisory Locks:**

- Connection pooling may assign different connections to concurrent requests
- Transaction-level locks release before Stripe API calls complete
- Session-level locks unreliable with pooled connections

#### RSVP Approval Flow (Race Condition Prevention)

The approval endpoint uses a specific order of operations to prevent race conditions:

```text
1. Update RSVP status to "approved" FIRST (atomic DB update)
2. Then capture payment (which triggers webhook)
3. Webhook sees "approved" status → creates order/tickets ✅
```

If payment capture fails:

1. Authorization is **cancelled** to immediately release customer funds
2. Status is rolled back to "pending"
3. Error details are returned to the organizer

**PaymentIntent Validation**: Before capture, the system validates that the `PaymentIntent.amount` >= expected base price. This prevents price manipulation attacks where prices change between RSVP creation and approval.

**Simplified Email Flow**: The RSVP approval email is now purely informational and no longer contains a purchase link, as the payment is captured automatically upon approval.

#### Webhook Failure Recovery

When webhook processing encounters issues:

**Delayed or Lost Webhooks:**

- Stripe automatically retries webhooks for up to 3 days with exponential backoff
- All webhook handlers are idempotent (safe to replay multiple times)
- Order creation checks for existing orders using `stripe_payment_intent_id` before creating records

**Partial Failure Recovery:**

- If order creation partially fails mid-batch, the order is marked `requires_manual_review`
- Inventory is compensated immediately to maintain consistency
- `order_errors` table logs all details for manual reconciliation

**Manual Webhook Replay:**

- Access Stripe Dashboard → Events → Select event → Click "Resend webhook"
- Alternatively, use `stripe events resend <event_id>` via Stripe CLI
- System's idempotency guards prevent duplicate orders during manual replay

**Database Health Issues:**

- Non-PGRST116 errors during idempotency checks trigger 500 responses
- **CRITICAL:** RSVP lookup errors (non-PGRST116) now throw to trigger 500 response
  - Previously these were logged but not thrown, causing silent payment failures
  - Customers would be charged without receiving tickets
  - Fixed (January 2026): Now throws error to enable Stripe automatic retry
- Stripe automatically retries on 5xx responses with exponential backoff
- This ensures transient DB issues don't cause lost payments

#### QR Code Format

Tickets generated via Stripe webhook include all fields required by the scanner:

```json
{
  "orderId": "uuid",
  "eventId": "uuid",
  "userId": "uuid",
  "tierName": "VIP Ticket",
  "eventName": "Event Name",
  "ticketNumber": 1,
  "qrToken": "uuid",
  "timestamp": "2026-01-15T..."
}
```

The `ticketNumber` field is critical - the scanner uses it to identify specific tickets within an order.

### Security

#### Role-Based Access Control (RBAC)

- **Organization Balance**: Access to the `/api/organizer/payouts/balance` endpoint is restricted to users with `admin` or `owner` roles within the organization.

### Transparent Pricing

The checkout flow now shows users exactly what they'll be charged:

```text
┌─────────────────────────┐
│ Request Summary         │
├─────────────────────────┤
│ Subtotal      $100.00   │
│ Service Fee    $12.80   │
├─────────────────────────┤
│ Total         $112.80   │
└─────────────────────────┘
```

**Pricing Model (as of Jan 14, 2026):**

- **Base Price:** What organizer receives (e.g., $100.00)
- **Platform Markup:** 12.5% + $0.30 (e.g., $12.80)
- **Customer Pays:** Base + Markup (e.g., $112.80)

The `ticket_tiers.price_cents` field stores the **base price** (organizer net revenue). The markup is calculated dynamically from `events.markup_percent` and `events.markup_fixed_cents` at checkout time.

This ensures the displayed price matches what Stripe charges, preventing trust issues.

### Input Validation & Error Handling

**RSVP Flow Validation** (`create-payment-intent`):

- `eventId` - required, must be string
- `ticketTierId` - required, must be string
- `quantity` - required, must be positive integer

**Stripe Error Differentiation**:

- Stripe API errors return 400 with specific error message
- Server errors return 500 with generic message
- Full error context always logged server-side

**Webhook Metadata Safety**:

- `paymentIntent.metadata` accessed with fallback `|| {}`
- Prevents crashes if PaymentIntent created from unexpected flow

### Environment Variables

```env
# Required for Stripe
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Required for URL generation (client & server)
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

**Validation & Setup:**

- See `.env.example` for template with all required variables
- Missing `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` will cause server startup errors
- Missing `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` will cause client-side payment element failures
- `NEXT_PUBLIC_APP_URL` is the canonical base URL variable used throughout the application (legacy `NEXT_PUBLIC_SITE_URL` is supported as fallback)
- Use different keys for dev/staging/prod environments
- Test mode keys (`sk_test_`, `pk_test_`) should be used for development
- Webhook secrets are environment-specific and must match the webhook endpoint URL

### Key Components

| Component                 | Purpose                    |
| ------------------------- | -------------------------- |
| `StripePurchaseFlow.tsx`  | Main purchase page         |
| `StripePaymentForm.tsx`   | Reusable payment form      |
| `StripeConnectStatus.tsx` | Organizer dashboard status |
| `RsvpPaymentModal.tsx`    | RSVP payment authorization |

## Migration Checklist

> **Note:** This checklist reflects development and implementation status. For deployment-specific verification, refer to the testing checklists in `STRIPE_CONNECT_FRONTEND_IMPLEMENTATION.md`.

### ✅ Completed

- [x] Backend APIs for Stripe Connect
- [x] Frontend payment components
- [x] Fee-on-top calculations (including 0% support)
- [x] Auth & Capture for RSVPs
- [x] Webhook handling
- [x] Connect onboarding flow
- [x] Remove Datafast billing requirements
- [x] Update documentation
- [x] Order error tracking (`order_errors` table)
- [x] Payout race condition protection (multi-layered: recent-payout check, org-scoped idempotency, Stripe balance validation - replaced advisory locks)
- [x] `requires_manual_review` order status
- [x] Transparent fee display (subtotal + service fee = total)
- [x] RSVP approval race condition fix (status update before capture)
- [x] PaymentIntent idempotency guards
- [x] Ticket tier event validation (security fix)
- [x] Stage-tier relationship validation (security fix)
- [x] QR code format compatibility (all scanner-required fields)
- [x] Hold not found error tracking (ghost orders for reconciliation)
- [x] PaymentIntent amount validation (price manipulation prevention)
- [x] Authorization cancellation on rollback (immediate fund release)
- [x] Input validation for RSVP flow parameters
- [x] Stripe error differentiation (better client error handling)
- [x] Metadata optional chaining (defensive webhook handling)
- [x] Detailed error messages for organizers
- [x] Hold metadata includes userId, ticketTierId, quantity (ghost order data)
- [x] Reject endpoint sets paymentRequiresFollowUp on refund failure
- [x] RsvpPaymentModal clears stale state on close
- [x] RBAC for organization balance endpoint (admin/owner only)
- [x] Precise inventory compensation for partial order failures
- [x] Async payment method support ("processing" status)
- [x] Automated refunds for ghost orders (payment captured without hold)
- [x] Robust webhook inventory rollback (try-catch protection)
- [x] Orphaned PaymentIntent prevention (linking new PIs to RSVPs)
- [x] Dynamic currency support in purchase flow
- [x] Conditional return URLs for purchase vs. RSVP flows
- [x] Fallback fee logic for Hold payments (consistency with RSVPs)
- [x] Explicit cleanup for failed payments (Hold deletion, RSVP status update)
- [x] Prevent orphaned PaymentIntents in RsvpPaymentModal (state persistence)
- [x] Free RSVP ticket generation (direct order creation on approval)
- [x] 3D Secure redirect handling (success page and state persistence)
- [x] Stale payment intent prevention (modal price change detection)
- [x] PaymentIntent ID format validation (regex check at API boundary)
- [x] Metadata validation before capture (rsvpId matching)
- [x] Smart rollback logic (re-verify status after capture error)
- [x] Processing status handling (removed from cancellable list)
- [x] Post-cancel verification (log true final status)
- [x] Type safety in webhooks (proper interfaces replace any types)
- [x] DRY fee calculation (shared getFeePercent helper)
- [x] Null-safe ghost order handling (explicit checks before refund)
- [x] Webhook RSVP lookup error handling (throws to trigger Stripe retry)
- [x] Payout race condition fix (multi-layered protection, org-scoped idempotency)
- [x] PaymentIntent metadata RSVP ID update (fixes Auth & Capture flow validation)
- [x] Smart metadata validation with backward compatibility (handles legacy RSVPs)

### 🔄 Deprecated (Keep for Now)

- [ ] `app/api/datafast/*` routes - Can be removed after full migration
- [ ] Datafast-specific database columns - Keep for historical data

### Verification Checklist for Reviewers

- [ ] All API routes under `app/api/stripe/connect/` exist and match described behavior
- [ ] ~~Database migration `add_advisory_lock_rpc` exists and RPC function is callable~~ **REPLACED** (January 2026): Advisory locks were replaced by multi-layered protection (not advisory locks). Verify `app/api/organizer/payouts/create/route.ts` implements: (1) recent payout check, (2) organization-scoped idempotency keys, (3) Stripe balance validation. See lines 229-252 for implementation details.
- [ ] Components `StripePurchaseFlow`, `StripePaymentForm`, and `RsvpPaymentModal` exist with documented features
- [ ] Error handling in webhook matches `order_errors` table design
- [ ] RSVP approval flow (`app/api/organizer/rsvps/[id]/approve/route.ts`) follows "status update before capture" pattern
- [ ] PaymentIntent validation for amount >= base price is implemented
- [ ] Cron job for authorization expiry monitoring is implemented (`app/api/cron/monitor-payment-authorizations/route.ts`) and configured in `vercel.json`

### Database Migrations Added

- `add_order_errors_table` - Error tracking for failed orders
- ~~`add_advisory_lock_rpc`~~ - Deprecated (January 2026): Advisory locks replaced with multi-layered protection (recent payout check + organization-scoped idempotency + Stripe balance validation)

## Benefits of Stripe Migration

1. **Simpler Checkout**: No more 10-field billing form
2. **Global Payments**: Accept cards worldwide
3. **Better UX**: Stripe's optimized PaymentElement
4. **Direct Payouts**: Organizers get paid directly via Stripe
5. **Auth & Capture**: Better RSVP flow with payment guarantees
6. **3D Secure**: Built-in fraud protection
7. **Disputes**: Stripe handles chargebacks

## Recent Critical Fixes (January 2026)

### Webhook RSVP Lookup Error Handling

**Problem:** Database errors during RSVP lookup were logged but not thrown, causing Stripe to receive 200 OK. Customers would be charged without receiving tickets.

**Fix:** Non-PGRST116 errors now throw to return 500, triggering Stripe's automatic retry mechanism.

**Location:** `app/api/webhooks/stripe/route.ts:350-367`

### Payout Race Condition Protection

**Problem:** Advisory locks were ineffective due to connection pooling. User-scoped idempotency keys allowed different admins to create concurrent payouts.

**Fix:** Multi-layered protection:

1. Application-level check for recent pending payouts (5-minute window)
2. Organization-scoped idempotency keys (removed user.id from key)
3. Stripe balance validation as final safeguard

**Location:** `app/api/organizer/payouts/create/route.ts:74-131`

### PaymentIntent Metadata RSVP ID Fix

**Problem:** The approval route validated `paymentIntent.metadata.rsvpId` but this was always undefined. PaymentIntents were created BEFORE RSVPs existed, so metadata.rsvpId was never set. This broke all paid RSVP approvals with "Payment authorization does not match this RSVP".

**Fix:** Two-part solution:

1. **Update Metadata After RSVP Creation:** After RSVP is successfully created, call `stripe.paymentIntents.update()` to add the RSVP ID to metadata
2. **Smart Validation:** If metadata.rsvpId exists but doesn't match, reject (security). If undefined, allow (backward compatibility)

**Locations:**

- `app/api/rsvp/route.ts:720-746` (metadata update)
- `app/api/organizer/rsvps/[id]/approve/route.ts:249-332` (smart validation)

### Additional Security Hardening

- **PaymentIntent Format Validation:** Regex check `/^pi_[a-zA-Z0-9]+$/` at API boundary
- **Metadata Validation:** Verify `paymentIntent.metadata.rsvpId` matches before capture (with backward compatibility)
- **Smart Rollback:** Re-verify PaymentIntent status after capture errors to prevent false rollbacks
- **Processing Status Handling:** Removed from cancellable statuses to avoid race conditions
- **Type Safety:** Replaced `any` types with explicit interfaces in webhooks
- **Null Safety:** Explicit checks before ghost order refund operations

See `stripe-implementation/stripe_goals.md` Section 9 for detailed implementation notes.

---

## 🎯 Recent Updates

### Checkout UI Improvements (January 15, 2026)

**Design System Alignment:**

- Fixed all `border-radius` values to `0` (matching app-wide design system)
- Only circular icons use `border-radius: 50%`
- Updated Stripe Elements appearance configuration to match brand colors
- Enhanced focus states and hover effects

**Stripe Elements Styling:**

- Primary color: `#ff4c24` (exact brand match)
- Border colors: `#e3e1de` (neutral-300)
- Text colors: `#131313`, `#818180`, `#cbc8c5` (brand palette)
- No rounded corners on inputs, tabs, or containers

**Cancel Purchase Feature:**

- Added "Cancel Purchase" button for hold-based checkouts
- Located within payment section, below "Complete Purchase" button
- Separated by subtle border-top line
- Releases tickets back to inventory when cancelled
- Redirects to event page after cancellation

**Files Modified:**

- `app/components/StripePurchaseFlow.tsx` - Appearance config + cancel button
- `app/styles/components/stripe-payment.css` - All border-radius fixes
- `stripe-implementation/guides/STRIPE_CHECKOUT_STYLING.md` - New styling guide

### Pricing Model Migration (January 14, 2026)

**What Changed:**

- Migrated `ticket_tiers.price_cents` and `ticket_stages.price_cents` from storing **final customer prices** to storing **base organizer prices**
- Updated frontend components to work directly with base prices (removed `extractBasePrice()` calls)
- Ensured full audit trail: `orders` and `rsvps` tables store `base_price_cents`, `markup_percent`, `markup_fixed_cents`, and `total_paid_cents`

**Why:**

- Aligns with Stripe Connect "Guaranteed Net" model where organizers receive exactly the base price
- Prevents double-charging of fees (was: final price + markup, now: base price + markup)
- Enables per-event markup customization via `events.markup_percent` (default 12.5%) and `events.markup_fixed_cents` (default $0.30)

**Example:**

- **Before:** `price_cents = 10805` ($108.05 from old 7% + IVA model) → Backend added 12.5% on top = $121.86 ❌
- **After:** `price_cents = 10000` ($100.00 base) → Backend adds 12.5% + $0.30 = $112.80 ✓

**Documentation:** See `/pricing/PRICING_MIGRATION_COMPLETE.md` for full migration details and verification results.

### PR Fixes & Cleanup (January 16, 2026)

**Security & Stability:**

- **RSVP Error Leakage:** `app/api/rsvp/details/route.ts` now returns generic error messages to clients while logging details server-side.
- **RSVP Redirect Params:** `app/rsvp/success/page.tsx` now correctly handles both `pi` and `payment_intent` query parameters for robustness.
- **Script Safety:** `scripts/backfill-stripe-customers.ts` updated with cross-platform entry point check, error handling for Supabase queries, and improved logging (created vs existing).

**Styling:**

- **RSVP Modal:** `app/styles/components/rsvp-payment-modal.css` updated to use `border-radius: 0` for consistency with design system.

**Dependencies:**

- Updated Stripe packages to specific versions (`@stripe/react-stripe-js@^3.1.1`, `@stripe/stripe-js@^5.4.0`) per requirements.

---

## Support

- **Stripe Documentation**: <https://stripe.com/docs>
- **Stripe Connect**: <https://stripe.com/docs/connect>
- **Payment Intents**: <https://stripe.com/docs/payments/payment-intents>
- **Connect Status API**: `app/api/stripe/connect/status/route.ts`
- **Testing Guide**: `__tests__/PURCHASE_FLOW_TESTS.md`
