# Payment Failure Prevention & Monitoring Guide

> ⚠️ **Payment System Note**: This document primarily describes failure prevention for the legacy Datafast payment system. For Stripe failure handling, see `stripe-implementation/guides/WEBHOOK_TROUBLESHOOTING.md` and `stripe-implementation/guides/GHOST_PAYMENT_PREVENTION.md`.

> **Incident Reference:** Fabianna Farah (Nov 27, 2025) - Transaction `8ac9a4cd9a4900f7019a4900f7c3361c`  
> **Root Cause:** Datafast processed payment but callback never reached our system  
> **Impact:** Customer charged but no ticket issued

---

## Table of Contents

1. [Automatic Transaction Recovery (Critical)](#1-automatic-transaction-recovery-critical)
2. [Sentry Integration & Monitoring](#2-sentry-integration--monitoring)
3. [Implementation Checklist](#3-implementation-checklist)

---

## 1. Automatic Transaction Recovery (Critical)

### Status: ⚠️ Partially Implemented but Incomplete

### Current State

The `recover-stuck-transactions` endpoint relies on the SQL function `lock_stuck_transactions_for_recovery`. This function **explicitly filters for `status = 'processing'`** and ignores `pending` transactions.

```sql
-- Current behavior (INSUFFICIENT)
WHERE status = 'processing'
  AND verified_at < NOW() - INTERVAL '10 minutes'
```

**Problem:** Transactions like Fabianna's never reach `processing` status because the verification callback never executes. They remain stuck in `pending` forever.

### The Gap

| Scenario                                         | Current Status | Recovery Catches It?                 |
| ------------------------------------------------ | -------------- | ------------------------------------ |
| Payment verified, order creation failed          | `processing`   | ✅ Yes                               |
| Checkout created, user never paid                | `pending`      | ❌ No (correct - nothing to recover) |
| **Checkout created, user paid, callback failed** | `pending`      | ❌ **No (BUG!)**                     |

### The Fix

Update the recovery logic to:

1. **Poll Datafast API** for `pending` checkouts older than 15 minutes
2. **Query transaction status** using the checkout ID
3. **If payment succeeded** (`000.000.000`), promote to `processing` and continue recovery

### Implementation

#### Step 1: Create New SQL Function

```sql
-- Migration: add_pending_checkout_recovery.sql
CREATE OR REPLACE FUNCTION check_pending_checkouts_for_recovery(
  p_min_minutes INTEGER DEFAULT 15,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  datafast_checkout_id TEXT,
  merchant_transaction_id TEXT,
  hold_id UUID,
  user_id UUID,
  amount NUMERIC,
  checkout_created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dt.id,
    dt.datafast_checkout_id,
    dt.merchant_transaction_id,
    dt.hold_id,
    dt.user_id,
    dt.amount,
    dt.checkout_created_at
  FROM datafast_transactions dt
  WHERE dt.status = 'pending'
    AND dt.transaction_type = 'checkout_created'
    AND dt.datafast_checkout_id IS NOT NULL
    AND dt.datafast_transaction_id IS NULL  -- Never verified
    AND dt.checkout_created_at < NOW() - (p_min_minutes || ' minutes')::INTERVAL
    AND dt.recovery_in_progress = false
  ORDER BY dt.checkout_created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

#### Step 2: Create New API Endpoint

Create `/api/admin/recover-pending-checkouts/route.ts`:

```typescript
/**
 * Admin API: Recover Pending Checkouts
 *
 * Finds checkouts that were created but never verified (callback never reached us).
 * Queries Datafast API to check if payment was actually processed.
 * If payment succeeded, promotes transaction to "processing" for standard recovery.
 *
 * POST /api/admin/recover-pending-checkouts
 *
 * Should be run every 15-30 minutes via cron job.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { auth } from "@clerk/nextjs/server";

const DATAFAST_URL = process.env.DATAFAST_URL!;
const DATAFAST_ENTITY_ID = process.env.DATAFAST_ENTITY_ID!;
const DATAFAST_BEARER_TOKEN = process.env.DATAFAST_BEARER_TOKEN!;

// Success codes from Datafast
const SUCCESS_CODES = ["000.000.000"];

export async function POST(req: NextRequest) {
  try {
    // Verify admin access
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("clerk_id", userId)
      .single();

    if (user?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    // Parse parameters
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "true";
    const minMinutes = parseInt(url.searchParams.get("minMinutes") || "15", 10);

    console.log("=== START: Pending Checkout Recovery ===");
    console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
    console.log(`Min Minutes: ${minMinutes}`);

    // Find pending checkouts
    const { data: pendingCheckouts, error: queryError } =
      await supabaseAdmin.rpc("check_pending_checkouts_for_recovery", {
        p_min_minutes: minMinutes,
        p_limit: 50,
      });

    if (queryError) {
      console.error("Error querying pending checkouts:", queryError);
      return NextResponse.json(
        { error: "Database query failed" },
        { status: 500 }
      );
    }

    console.log(
      `Found ${pendingCheckouts?.length || 0} pending checkouts to verify`
    );

    if (!pendingCheckouts || pendingCheckouts.length === 0) {
      return NextResponse.json({
        found: 0,
        verified_paid: 0,
        verified_unpaid: 0,
        errors: 0,
        details: [],
        dryRun,
      });
    }

    const results = [];
    let verifiedPaidCount = 0;
    let verifiedUnpaidCount = 0;
    let errorCount = 0;

    for (const checkout of pendingCheckouts) {
      console.log(`\nChecking checkout: ${checkout.datafast_checkout_id}`);

      try {
        // Query Datafast API for transaction status
        const resourcePath = `/v1/checkouts/${checkout.datafast_checkout_id}/payment`;
        const verificationUrl = `${DATAFAST_URL}${resourcePath}?entityId=${DATAFAST_ENTITY_ID}`;

        const response = await fetch(verificationUrl, {
          method: "GET",
          headers: { Authorization: DATAFAST_BEARER_TOKEN },
        });

        if (!response.ok) {
          // 404 means no payment was made on this checkout
          if (response.status === 404) {
            console.log(`  → No payment found (checkout abandoned)`);
            verifiedUnpaidCount++;
            results.push({
              checkout_id: checkout.datafast_checkout_id,
              status: "no_payment",
              action: "none",
            });
            continue;
          }

          throw new Error(`Datafast API error: ${response.status}`);
        }

        const data = await response.json();
        const resultCode = data.result?.code;
        const isSuccess = SUCCESS_CODES.includes(resultCode);

        console.log(`  → Result code: ${resultCode}, Success: ${isSuccess}`);

        if (isSuccess) {
          verifiedPaidCount++;

          if (!dryRun) {
            // Update transaction to "processing" so standard recovery picks it up
            await supabaseAdmin
              .from("datafast_transactions")
              .update({
                datafast_transaction_id: data.id,
                status: "processing",
                transaction_type: "payment_verified",
                result_code: resultCode,
                result_description: data.result?.description,
                payment_brand: data.paymentBrand,
                card_bin: data.card?.bin,
                card_last4: data.card?.last4Digits,
                card_holder: data.card?.holder,
                auth_code: data.resultDetails?.AuthCode,
                reference_no: data.resultDetails?.ReferenceNo,
                verification_response_data: data,
                payment_attempted_at: data.timestamp,
                verified_at: new Date().toISOString(),
              })
              .eq("id", checkout.id);

            console.log(`  ✅ Promoted to processing for recovery`);
          }

          results.push({
            checkout_id: checkout.datafast_checkout_id,
            transaction_id: data.id,
            status: "payment_found",
            action: dryRun
              ? "would_promote_to_processing"
              : "promoted_to_processing",
            amount: checkout.amount,
          });
        } else {
          // Payment attempted but failed
          verifiedUnpaidCount++;
          results.push({
            checkout_id: checkout.datafast_checkout_id,
            status: "payment_failed",
            result_code: resultCode,
            action: "none",
          });
        }
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Error:`, error);
        results.push({
          checkout_id: checkout.datafast_checkout_id,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    console.log("\n=== END: Pending Checkout Recovery ===");
    console.log(`Found: ${pendingCheckouts.length}`);
    console.log(`Verified Paid: ${verifiedPaidCount}`);
    console.log(`Verified Unpaid/Failed: ${verifiedUnpaidCount}`);
    console.log(`Errors: ${errorCount}`);

    return NextResponse.json({
      found: pendingCheckouts.length,
      verified_paid: verifiedPaidCount,
      verified_unpaid: verifiedUnpaidCount,
      errors: errorCount,
      details: results,
      dryRun,
    });
  } catch (error) {
    console.error("Fatal error:", error);
    return NextResponse.json(
      {
        error: "Recovery process failed",
        details: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
```

#### Step 3: Set Up Cron Job

Add to your cron/scheduler (e.g., Vercel Cron, Railway, or external service):

```bash
# Run every 15 minutes
*/15 * * * * curl -X POST https://your-domain.com/api/admin/recover-pending-checkouts \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Recovery Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSACTION STATES                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐     ┌────────────┐     ┌───────────┐             │
│  │ PENDING  │ ──▶ │ PROCESSING │ ──▶ │ PROCESSED │             │
│  └──────────┘     └────────────┘     └───────────┘             │
│       │                 │                                       │
│       │                 │                                       │
│       ▼                 ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RECOVERY ENDPOINTS                          │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  recover-pending-checkouts     recover-stuck-transactions│   │
│  │  (NEW - catches Fabianna's     (EXISTING - catches       │   │
│  │   case)                         order creation failures) │   │
│  │                                                          │   │
│  │  Queries Datafast API ──────▶ Promotes to PROCESSING     │   │
│  │  for actual payment status    if payment confirmed       │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Sentry Integration & Monitoring

### Why Sentry?

Sentry helps you catch errors **as they happen**, providing:

- Stack traces with source maps
- User context (who was affected)
- Breadcrumbs (what happened before the error)
- Alerting (Slack, email, PagerDuty)

### Critical Scenarios to Monitor

---

### 🚨 Scenario 1: Ghost Payment (Callback Failure)

**What:** User pays successfully on Datafast, returns to your site, but the verify-payment API call fails or times out.

**Why Critical:** This is exactly what happened to Fabianna. Money is gone, no ticket issued.

**Location:** `app/purchase/page.tsx` inside `handlePaymentCallback`

```typescript
// In handlePaymentCallback function
import * as Sentry from "@sentry/nextjs";

const handlePaymentCallback = async () => {
  console.log("=== Payment Callback Handler ===");

  // Add Sentry breadcrumb for debugging
  Sentry.addBreadcrumb({
    category: "payment",
    message: "Payment callback started",
    level: "info",
    data: { resourcePath, checkoutId: extractedCheckoutId, mode },
  });

  try {
    // ... existing verification logic ...

    const verifyResponse = await fetch("/api/datafast/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourcePath, checkoutId: extractedCheckoutId }),
    });

    if (!verifyResponse.ok || !verifyData.isSuccess) {
      // 🚨 CRITICAL: Payment might have succeeded but verification failed
      Sentry.captureMessage("Payment verification failed after callback", {
        level: "error",
        tags: {
          flow: "payment_callback",
          transaction_status: "unverified_but_callback_received",
          result_code: verifyData.result?.code,
        },
        extra: {
          checkoutId: extractedCheckoutId,
          resourcePath,
          verifyData,
          mode,
        },
      });
    }

    // ... rest of logic ...
  } catch (error) {
    // 🚨 Network failure or unhandled error during callback
    Sentry.captureException(error, {
      tags: {
        flow: "payment_callback",
        transaction_status: "callback_exception",
      },
      extra: {
        checkoutId: extractedCheckoutId,
        resourcePath,
        mode,
      },
    });

    throw error;
  }
};
```

**Alert Rule:**

- Condition: `transaction_status:unverified_but_callback_received` OR `transaction_status:callback_exception`
- Priority: **P1 - Critical** (customer likely angry right now)
- Action: Immediate Slack notification to on-call

---

### ⚠️ Scenario 2: Checkout Creation Failures

**What:** User clicks "Proceed to Payment", but Datafast rejects the initial request.

**Why Critical:** If this spikes, payment integration is broken for everyone.

**Location:** `app/api/datafast/create-checkout/route.ts`

```typescript
// After receiving Datafast response
const data = await response.json();
const resultCode = data.result?.code;

if (resultCode !== "000.200.100") {
  // Checkout creation failed
  Sentry.captureMessage("Datafast checkout creation failed", {
    level: "warning",
    tags: {
      flow: "checkout_creation",
      checkout_creation_failed: "true",
      result_code: resultCode,
    },
    extra: {
      resultDescription: data.result?.description,
      amount,
      currency,
      userId,
    },
  });
}
```

**Alert Rule:**

- Condition: `checkout_creation_failed:true` with count > 5 in 10 minutes
- Priority: **P2 - High** (potential integration issue)
- Action: Slack notification + investigate

---

### 📉 Scenario 3: High-Volume Payment Rejections

**What:** Users' payments keep getting rejected by banks.

**Why Monitor:** Spikes in "Do Not Honor" (`100.100.100`) often mean your Merchant ID is flagged or risk settings are too aggressive.

**Location:** `app/api/datafast/verify-payment/route.ts`

```typescript
// After verification, if not successful
if (!isSuccess) {
  const declineCategory = categorizeDeclineCode(resultCode);

  Sentry.captureMessage(`Payment declined: ${declineCategory}`, {
    level: "warning",
    tags: {
      flow: "payment_verification",
      decline_category: declineCategory,
      result_code: resultCode,
    },
    extra: {
      description: data.result?.description,
      amount: data.amount,
      cardBin: data.card?.bin,
      cardType: data.resultDetails?.CardType,
    },
    fingerprint: ["payment_decline", declineCategory], // Group similar declines
  });
}

// Helper function
function categorizeDeclineCode(code: string): string {
  const categories: Record<string, string> = {
    "100.100.100": "do_not_honor",
    "100.100.101": "card_expired",
    "100.100.303": "insufficient_funds",
    "100.100.402": "declined_by_bank",
    "100.400.000": "3ds_failed",
    "800.100.152": "transaction_declined",
  };
  return categories[code] || "other_decline";
}
```

**Alert Rule:**

- Condition: `decline_category:do_not_honor` with count > 10 in 1 hour
- Priority: **P2 - High** (potential merchant account issue)

---

### ⏱️ Scenario 4: Verification Latency

**What:** The verify-payment API call takes >10 seconds.

**Why Monitor:** Slow verification leads to users closing the tab, causing "Ghost Payments".

**Tool:** Sentry Performance Monitoring

```typescript
// In verify-payment route
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  // Start a transaction for performance monitoring
  const transaction = Sentry.startTransaction({
    op: "http.server",
    name: "POST /api/datafast/verify-payment",
  });

  try {
    const span = transaction.startChild({
      op: "http.client",
      description: "Datafast API verification",
    });

    const response = await fetch(verificationUrl, {
      method: "GET",
      headers: { Authorization: DATAFAST_BEARER_TOKEN },
    });

    span.finish();

    // Check if slow
    const duration = span.endTimestamp! - span.startTimestamp!;
    if (duration > 10) {
      Sentry.captureMessage("Slow Datafast verification", {
        level: "warning",
        tags: {
          flow: "payment_verification",
          slow_verification: "true",
        },
        extra: {
          duration_seconds: duration,
          checkoutId,
        },
      });
    }

    // ... rest of logic ...
  } finally {
    transaction.finish();
  }
}
```

**Alert Rule:**

- Condition: `slow_verification:true` with count > 3 in 15 minutes
- Priority: **P3 - Medium** (investigate Datafast API health)

---

### Sentry Setup Checklist

```bash
# Install Sentry
pnpm add @sentry/nextjs

# Run setup wizard
npx @sentry/wizard@latest -i nextjs
```

Configure `sentry.client.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,

  // Capture user info for debugging
  beforeSend(event) {
    // Scrub sensitive data
    if (event.extra?.cardNumber) {
      event.extra.cardNumber = "[REDACTED]";
    }
    return event;
  },
});
```

---

## 3. Implementation Checklist

### Phase 1: Critical (Do This Week)

- [ ] Create `check_pending_checkouts_for_recovery` SQL function
- [ ] Create `/api/admin/recover-pending-checkouts` endpoint
- [ ] Set up cron job to run recovery every 15 minutes
- [ ] Test with Fabianna's transaction (manual recovery first)

### Phase 2: Monitoring (Next Week)

- [ ] Install and configure Sentry
- [ ] Add Sentry tracking to `handlePaymentCallback`
- [ ] Add Sentry tracking to `create-checkout` route
- [ ] Add Sentry tracking to `verify-payment` route
- [ ] Configure alert rules in Sentry dashboard

### Phase 3: Optimization (Following Week)

- [ ] Add Sentry Performance monitoring
- [ ] Create Slack integration for critical alerts
- [ ] Build admin dashboard widget showing pending recovery stats
- [ ] Document runbooks for each alert type

---

## Quick Reference: Error Codes

| Code          | Meaning              | Action                       |
| ------------- | -------------------- | ---------------------------- |
| `000.000.000` | Success (Production) | ✅ Process order             |
| `000.200.100` | Checkout created     | ✅ Show payment form         |
| `100.100.100` | Do Not Honor         | ⚠️ Monitor for spikes        |
| `100.100.303` | Insufficient Funds   | ℹ️ User issue                |
| `100.400.000` | 3DS Failed           | ⚠️ Retry with different card |
| `800.100.152` | Transaction Declined | ⚠️ Check risk settings       |

---

## Related Documentation

- [Datafast Integration Guide](./datafast-info/guia_implementacion.md)
- [Error Handler Implementation](../app/lib/datafast-error-handler.ts)
- [Recovery Endpoint](../app/api/admin/recover-stuck-transactions/route.ts)
