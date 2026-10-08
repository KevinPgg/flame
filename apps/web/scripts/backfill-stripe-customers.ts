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
      let failureRecorded = false; // Track if failure has been logged to prevent duplicates

      // Check if user has any orders (only once per user, outside retry loop)
      const { data: orders, error: ordersError } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (ordersError) {
        console.error(
          `Error fetching orders for user ${user.id}:`,
          ordersError
        );
        continue; // Skip this user
      }

      // Skip users without orders
      if (!orders || orders.length === 0) {
        continue;
      }

      while (!success && retries < MAX_RETRIES) {
        try {
          // Only create customer if they have purchase history
          // (orders check moved outside loop since order status won't change between retries)
          // Check if customer already exists (idempotency)
            // Use search to find by metadata
            // Prevent query injection by escaping user ID
            const escapedUserId = user.id
              .replace(/\\/g, "\\\\")
              .replace(/'/g, "\\'")
              .replace(/"/g, '\\"');
            const existingCustomers = await stripe.customers.search({
              query: `metadata['userId']:'${escapedUserId}'`,
              limit: 1,
            });

            let customer;
            let wasCreated = false;
            if (existingCustomers.data.length > 0) {
              customer = existingCustomers.data[0];
              // console.log(`Found existing customer for user ${user.email}: ${customer.id}`); // Redundant with final log
            } else {
              customer = await stripe.customers.create(
                {
                  email: user.email,
                  name:
                    user.first_name && user.last_name
                      ? `${user.first_name} ${user.last_name}`
                      : undefined,
                  metadata: {
                    userId: user.id,
                    backfilled: "true",
                  },
                },
                {
                  idempotencyKey: `backfill_customer_${user.id}`,
                }
              );
              wasCreated = true;
            }

            // Use optimistic locking: only update if stripe_customer_id is still null
            // This prevents overwriting concurrent writes
            const { data: updatedUser, error: updateError } = await supabaseAdmin
              .from("users")
              .update({ stripe_customer_id: customer.id })
              .eq("id", user.id)
              .is("stripe_customer_id", null) // Optimistic lock: only update if still null
              .select()
              .maybeSingle();

            if (updateError) {
              console.error(
                `Failed to update user ${user.id} with customer ID:`,
                updateError
              );

              // Always record failure in database, do not delete the customer to avoid idempotency issues
              if (!failureRecorded) {
                try {
                  await supabaseAdmin
                    .from("stripe_customer_backfill_failures")
                    .insert({
                      user_id: user.id,
                      customer_id: customer.id,
                      error_message: `Update failed: ${
                        updateError.message
                      }. Customer ${
                        wasCreated ? "created" : "found"
                      } but not linked.`,
                      created_at: new Date().toISOString(),
                    });
                  failureRecorded = true;
                } catch (insertErr) {
                  console.error("Failed to record backfill failure:", insertErr);
                }
              }

              // Surface error
              throw new Error(
                `Database update failed for user ${user.id}: ${updateError.message}`
              );
            }

            // Verify that a row was actually updated (no concurrent write occurred)
            if (!updatedUser) {
              // Another process already set stripe_customer_id - record as failure
              // but don't throw error since customer was created/found successfully
              if (!failureRecorded) {
                try {
                  await supabaseAdmin
                    .from("stripe_customer_backfill_failures")
                    .insert({
                      user_id: user.id,
                      customer_id: customer.id,
                      error_message: `Concurrent write detected: Customer ${
                        wasCreated ? "created" : "found"
                      } but stripe_customer_id was already set by another process.`,
                      created_at: new Date().toISOString(),
                    });
                  failureRecorded = true;
                } catch (insertErr) {
                  console.error("Failed to record concurrent write failure:", insertErr);
                }
              }
              // Continue processing - this is not a fatal error
              console.log(
                `Skipped update for user ${user.id} - stripe_customer_id already set (${i + 1}/${users.length})`
              );
            } else {
              // Update succeeded
              if (wasCreated) {
                console.log(
                  `Created customer for user ${user.id} (${i + 1}/${
                    users.length
                  })`
                );
              } else {
                console.log(
                  `Existing customer for user ${user.id} (${i + 1}/${
                    users.length
                  })`
                );
              }
            }
            success = true;

            // Rate limiting: Wait 50ms between requests (max ~20 requests/second, well below 100/s limit)
            // This prevents hitting Stripe's rate limit while still being efficient
            await delay(50);
        } catch (err) {
          // Mask email for PII protection - use user.id instead
          // Defensively handle emails that may not contain "@" symbol
          let maskedEmail = "N/A";
          if (user.email && typeof user.email === "string" && user.email.includes("@")) {
            const [localPart, domain] = user.email.split("@");
            maskedEmail = `${localPart.slice(0, 2)}***@${domain}`;
          } else if (user.email) {
            // If email exists but doesn't contain "@", mask the whole string
            maskedEmail = `${String(user.email).slice(0, 2)}***`;
          }
          console.error(
            `Failed to create customer for user ${user.id} (email: ${maskedEmail}) (Attempt ${
              retries + 1
            }/${MAX_RETRIES}):`,
            err
          );

          if ((err as any)?.type === "StripeRateLimitError") {
            retries++;
            // Check Retry-After header first
            // Note: stripe-node puts headers in err.headers or similar depending on version,
            // but standard response headers are accessible.
            // In stripe-node, error objects often have 'headers' property.
            // Using a safe access pattern.
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
          } else {
            // Non-rate-limit error: log to DB and abort this user
            // Only log if we haven't already recorded a failure for this user
            if (!failureRecorded) {
              try {
                await supabaseAdmin
                  .from("stripe_customer_backfill_failures")
                  .insert({
                    user_id: user.id,
                    error_message: `Fatal error creating customer: ${
                      (err as Error).message
                    }`,
                    created_at: new Date().toISOString(),
                    retry_count: retries + 1,
                  });
                failureRecorded = true;
              } catch (dbLogErr) {
                console.error("Failed to log fatal error to DB:", dbLogErr);
              }
            }
            break;
          }
        }
      }

      // If we exhausted retries without success, record that too
      // Only insert if we haven't already recorded a failure for this user
      if (!success && retries >= MAX_RETRIES && !failureRecorded) {
        try {
          await supabaseAdmin.from("stripe_customer_backfill_failures").insert({
            user_id: user.id,
            error_message: `Exhausted ${MAX_RETRIES} retries. Last error logged above.`,
            created_at: new Date().toISOString(),
            retry_count: retries,
          });
          failureRecorded = true;
        } catch (dbLogErr) {
          console.error("Failed to log retry exhaustion to DB:", dbLogErr);
        }
      }
    }

    lastId = users[users.length - 1].id;
    totalProcessed += users.length;

    if (users.length < pageSize) {
      hasMore = false;
    }
  }

  console.log(`Backfill complete! Processed ${totalProcessed} users.`);
}

// Run if called directly using ES modules pattern
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const entryFile = process.argv[1];

if (entryFile && path.resolve(__filename) === path.resolve(entryFile)) {
  backfillStripeCustomers()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
