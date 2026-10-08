# Stripe Customer Implementation Guide

## Understanding the Relationship: Customers vs. Connect

Before implementing, it's important to understand how **Stripe Customers** interact with **Stripe Connect** in our architecture:

- **Stripe Connect:** Handles the **Seller** side (Organizers). We use Connect Express accounts so organizers can receive payouts.
- **Stripe Customers:** Handles the **Buyer** side (Users). We create Customer objects to track purchase history and save payment methods.

**Crucially:** In our "Destination Charge" model (`on_behalf_of: organizer_id`), the Stripe Customer object is created on the **Platform Account**, not the connected account. This allows:

1.  A user to have a single "Customer" identity across all events/organizers.
2.  Saved payment methods to work for any event on the platform.
3.  Centralized support and analytics for the platform admin.

## Current State

Your app currently processes all payments **without** Stripe Customer objects (`customer: null`). While functional, this means:

- ❌ No customer history tracking in Stripe
- ❌ Can't save payment methods
- ❌ Harder to search/support customers
- ❌ Missing analytics on repeat buyers

## Why Add Customers?

### Benefits:

1. **Better Support** - Look up customer payment history by email
2. **Analytics** - Track repeat customers and lifetime value
3. **Future Features** - Enable saved cards, subscriptions, etc.
4. **Fraud Prevention** - Better risk scoring with customer history
5. **Professional Setup** - Industry standard for payment platforms

## Implementation Plan

### Phase 1: Database Changes

#### 1. Add `stripe_customer_id` to Users Table

Create migration: `supabase/migrations/YYYYMMDDHHMMSS_add_stripe_customer_id.sql`

```sql
-- Add stripe_customer_id column to users table
ALTER TABLE users
ADD COLUMN stripe_customer_id TEXT UNIQUE;

-- Add index for fast lookups
CREATE INDEX idx_users_stripe_customer_id
ON users(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN users.stripe_customer_id IS
'Stripe Customer ID for tracking payment history and saved payment methods';
```

### Phase 2: Create Customer Helper Functions

Create file: `app/lib/stripe/customers.ts`

```typescript
import { stripe } from "./stripe";
import { supabaseAdmin } from "../supabase/server";

/**
 * Gets or creates a Stripe Customer for a user.
 * Uses database to cache customer ID to avoid duplicate customers.
 *
 * @param userId - Supabase user ID
 * @param email - User's email address
 * @param name - Optional user name (firstName lastName)
 * @returns Stripe Customer ID
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name?: string
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not initialized");
  }

  // Validate email
  if (!email || !email.includes("@")) {
    throw new Error("Invalid email provided for customer creation");
  }

  // Check if user already has a Stripe customer ID
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    console.error("Error fetching user:", userError);
    // Handle missing user case - cannot get customer ID without user
    throw new Error("Failed to fetch user or user not found");
  }

  // Return existing customer ID if found
  if (user.stripe_customer_id) {
    // Optional: Verify customer still exists in Stripe, but for now trust DB
    return user.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      userId, // Link back to your user ID for reference
    },
  });

  // Save customer ID to database with optimistic locking
  // Only update if stripe_customer_id is still null
  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from("users")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id")
    .maybeSingle();

  // Handle race condition: another request created customer first
  if (updateError || !updatedUser) {
    console.log("Race condition detected when creating customer:", {
      userId,
      ourCustomerId: customer.id,
    });

    // Delete our duplicate customer
    try {
      await stripe.customers.del(customer.id);
      console.log("Cleaned up duplicate customer:", customer.id);
    } catch (deleteErr) {
      console.error("Failed to delete duplicate customer:", deleteErr);
      // Surface generic error so caller knows cleanup failed without leaking details
      throw new Error(`Failed to delete duplicate customer ${customer.id}`);
    }

    // Fetch the winning customer ID with retry
    let winningCustomerId: string | null = null;
    for (let i = 0; i < 3; i++) {
      const { data: refetchedUser, error: refetchError } = await supabaseAdmin
        .from("users")
        .select("stripe_customer_id")
        .eq("id", userId)
        .single();

      if (!refetchError && refetchedUser?.stripe_customer_id) {
        winningCustomerId = refetchedUser.stripe_customer_id;
        break;
      }
      // Wait 100ms before retry
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!winningCustomerId) {
      console.error(
        "Failed to retrieve winning customer ID after duplicate cleanup",
        { userId, duplicateCustomerId: customer.id }
      );
      throw new Error(
        "Failed to create customer and failed to retrieve winning customer ID"
      );
    }

    return winningCustomerId;
  }

  return customer.id;
}

/**
 * Get customer ID from database without creating
 * @param userId - Supabase user ID
 * @returns Customer ID or null if doesn't exist
 */
export async function getStripeCustomerId(
  userId: string
): Promise<string | null> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not initialized");
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  return user?.stripe_customer_id || null;
}
```

### Phase 3: Update Payment Intent Creation

Update: `app/api/purchase/create-payment-intent/route.ts`

```typescript
import { getOrCreateStripeCustomer } from "@/app/lib/stripe/customers";

// ... existing code ...

export async function POST(req: NextRequest) {
  // ... existing auth and validation ...

  // Get user info for customer creation
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, email, first_name, last_name") // Add name fields
    .eq("clerk_id", userId)
    .single();

  if (userError || !user) {
    console.error("Error fetching user:", userError);
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // ... existing hold/RSVP logic ...

  // Get or create Stripe customer
  const userName =
    user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : undefined;

  let customerId: string | undefined;
  try {
    customerId = await getOrCreateStripeCustomer(user.id, user.email, userName);
  } catch (error) {
    console.error("Failed to create customer:", error);
    // Don't fail the payment if customer creation fails
    // Payment can still work without customer ID
  }

  // Prepare PaymentIntent options
  const paymentIntentOptions: Stripe.PaymentIntentCreateParams = {
    amount: totalAmountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    on_behalf_of: org.stripe_account_id,
    transfer_data: {
      destination: org.stripe_account_id,
      amount: basePriceCents, // Guaranteed Net: Organizer gets exact base price
    },
    // NOTE: application_fee_amount is NOT used with transfer_data[amount] (mutually exclusive)
    // Stripe automatically calculates platform fee as: totalAmountCents - basePriceCents
    customer: customerId, // ✅ Add customer ID
    metadata: {
      ...metadata,
      feePercent: String(feePercent),
      basePriceCents: String(basePriceCents),
      platformFeeCents: String(platformFeeCents),
    },
  };

  // ... rest of existing code ...
}
```

### Phase 4: Backfill Existing Users (Optional)

Create a script to create customers for existing users with payment history.

Create: `scripts/backfill-stripe-customers.ts`

```typescript
import { stripe } from "../app/lib/stripe/stripe";
import { supabaseAdmin } from "../app/lib/supabase/server";

async function backfillStripeCustomers() {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not initialized");
  }

  const pageSize = 1000;
  let hasMore = true;
  let lastId = null;
  let totalProcessed = 0;

  // Helper function to add delay between API calls
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  while (hasMore) {
    // Get page of users without customer IDs
    let query = supabaseAdmin
      .from("users")
      .select("id, email, first_name, last_name")
      .is("stripe_customer_id", null)
      .order("id", { ascending: true })
      .limit(pageSize);

    if (lastId) {
      query = query.gt("id", lastId);
    }

    const { data: users, error } = await query;

    if (error || !users || users.length === 0) {
      if (error) console.error("Error fetching users:", error);
      hasMore = false;
      break;
    }

    console.log(`Processing batch of ${users.length} users...`);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      let retries = 0;
      const MAX_RETRIES = 5;
      let success = false;

      while (!success && retries < MAX_RETRIES) {
        try {
          // Check if user has any orders
          const { data: orders } = await supabaseAdmin
            .from("orders")
            .select("id")
            .eq("user_id", user.id)
            .limit(1);

          // Only create customer if they have purchase history
          if (orders && orders.length > 0) {
            // Validate email before creation
            if (!user.email || !user.email.includes("@")) {
              console.warn(
                `Skipping user ${user.id}: Invalid email ${user.email}`
              );
              success = true; // Skip this user
              continue;
            }

            const customer = await stripe.customers.create({
              email: user.email,
              name:
                user.first_name && user.last_name
                  ? `${user.first_name} ${user.last_name}`
                  : undefined,
              metadata: {
                userId: user.id,
                backfilled: "true",
              },
            });

            const { data: updatedUser, error: updateError } =
              await supabaseAdmin
                .from("users")
                .update({ stripe_customer_id: customer.id })
                .eq("id", user.id)
                .is("stripe_customer_id", null) // Optimistic lock: only update if still null
                .select("stripe_customer_id")
                .maybeSingle(); // Use maybeSingle to handle race condition gracefully

            if (updateError || !updatedUser) {
              console.error(
                `Failed to update user ${user.id} with customer ID:`,
                updateError ||
                  "Optimistic lock failed - customer ID already set"
              );

              // Rollback: delete the newly created Stripe customer since we couldn't link it (or another one won the race)
              try {
                await stripe.customers.del(customer.id);
                console.log(
                  `Cleaned up orphaned Stripe customer ${customer.id} due to link failure`
                );
              } catch (delErr) {
                console.error(
                  "Failed to delete orphaned Stripe customer:",
                  delErr
                );
              }

              // Surface error only if it was a DB error (not just a race condition we lost)
              if (updateError) {
                throw new Error(
                  `Database update failed for user ${user.id}: ${updateError.message}`
                );
              } else {
                console.log(
                  `Race condition lost for user ${user.id} - using existing customer ID (not returned here but backfill will skip next time)`
                );
                // We can continue to next user, as this user effectively has a customer ID now (set by the winner)
                success = true;
                continue;
              }
            }

            console.log(
              `Created customer for user ${user.email} (${i + 1}/${
                users.length
              })`
            );
            success = true;

            // Rate limiting: Wait 50ms between requests (max ~20 requests/second, well below 100/s limit)
            // This prevents hitting Stripe's rate limit while still being efficient
            await delay(50);
          } else {
            success = true; // Skip users without orders
          }
        } catch (err) {
          console.error(
            `Failed to create customer for ${user.email} (Attempt ${
              retries + 1
            }/${MAX_RETRIES}):`,
            err
          );

          if (err instanceof stripe.errors.StripeRateLimitError) {
            retries++;
            // Check Retry-After header first
            const headers = (err as any).headers || {};
            const retryAfterHeader =
              headers["retry-after"] || headers["Retry-After"];

            let waitTimeMs = 5000; // Default base

            if (retryAfterHeader) {
              const seconds = parseInt(retryAfterHeader, 10);
              if (!isNaN(seconds)) {
                waitTimeMs = seconds * 1000;
                console.log(
                  `Rate limit: Waiting ${seconds}s per Retry-After header`
                );
              }
            } else {
              // Exponential backoff: base * 2^retries + jitter
              const backoff = 1000 * Math.pow(2, retries);
              const jitter = Math.random() * 1000;
              waitTimeMs = Math.min(backoff + jitter, 30000); // Cap at 30s
              console.log(
                `Rate limit: Backing off for ${Math.round(waitTimeMs)}ms`
              );
            }

            await delay(waitTimeMs);
            continue; // Retry the operation
          } else {
            // Non-rate-limit error: abort this user
            break;
          }
        }
      }
    }

    lastId = users[users.length - 1].id;
    totalProcessed += users.length;

    if (users.length < pageSize) {
      hasMore = false;
    }
  }

  console.log("Backfill complete!");
}

// Run if called directly using ES modules pattern
import { fileURLToPath } from "url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  backfillStripeCustomers()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
```

## Testing Plan

### 1. Test Customer Creation

1.  **Preparation:** Ensure your local DB has `stripe_customer_id` column and your `.env.local` uses test keys.
2.  **Action:** Complete a purchase flow (RSVP or Direct Hold) as a user who doesn't have a `stripe_customer_id`.
3.  **Verification (DB):** check `users` table: `SELECT stripe_customer_id FROM users WHERE email = 'user@example.com';` (Should not be null).
4.  **Verification (Stripe):** Go to Stripe Dashboard -> Customers. Search for the email. Verify the customer exists and metadata `userId` matches.

### 2. Test Duplicate Prevention

1.  **Action:** As the _same user_ from step 1, initiate another purchase immediately.
2.  **Verification:** Check logs for "Race condition detected" (if you simulated concurrency) or simply verify that no _new_ customer was created in Stripe (Customer count remains constant).
3.  **Verification:** The payment intent for the second order should use the _same_ `cus_...` ID.

### 3. Test Without Customer (Graceful Fallback)

1.  **Preparation:** Temporarily modify `getOrCreateStripeCustomer` to throw an error.
2.  **Action:** Attempt a purchase.
3.  **Verification:** The purchase should still succeed (PaymentIntent created _without_ `customer` field).
4.  **Verification:** Error should be logged to console but user experience remains uninterrupted.

## Deployment Checklist

- [ ] Run database migration to add `stripe_customer_id` column
- [ ] Deploy `app/lib/stripe/customers.ts` helper functions
- [ ] Update payment intent creation to use customers
- [ ] Test in development with test Stripe keys
- [ ] Monitor logs for customer creation errors
- [ ] Run backfill script for existing users (optional)
- [ ] Verify customers appear in Stripe Dashboard
- [ ] Update documentation

## Benefits After Implementation

### Stripe Dashboard:

- Search customers by email: `email:"user@example.com"`
- View customer payment history
- See lifetime value per customer
- Better fraud detection

### Your App:

- Foundation for saved payment methods
- Customer analytics and reporting
- Better support capabilities
- Professional payment setup

### User Experience:

- Faster future: Can save cards (if you add that feature)
- Better support: Easier to look up payment history
- More reliable: Customer history helps prevent fraud flags

## Maintenance

### Ongoing:

- Customer IDs are cached in your database
- No additional API calls per payment (already cached)
- Automatic linking for all new users

### Monitoring:

- Check for users without customer IDs
- Monitor customer creation failures
- Track duplicate customer creation attempts

## Cost Impact

**None** - Stripe doesn't charge for Customer objects. They're free to create and store.

## Alternative: Simpler Approach

If you want customers but don't want to modify much code:

### Quick Win: Add to Webhook

> **⚠️ WARNING:** This approach creates a Stripe customer from `receipt_email` without verifying a corresponding local user or capturing a user ID. This can result in "orphaned" customers in Stripe that aren't linked to your database, and it bypasses the email validation used in the main implementation. Use with caution or strictly as a fallback.

When `payment_intent.succeeded` fires, create customer retroactively:

```typescript
// In webhook handler
// Validate user exists before creating customer (pseudo-code)
// const user = await findUserByEmail(paymentIntent.receipt_email);
// if (!user) return; // Don't create orphaned customer

if (!paymentIntent.customer && paymentIntent.receipt_email) {
  const customer = await stripe.customers.create({
    email: paymentIntent.receipt_email,
    metadata: { createdFrom: "webhook" },
  });

  // Update PaymentIntent with customer
  await stripe.paymentIntents.update(paymentIntent.id, {
    customer: customer.id,
  });
}
```

This is simpler but less ideal because:

- Customer created after payment (not during)
- No database caching (more API calls)
- Can't use customer for future features

## Recommendation

**Implement Phase 1-3** for a solid foundation. Skip Phase 4 (backfill) unless you need historical customer data in Stripe.

**Timeline:** 2-3 hours
**Complexity:** Low-Medium
**Impact:** High (enables future features)
**Urgency:** Low (payments work without it)

## Summary

**Current:** `customer: null` - Works but limits future features
**Future:** `customer: cus_xxxxx` - Better tracking, analytics, and capabilities

The implementation is straightforward and provides significant long-term benefits for your platform.
