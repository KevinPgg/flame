import { supabaseAdmin } from "@/app/lib/supabase/server";
import { revalidatePath } from "next/cache";
import * as crypto from "crypto";
import QRCode from "qrcode";
import { validateAndParseQuantity } from "@/app/lib/utils/quantity-validation";
import * as Sentry from "@sentry/nextjs";
import { v5 as uuidv5 } from "uuid";

export interface RecoveryResult {
  transaction_id: string;
  customer_email?: string;
  amount?: number;
  verified_at?: string;
  recovery_attempted: boolean;
  success?: boolean;
  error?: string;
  order_id?: string;
  tickets_created?: number;
  tickets_rolled_back?: number;
  order_rolled_back?: boolean;
  hold_update_warning?: string;
  action?: string;
  recovery_completed_at?: string;
  dry_run?: boolean;
  event_name?: string;
  tier_name?: string;
  quantity?: number;
}

/**
 * Attempt to recover a single stuck transaction
 */
export async function recoverTransaction(
  transaction: any,
  dryRun: boolean
): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    transaction_id: transaction.datafast_transaction_id,
    customer_email: transaction.customer_email,
    amount: transaction.amount,
    verified_at: transaction.verified_at,
    recovery_attempted: !dryRun,
  };

  // Check if Supabase admin client is available
  if (!supabaseAdmin) {
    result.success = false;
    result.error = "Supabase configuration error";
    return result;
  }

  try {
    // Validate user_id is a valid UUID if present
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (transaction.user_id && !uuidRegex.test(transaction.user_id)) {
      console.error(`❌ INVALID USER_ID DETECTED: ${transaction.user_id}`);
      result.success = false;
      result.error = `Invalid user_id format: ${transaction.user_id}. Must be a valid UUID.`;
      return result;
    }

    // Step 1: Find or reconstruct the hold
    let hold = null;
    if (transaction.hold_id) {
      console.log(`  Looking for hold: ${transaction.hold_id}`);
      const { data: foundHold } = await supabaseAdmin
        .from("holds")
        .select(
          `
          *,
          events!inner (
            id,
            name,
            slug,
            starts_at,
            venue,
            organization_id
          ),
          ticket_tiers!holds_tier_id_fkey (
            id,
            name,
            price_cents
          )
        `
        )
        .eq("id", transaction.hold_id)
        .single();

      if (foundHold) {
        hold = foundHold;
        console.log(`  ✅ Hold found`);
      } else {
        console.log(`  ⚠️  Hold not found, trying to reconstruct...`);
      }
    }

    // If hold not found, try to reconstruct from transaction data
    if (!hold && transaction.verification_response_data) {
      const verificationData = transaction.verification_response_data;
      const cartItem = verificationData.cart?.items?.[0];
      const checkoutData = transaction.checkout_request_data;

      if (!cartItem) {
        result.success = false;
        result.error = "No cart data available to reconstruct hold";
        return result;
      }

      console.log(`  Reconstructing hold from cart data...`);
      console.log(`  Event: ${cartItem.name}`);

      let event = null;
      let tier = null;

      // Step 1: Try to use authoritative IDs if stored in transaction data
      // Check checkout_request_data and verification_response_data for event_id and tier_id
      const authoritativeEventId =
        checkoutData?.event_id || verificationData?.event_id;
      const authoritativeTierId =
        checkoutData?.tier_id || verificationData?.tier_id;

      if (authoritativeEventId && authoritativeTierId) {
        console.log(
          `  Using authoritative IDs: event_id=${authoritativeEventId}, tier_id=${authoritativeTierId}`
        );

        // Fetch event and tier using authoritative IDs
        const { data: eventData } = await supabaseAdmin
          .from("events")
          .select("id, name, slug, starts_at, venue, organization_id")
          .eq("id", authoritativeEventId)
          .single();

        const { data: tierData } = await supabaseAdmin
          .from("ticket_tiers")
          .select("*")
          .eq("id", authoritativeTierId)
          .eq("event_id", authoritativeEventId) // Validate tier belongs to event
          .single();

        if (eventData && tierData) {
          event = eventData;
          tier = tierData;
          console.log(`  ✅ Found event and tier using authoritative IDs`);
        } else {
          console.log(
            `  ⚠️  Authoritative IDs invalid, falling back to name lookup`
          );
        }
      }

      // Step 2: Fallback to stricter name-based lookup if authoritative IDs not available
      if (!event || !tier) {
        console.log(
          `  Falling back to name-based lookup with stricter matching`
        );

        // Normalize event name for exact/equivalent matching
        const normalizedEventName = cartItem.name?.trim();
        if (!normalizedEventName) {
          result.success = false;
          result.error = "Event name not available in cart data";
          return result;
        }

        // Find event with stricter matching: exact name match (case-insensitive) and date range
        // Use a reasonable date range (e.g., within 1 year) to avoid false matches
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

        const { data: eventCandidates, error: eventError } = await supabaseAdmin
          .from("events")
          .select("id, name, slug, starts_at, venue, organization_id")
          .ilike("name", normalizedEventName)
          .gte("starts_at", oneYearAgo.toISOString())
          .lte("starts_at", oneYearFromNow.toISOString())
          .order("starts_at", { ascending: false });

        if (eventError) {
          result.success = false;
          result.error = `Error querying events: ${eventError.message}`;
          return result;
        }

        if (!eventCandidates || eventCandidates.length === 0) {
          result.success = false;
          result.error = `Event not found: ${
            cartItem.name
          } (searched within date range ${oneYearAgo.toISOString()} to ${oneYearFromNow.toISOString()})`;
          return result;
        }

        if (eventCandidates.length > 1) {
          // Multiple candidates found - log them for manual resolution
          console.error(
            `  ❌ Multiple event candidates found for "${cartItem.name}":`
          );
          eventCandidates.forEach((e, idx) => {
            console.error(
              `    ${idx + 1}. ${e.name} (${e.id}) - ${e.starts_at} - org: ${
                e.organization_id
              }`
            );
          });
          result.success = false;
          result.error = `Multiple events match "${
            cartItem.name
          }". Candidates: ${eventCandidates
            .map(e => `${e.name} (${e.id})`)
            .join(", ")}. Manual resolution required.`;
          return result;
        }

        event = eventCandidates[0];
        console.log(
          `  ✅ Found event using name lookup: ${event.name} (${event.id})`
        );

        // Extract tier name
        const tierNameMatch = cartItem.description?.match(
          /^(.+?) - \d+x tickets$/
        );
        if (!tierNameMatch) {
          result.success = false;
          result.error = `Cannot parse tier name from: ${cartItem.description}`;
          return result;
        }

        const tierName = tierNameMatch[1].trim();
        console.log(`  Looking for tier: ${tierName}`);

        // Find ticket tier with exact/equivalent name matching and event_id constraint
        const { data: tierCandidates, error: tierError } = await supabaseAdmin
          .from("ticket_tiers")
          .select("*")
          .eq("event_id", event.id)
          .ilike("name", tierName)
          .order("created_at", { ascending: false });

        if (tierError) {
          result.success = false;
          result.error = `Error querying ticket tiers: ${tierError.message}`;
          return result;
        }

        if (!tierCandidates || tierCandidates.length === 0) {
          result.success = false;
          result.error = `Ticket tier not found: ${tierName} for event ${event.name} (${event.id})`;
          return result;
        }

        if (tierCandidates.length > 1) {
          // Multiple candidates found - log them for manual resolution
          console.error(
            `  ❌ Multiple tier candidates found for "${tierName}" in event "${event.name}":`
          );
          tierCandidates.forEach((t, idx) => {
            console.error(
              `    ${idx + 1}. ${t.name} (${t.id}) - price: $${(
                t.price_cents / 100
              ).toFixed(2)}`
            );
          });
          result.success = false;
          result.error = `Multiple tiers match "${tierName}" for event "${
            event.name
          }". Candidates: ${tierCandidates
            .map(t => `${t.name} (${t.id})`)
            .join(", ")}. Manual resolution required.`;
          return result;
        }

        tier = tierCandidates[0];
        console.log(
          `  ✅ Found tier using name lookup: ${tier.name} (${tier.id})`
        );
      }

      // Validate and parse quantity before building hold
      // This prevents NaN from breaking downstream calculations
      // SPEC-RECOVER-003: Quantity MUST be a positive integer
      const quantityValidation = validateAndParseQuantity(cartItem.quantity);
      if (!quantityValidation.valid) {
        result.success = false;
        result.error = quantityValidation.error!;
        return result;
      }
      const parsedQuantity = quantityValidation.parsed!;

      // Build pseudo-hold
      hold = {
        id: transaction.hold_id || crypto.randomUUID(),
        user_id: transaction.user_id,
        event_id: event.id,
        tier_id: tier.id,
        quantity: parsedQuantity,
        stage_price_cents: null,
        events: event,
        ticket_tiers: tier,
      };

      console.log(`  ✅ Hold reconstructed`);
    }

    if (!hold) {
      result.success = false;
      result.error = "Could not find or reconstruct hold";
      return result;
    }

    result.event_name = hold.events.name;
    result.tier_name = hold.ticket_tiers.name;
    result.quantity = hold.quantity;

    if (dryRun) {
      result.success = true;
      result.action = "would_create_order";
      result.dry_run = true;
      return result;
    }

    // Step 2: Create the order
    console.log(`  Creating order...`);
    const unitPrice = hold.stage_price_cents ?? hold.ticket_tiers.price_cents;
    const quantity = hold.quantity;
    const subtotalCents = unitPrice * quantity;
    const processingFee = 0;
    const totalCents = subtotalCents;

    // Generate deterministic UUID v5 idempotency key based on transaction ID
    // This ensures the same transaction always gets the same key, preventing duplicates on retries
    // Uses the same namespace as database functions for consistency
    const NAMESPACE_RECOVERY = "a8b7c6d5-e4f3-5a2b-9c8d-7e6f5a4b3c2d";
    const transactionIdentifier =
      transaction.datafast_transaction_id ||
      transaction.id ||
      transaction.merchant_transaction_id;
    const idempotencyKey = uuidv5(
      `recovery:${transactionIdentifier}`,
      NAMESPACE_RECOVERY
    );

    let { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: transaction.user_id,
        organization_id: hold.events.organization_id,
        event_id: hold.event_id,
        ticket_tier_id: hold.tier_id,
        quantity: quantity,
        unit_price_cents: unitPrice,
        subtotal_cents: subtotalCents,
        fees_cents: processingFee,
        total_cents: totalCents,
        total_amount_cents: totalCents,
        processing_fee_cents: processingFee,
        status: "completed",
        payment_method: "datafast",
        payment_provider: "datafast",
        datafast_transaction_id: transaction.datafast_transaction_id,
        datafast_auth_code: transaction.auth_code,
        datafast_reference_no: transaction.reference_no,
        merchant_transaction_id: transaction.merchant_transaction_id,
        // Use deterministic idempotency_key based on transaction ID to prevent duplicate orders on retries
        idempotency_key: idempotencyKey,
        created_at: transaction.verified_at, // Use payment time
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      // Handle unique constraint violation (code 23505)
      // This happens if an order with the same idempotency_key already exists
      if (orderError.code === "23505") {
        console.log(
          `  ⚠️  Duplicate order detected (idempotency conflict). Fetching existing order...`
        );
        const { data: existingOrder, error: fetchError } = await supabaseAdmin
          .from("orders")
          .select()
          .eq("idempotency_key", idempotencyKey)
          .single();

        if (fetchError || !existingOrder) {
          result.success = false;
          result.error = `Duplicate order detected but failed to fetch it: ${
            fetchError?.message || "Unknown error"
          }`;

          Sentry.captureException(new Error(result.error), {
            extra: {
              transaction_id: transaction.datafast_transaction_id,
              user_id: transaction.user_id,
              recovery_step: "recoverTransaction_fetchDuplicateOrder",
              error: fetchError,
            },
          });

          return result;
        }

        order = existingOrder;
        console.log(`  ✅ Recovered existing order: ${order.id}`);

        // Note: Ticket existence is checked in the next step (see below)
        // to prevent creating duplicates if the order was already recovered.
      } else {
        result.success = false;
        result.error = `Failed to create order: ${orderError.message}`;

        Sentry.captureException(new Error(result.error), {
          extra: {
            transaction_id: transaction.datafast_transaction_id,
            user_id: transaction.user_id,
            recovery_step: "recoverTransaction_createOrder",
            error: orderError,
          },
        });

        return result;
      }
    } else if (!order) {
      result.success = false;
      result.error = "Failed to create order: No data returned";

      Sentry.captureException(new Error(result.error), {
        extra: {
          transaction_id: transaction.datafast_transaction_id,
          user_id: transaction.user_id,
          recovery_step: "recoverTransaction_createOrder_noData",
        },
      });

      return result;
    }

    console.log(`  ✅ Order created/retrieved: ${order.id}`);
    result.order_id = order.id;

    // Step 3: Create tickets
    console.log(`  Creating ${quantity} tickets...`);
    const ticketIds: string[] = [];
    const newlyCreatedTicketIds: string[] = []; // Track only newly created tickets for safe rollback

    // Check for existing tickets first
    const { data: existingTickets, error: existingTicketsError } =
      await supabaseAdmin.from("tickets").select("id").eq("order_id", order.id);

    if (existingTicketsError) {
      console.error(
        `  ⚠️ Error checking existing tickets: ${existingTicketsError.message}`
      );
    }

    if (existingTickets && existingTickets.length > 0) {
      console.log(
        `  ✅ Found ${existingTickets.length} existing tickets for order ${order.id}`
      );
      existingTickets.forEach(t => ticketIds.push(t.id));

      // If we have enough tickets, we can skip creation
      if (ticketIds.length >= quantity) {
        console.log(`  ✅ Existing tickets sufficient. Skipping creation.`);
      }
    }

    // Get user details for tickets
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email, first_name, last_name")
      .eq("id", transaction.user_id)
      .single();

    const attendeeName = user
      ? `${user.first_name} ${user.last_name}`
      : "Unknown";
    const attendeeEmail = user?.email || transaction.customer_email;

    // Only create tickets if we don't have enough
    const ticketsNeeded = quantity - ticketIds.length;
    if (ticketsNeeded > 0) {
      console.log(`  Need to create ${ticketsNeeded} more tickets...`);

      // Validate attendeeEmail is present - only required when creating new tickets
      if (!attendeeEmail) {
        result.success = false;
        result.error =
          "Cannot determine attendee email from user or transaction data. User email and transaction.customer_email are both missing.";
        console.error(
          `  ❌ Missing attendee email: user_id=${transaction.user_id}, ` +
            `user.email=${user?.email ? "[REDACTED]" : "missing"}, ` +
            `transaction.customer_email=${
              transaction.customer_email ? "[REDACTED]" : "missing"
            }`
        );
        return result;
      }

      for (let i = 0; i < ticketsNeeded; i++) {
        const qrToken = crypto.randomUUID();
        const qrCode = await QRCode.toDataURL(qrToken);

        const { data: ticket, error: ticketError } = await supabaseAdmin
          .from("tickets")
          .insert({
            order_id: order.id,
            ticket_tier_id: hold.tier_id,
            user_id: transaction.user_id,
            event_id: hold.event_id,
            attendee_name: attendeeName,
            attendee_email: attendeeEmail,
            status: "issued",
            qr_token: qrToken,
            qr_code: qrCode,
            created_at: order.created_at,
          })
          .select()
          .single();

        if (ticketError || !ticket) {
          const errorMessage = ticketError?.message || "Unknown error";
          console.error(
            `  ❌ Failed to create ticket ${
              i + 1
            } of ${ticketsNeeded}: ${errorMessage}`
          );

          // For uniqueness errors, we might have hit a race condition or retry.
          // We can try to fetch tickets again to see if they were created by another process.
          if (ticketError?.code === "23505") {
            // Unique violation
            console.log(
              "  ⚠️ Unique violation during ticket creation. Checking for existing tickets again..."
            );
            const { data: retryTickets } = await supabaseAdmin
              .from("tickets")
              .select("id")
              .eq("order_id", order.id);

            if (retryTickets && retryTickets.length >= quantity) {
              console.log("  ✅ Found sufficient tickets on retry.");
              // Reset ticketIds and fill with found tickets
              ticketIds.length = 0;
              retryTickets.forEach(t => ticketIds.push(t.id));
              break; // Stop creating, we are good
            }
          }

          // If still not enough tickets or other error, perform rollback
          // CRITICAL: Only rollback newly created tickets, NOT pre-existing ones
          if (newlyCreatedTicketIds.length > 0) {
            console.log(
              `  Rolling back ${newlyCreatedTicketIds.length} newly created tickets (cleanup)...`
            );
            const { error: deleteError } = await supabaseAdmin
              .from("tickets")
              .delete()
              .in("id", newlyCreatedTicketIds);

            if (deleteError) {
              console.error(
                `  ⚠️  Failed to roll back tickets: ${
                  deleteError.message
                }. Manual cleanup required for ticket IDs: ${newlyCreatedTicketIds.join(
                  ", "
                )}`
              );
            } else {
              console.log(
                `  ✅ Rolled back ${newlyCreatedTicketIds.length} newly created tickets`
              );
            }
          }

          // Roll back the order ONLY if we created it in this run
          // If orderError was 23505 (duplicate), the order already existed and should NOT be deleted
          const orderWasCreatedNow = !orderError || orderError.code !== "23505";
          if (orderWasCreatedNow) {
            console.log(`  Rolling back order ${order.id}...`);
            const { error: orderDeleteError } = await supabaseAdmin
              .from("orders")
              .delete()
              .eq("id", order.id);

            if (orderDeleteError) {
              console.error(
                `  ⚠️  Failed to roll back order: ${orderDeleteError.message}. Manual cleanup required for order ID: ${order.id}`
              );
            } else {
              console.log(`  ✅ Rolled back order ${order.id}`);
            }
          } else {
            console.log(
              `  ⚠️  Order was recovered from existing record, not rolling back`
            );
          }

          result.success = false;
          result.error = `Failed to create ticket ${
            i + 1
          } of ${ticketsNeeded}: ${errorMessage}. Newly created tickets and order rolled back (if created).`;
          result.tickets_created = newlyCreatedTicketIds.length;
          result.tickets_rolled_back = newlyCreatedTicketIds.length;
          result.order_rolled_back = orderWasCreatedNow;

          Sentry.captureException(new Error(result.error), {
            extra: {
              transaction_id: transaction.datafast_transaction_id,
              user_id: transaction.user_id,
              recovery_step: "recoverTransaction_createTickets",
              error: ticketError,
            },
          });

          return result;
        }

        ticketIds.push(ticket.id);
        newlyCreatedTicketIds.push(ticket.id); // Track newly created ticket
      }
    } else {
      console.log(
        `  ✅ No new tickets needed (${ticketIds.length}/${quantity} exist)`
      );
    }

    console.log(`  ✅ Tickets confirmed: ${ticketIds.length}`);

    // Validate all tickets were created successfully (safety check)
    // Only fail if we have insufficient tickets. Having MORE tickets is acceptable
    // (can happen from race conditions or previous partial recoveries)
    if (ticketIds.length < quantity) {
      console.error(
        `  ❌ Data integrity check failed: Expected ${quantity} tickets, but only ${ticketIds.length} were found`
      );

      // Roll back ONLY newly created tickets, NOT pre-existing ones
      if (newlyCreatedTicketIds.length > 0) {
        console.log(
          `  Rolling back ${newlyCreatedTicketIds.length} newly created tickets...`
        );
        const { error: deleteError } = await supabaseAdmin
          .from("tickets")
          .delete()
          .in("id", newlyCreatedTicketIds);

        if (deleteError) {
          console.error(
            `  ⚠️  Failed to roll back tickets: ${
              deleteError.message
            }. Manual cleanup required for ticket IDs: ${newlyCreatedTicketIds.join(
              ", "
            )}`
          );
        } else {
          console.log(
            `  ✅ Rolled back ${newlyCreatedTicketIds.length} newly created tickets`
          );
        }
      }

      // Roll back the order ONLY if we created it in this run
      const orderWasCreatedNow = !orderError || orderError.code !== "23505";
      if (orderWasCreatedNow) {
        console.log(`  Rolling back order ${order.id}...`);
        const { error: orderDeleteError } = await supabaseAdmin
          .from("orders")
          .delete()
          .eq("id", order.id);

        if (orderDeleteError) {
          console.error(
            `  ⚠️  Failed to roll back order: ${orderDeleteError.message}. Manual cleanup required for order ID: ${order.id}`
          );
        } else {
          console.log(`  ✅ Rolled back order ${order.id}`);
        }
      } else {
        console.log(
          `  ⚠️  Order was recovered from existing record, not rolling back`
        );
      }

      result.success = false;
      result.error = `Data integrity violation: Only ${ticketIds.length} of ${quantity} tickets were created. Newly created tickets and order (if created) have been rolled back. Manual intervention required.`;
      result.tickets_created = newlyCreatedTicketIds.length;
      result.tickets_rolled_back = newlyCreatedTicketIds.length;
      result.order_rolled_back = orderWasCreatedNow;

      Sentry.captureException(new Error(result.error), {
        extra: {
          transaction_id: transaction.datafast_transaction_id,
          user_id: transaction.user_id,
          recovery_step: "recoverTransaction_ticketCountCheck",
        },
      });

      return result;
    }

    result.tickets_created = newlyCreatedTicketIds.length;

    // Step 4: Update transaction status
    // CRITICAL: This update must succeed or the transaction will remain in "processing"
    // state and may be picked up by future recovery runs, causing confusion.
    console.log(`  Updating transaction status...`);

    const identifierColumn = transaction.id ? "id" : "datafast_transaction_id";
    const identifierValue =
      transaction.id || transaction.datafast_transaction_id;

    const { error: txUpdateError } = await supabaseAdmin
      .from("datafast_transactions")
      .update({
        status: "processed",
        order_id: order.id,
        hold_id: hold.id,
        processed_at: new Date().toISOString(),
      })
      .eq(identifierColumn, identifierValue);

    if (txUpdateError) {
      console.error(
        `  ❌ Failed to update transaction: ${txUpdateError.message}`
      );
      result.success = false;
      result.error = `Failed to update transaction status: ${txUpdateError.message}. Order and tickets were created but transaction remains in processing state.`;
      result.order_id = order.id;
      result.tickets_created = newlyCreatedTicketIds.length;

      Sentry.captureException(new Error(result.error), {
        extra: {
          transaction_id: transaction.datafast_transaction_id,
          user_id: transaction.user_id,
          recovery_step: "recoverTransaction_updateTransactionStatus",
          error: txUpdateError,
        },
      });

      return result;
    }

    console.log(`  ✅ Transaction marked as processed`);

    // Step 5: Update hold if it exists
    // Best-effort: important for consistency but not critical for recovery success
    if (transaction.hold_id) {
      const { error: holdUpdateError } = await supabaseAdmin
        .from("holds")
        .update({
          order_id: order.id,
          payment_in_progress: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.hold_id);

      if (holdUpdateError) {
        console.error(
          `  ⚠️  Failed to update hold (best-effort): ${holdUpdateError.message}`
        );
        // Log warning but don't fail recovery - order and transaction are already updated
        result.hold_update_warning = `Hold update failed: ${holdUpdateError.message}`;
      } else {
        console.log(`  ✅ Hold linked to order`);
      }
    }

    result.success = true;
    result.action = "order_created";
    result.recovery_completed_at = new Date().toISOString();

    // ⚡ ON-DEMAND REVALIDATION: Clear caches after successful recovery
    // This ensures availability updates immediately for other users
    try {
      // Revalidate event page to update availability
      if (hold.events?.slug) {
        revalidatePath(`/events/${hold.events.slug}`);
        console.log(`  ✅ Revalidated event page: /events/${hold.events.slug}`);
      }
      // Revalidate organizer dashboard for revenue & attendee counts
      revalidatePath("/organizer");
      console.log(`  ✅ Revalidated organizer dashboard`);
      // Revalidate user account page for ticket list
      revalidatePath("/account");
      console.log(`  ✅ Revalidated account page`);
    } catch (revalidationError) {
      console.error(`  ⚠️  Failed to revalidate caches:`, revalidationError);
      // Don't fail recovery for revalidation errors
    }

    return result;
  } catch (error) {
    console.error(`❌ Exception during recovery:`, error);
    Sentry.captureException(error, {
      extra: {
        transaction_id: transaction.datafast_transaction_id,
        user_id: transaction.user_id,
        recovery_step: "recoverTransaction",
      },
    });
    result.success = false;
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}
