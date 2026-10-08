# Webhook Troubleshooting Guide

**Date:** January 15, 2026

If you are experiencing issues where orders are not being created after a successful Stripe payment, follow this guide to troubleshoot the issue.

## Scenario A: Webhook is NOT firing

If you do not see any webhook events in your Stripe Dashboard (or if they are failing with connection errors):

### 1. Local Development
Webhooks do not reach `localhost` automatically. You must use the Stripe CLI to forward events.

**Step 1:** Start the Stripe CLI listener:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Step 2:** Copy the **Webhook Signing Secret** (`whsec_...`) from the CLI output.

**Step 3:** Update your `.env.local` file:
```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Step 4:** Restart your Next.js development server to load the new environment variable.

### 2. Production / Deployed Environment
Ensure you have configured the webhook endpoint in the Stripe Dashboard.

**Step 1:** Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks).
**Step 2:** Add Endpoint: `https://your-domain.com/api/webhooks/stripe`
**Step 3:** Select events to listen for:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `payment_intent.amount_capturable_updated`
**Step 4:** Copy the Signing Secret and add it to your production environment variables as `STRIPE_WEBHOOK_SECRET`.

---

## Scenario B: Webhook returns 404 Not Found

If you see `404` errors in your Stripe CLI logs like this:
```
2026-01-19 15:47:12  <--  [404] POST http://localhost:3000/webhook ...
```

**Cause:** You are forwarding webhooks to the wrong local URL. The default Stripe example uses `/webhook`, but our application uses `/api/webhooks/stripe`.

**Solution:** Stop the CLI (Ctrl+C) and restart it with the correct URL:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Scenario C: Webhook returns 500 "Webhook processing failed" (CLI Testing)

If you see a 500 error for a `payment_intent.succeeded` event specifically when using `stripe trigger` in the CLI:

**Symptoms:**
- HTTP status: 500
- Event description: "(created by Stripe CLI)"
- Metadata: `{}` (Empty)

**Cause:**
CLI-generated test events lack the required `metadata` (`holdId`, `organizationId`, etc.) and `transfer_data`.
1. The webhook handler detects missing metadata and classifies it as an "orphaned payment".
2. It attempts to auto-refund the payment to be safe.
3. Prior to the fix on Jan 19, 2026, it attempted to use `reverse_transfer: true` on these non-Connect test payments, causing Stripe API to throw an error and the webhook to return 500.

**Resolution:**
- **Code Fix:** We have updated the webhook handler to only set `reverse_transfer: true` if `transfer_data` exists on the PaymentIntent.
- **Testing:** Do **NOT** use `stripe trigger payment_intent.succeeded`. Instead, perform a real checkout flow in your local application (localhost:3000) to generate a valid event with proper metadata.

---

## Scenario D: Webhook IS firing (200 OK) but NO Order Created

If the webhook returns a `200 OK` status in the Stripe Dashboard but no tickets appear in your `orders` table:

### 1. Check the `stripe_payment_audit` Table
We log every webhook event to this table. Check it to see what happened.

```sql
SELECT * FROM stripe_payment_audit 
WHERE stripe_payment_intent_id = 'pi_...' 
ORDER BY created_at DESC;
```

- **If no record exists:** The webhook handler isn't even starting (check Middleware/Next.js logs).
- **If record exists:** Check the `metadata` column in the audit log.

### 2. Verify Metadata
The webhook relies on `metadata` to create the order.
- **Direct Purchase:** Requires `metadata.holdId`.
- **RSVP Purchase:** Requires `metadata.rsvpId` (or event/tier details).

If `metadata` is empty or missing these fields, the webhook will log "No Hold ID or RSVP found" and exit without creating an order.

**Resolution:** Ensure your frontend is calling the `create-payment-intent` API endpoint correctly, which attaches the necessary metadata. Creating a PaymentIntent manually in the Stripe Dashboard will **NOT** create an order because it lacks the required metadata.

### 3. Check for "Ghost Orders"
If the webhook failed to find the Hold (e.g., it expired) or encountered an error, it may have created a "Ghost Order" for reconciliation.

```sql
SELECT * FROM orders 
WHERE stripe_payment_intent_id = 'pi_...' 
AND status = 'requires_manual_review';
```

### 4. Check Server Logs
If the database connection failed or a critical error occurred, it will be logged in your server logs (Vercel logs or local console).

### 5. Check for Schema Mismatches (Known Bug - Fixed Jan 15)
If the webhook logs show "Order creation failed" but no specific error in `order_errors`, it might be due to a property mismatch.
*   **Issue:** The `holds` table uses `tier_id`, but `rsvps` uses `ticket_tier_id`. Using the wrong property name in the TypeScript interface caused `undefined` to be passed to `createOrder`.
*   **Symptom:** Webhook succeeds (200 OK), Hold exists, but no Order created and no `order_errors` log.
*   **Status:** Fixed in `app/api/webhooks/stripe/route.ts` (Jan 15, 2026).

### 6. Check for UUID Mismatch (Error 22P02)
If you see the error `invalid input syntax for type uuid: "pi_..."` in your logs:
*   **Issue:** The `orders.idempotency_key` column is defined as `UUID`, but we are trying to store the Stripe Payment Intent ID (a string) in it.
*   **Fix:** Apply the migration `20260115160000_fix_orders_idempotency_key_type.sql` to change the column type to `TEXT`.

