import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../../../lib/supabase/server";
import { sendTicketConfirmationEmail } from "../../../../../lib/email/ticket-notifications";
import { sendPushNotification } from "../../../../../lib/push-notifications";
import { revalidatePath } from "next/cache";
import { stripe } from "../../../../../lib/stripe/stripe";
import { createOrder, generateTickets } from "../../../../../lib/orders";
import { isCancellableStatus } from "../../../../../lib/stripe/constants";
import { canManageEventRsvps } from "../../../../../lib/utils/event-rsvp-authz";
import Stripe from "stripe";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * Helper function to rollback RSVP approval
 * Resets status to pending and clears approval metadata
 *
 * Uses optimistic locking to only rollback if status is still "approved"
 * to prevent rolling back an RSVP that was already processed by another operation
 */
async function rollbackApproval(rsvpId: string): Promise<{ error: any }> {
  if (!supabaseAdmin) {
    return { error: { message: "Database connection not available" } };
  }

  const { error } = await supabaseAdmin
    .from("rsvps")
    .update({
      status: "pending",
      approved_at: null,
      approved_by: null,
    })
    .eq("id", rsvpId)
    .eq("status", "approved"); // Only rollback if still approved (defense-in-depth)

  return { error };
}

// Type for RSVP with relations from Supabase query
interface RsvpWithRelations {
  users: { first_name: string | null; last_name: string | null; email: string } | null;
  events: { name: string; starts_at: string; venue: string; timezone?: string; organization_id?: string; currency?: string };
  ticket_tiers: { name: string };
  requested_quantity: number | null;
}

// Type for RSVP record used in recovery logic
interface RsvpRecord {
  id: string;
  user_id: string;
  event_id: string;
  ticket_tier_id: string;
  stage_id: string | null;
  ticket_tiers: { name: string };
  events: { name: string; starts_at: string; venue: string; timezone?: string; organization_id?: string; currency?: string };
}

/**
 * Recovery helper for existing orders without tickets
 * Handles the stuck state where order was created but ticket creation failed
 *
 * @param params - Recovery parameters
 * @returns Success result with orderId or error result with statusCode
 */
async function recoverExistingOrderForFreeRsvp(params: {
  rsvpId: string;
  existingOrder: { id: string; status: string };
  rsvp: RsvpRecord;
  quantity: number;
}): Promise<
  | { success: true; orderId: string; emailSent: boolean }
  | { success: false; error: string; statusCode: number }
> {
  if (!supabaseAdmin) {
    return {
      success: false,
      error: "Database connection not available",
      statusCode: 500,
    };
  }

  const { rsvpId, existingOrder, rsvp, quantity } = params;

  console.warn("Order exists but no tickets found - attempting recovery:", {
    rsvpId,
    orderId: existingOrder.id,
    orderStatus: existingOrder.status,
  });

  try {
    // Fetch user for ticket generation
    const { data: user, error: recoveryUserError } = await supabaseAdmin
      .from("users")
      .select("email, first_name, last_name")
      .eq("id", rsvp.user_id)
      .single();

    if (recoveryUserError || !user) {
      console.error(
        "Failed to fetch user for ticket recovery:",
        recoveryUserError
      );
      return {
        success: false,
        error:
          "Order exists but ticket creation failed. Manual intervention required.",
        statusCode: 500,
      };
    }

    // Generate tickets for the existing order using shared utility
    const tickets = await generateTickets({
      orderId: existingOrder.id,
      userId: rsvp.user_id,
      eventId: rsvp.event_id,
      ticketTierId: rsvp.ticket_tier_id,
      quantity: quantity,
      attendeeEmail: user.email,
      attendeeFirstName: user.first_name,
      attendeeLastName: user.last_name,
      tierName: rsvp.ticket_tiers.name,
      eventName: rsvp.events.name,
      stageId: rsvp.stage_id,
    });

    // Note on transaction consistency (reference to lines 125-167):
    // The current implementation performs ticket insertion and order status update sequentially with manual error handling.
    // Since Supabase's JS client doesn't support traditional multi-statement transactions without an RPC,
    // and the current pattern of checking errors at each step is consistent with the rest of the codebase,
    // we rely on robust error handling rather than a complex RPC refactor.
    // The added recovery logic in the duplicate order check reinforces resilience.

    // Insert tickets and return the created tickets with IDs
    const { data: createdTickets, error: ticketInsertError } = await supabaseAdmin
      .from("tickets")
      .insert(tickets)
      .select();

    if (ticketInsertError || !createdTickets || createdTickets.length === 0) {
      console.error("Failed to create tickets for existing order:", {
        rsvpId,
        orderId: existingOrder.id,
        error: ticketInsertError,
      });
      return {
        success: false,
        error:
          "Order exists but ticket creation failed. Manual intervention required.",
        statusCode: 500,
      };
    }

    // Update order status to paid
    const { error: statusUpdateError } = await supabaseAdmin
      .from("orders")
      .update({ status: "paid" })
      .eq("id", existingOrder.id);

    if (statusUpdateError) {
      console.error(
        "Failed to update order status to paid after ticket recovery:",
        {
          rsvpId,
          orderId: existingOrder.id,
          error: statusUpdateError,
        }
      );
      // Tickets were created successfully, but order status update failed
      // This leaves the order in requires_manual_review status
      // We return success because the tickets (the primary value) exist
      // The order status mismatch can be resolved manually
      console.warn(
        "Recovered order with orphaned tickets - status update failed:",
        {
          rsvpId,
          orderId: existingOrder.id,
        }
      );
      // Proceed to send email even if status update failed, as tickets exist
    }

    // Send ticket confirmation email
    // This was missing in the original recovery flow, causing users to not receive their tickets
    let emailSent = false;
    try {
      const emailTickets = createdTickets.map((t: any) => ({
        id: t.id,
        qrCode: t.qr_code || "",
        attendeeName: t.attendee_name || user.first_name || "Guest",
      }));

      await sendTicketConfirmationEmail({
        userEmail: user.email,
        userName: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Customer",
        eventName: rsvp.events.name,
        eventDate: rsvp.events.starts_at || new Date().toISOString(),
        eventTimezone: rsvp.events.timezone || "America/Guayaquil",
        eventVenue: (rsvp.events as any).venue || "",
        ticketTierName: rsvp.ticket_tiers.name,
        quantity: quantity,
        totalAmount: 0, // Recovery implies free/paid order where amount is settled
        orderId: existingOrder.id,
        currency: rsvp.events.currency ?? "USD",
        tickets: emailTickets,
        isRsvpApproval: true, // RSVP-specific messaging
      });
      console.log("✅ Sent ticket confirmation email for recovered order");
      emailSent = true;
    } catch (emailErr) {
      console.error("Failed to send ticket confirmation email for recovered order:", emailErr);
      // Don't fail the operation if email fails
      emailSent = false;
    }

    console.log("✅ Successfully recovered order by creating tickets:", {
      rsvpId,
      orderId: existingOrder.id,
      ticketCount: createdTickets.length,
    });

    return { success: true, orderId: existingOrder.id, emailSent };
  } catch (recoveryError) {
    console.error("Exception during order recovery:", {
      rsvpId,
      orderId: existingOrder.id,
      error: recoveryError,
    });
    return {
      success: false,
      error:
        "Order exists but ticket recovery failed. Manual intervention required.",
      statusCode: 500,
    };
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { id: rsvpId } = await params;

    if (!userId || !supabaseAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user's Supabase ID and organization
    const { data: supabaseUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userError || !supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the RSVP and verify it belongs to the user's organization
    const { data: rsvp, error: rsvpError } = await supabaseAdmin
      .from("rsvps")
      .select(
        `
        *,
        users!rsvps_user_id_fkey (
          id,
          email,
          first_name,
          last_name
        ),
        events!inner (
          id,
          name,
          starts_at,
          venue,
          timezone,
          organization_id,
          currency
        ),
        ticket_tiers!inner (
          id,
          name,
          price_cents
        )
      `
      )
      .eq("id", rsvpId)
      .single();

    if (rsvpError || !rsvp) {
      return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
    }

    // Authorize: primary-org member, OR cohost org owner/admin (W3-B1)
    const authorized = await canManageEventRsvps(
      supabaseAdmin,
      supabaseUser.id,
      rsvp.events.organization_id,
      rsvp.events.id,
    );

    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized to manage this RSVP" },
        { status: 403 }
      );
    }

    // Note: Status check is done atomically in the update query below (lines 329-339) using .eq("status", "pending")
    // This prevents TOCTOU race conditions where two organizers approve the same RSVP simultaneously

    // Determine effective price for this RSVP (stage price or tier price)
    // CRITICAL: Validate that at least one price source is present
    if (
      rsvp.stage_price_cents === null &&
      rsvp.ticket_tiers.price_cents === null
    ) {
      console.error("CRITICAL: RSVP has no price source (neither stage nor tier price):", {
        rsvpId,
        stagePrice: rsvp.stage_price_cents,
        tierPrice: rsvp.ticket_tiers.price_cents
      });
      return NextResponse.json(
        { error: "Invalid RSVP configuration: Missing price information." },
        { status: 500 }
      );
    }
    
    // Check if this is a free promo RSVP (total_amount_cents explicitly set to 0)
    // This overrides the tier/stage price check
    const isFreePromo = rsvp.total_amount_cents === 0;
    
    const effectivePrice = isFreePromo 
      ? 0 
      : (rsvp.stage_price_cents ?? rsvp.ticket_tiers.price_cents ?? 0);

    // SECURITY: Verify paid RSVPs have a payment intent before approval
    // This prevents approving RSVPs where payment intent save failed but RSVP remained in pending status
    if (effectivePrice > 0 && !rsvp.stripe_payment_intent_id) {
      console.error(
        "SECURITY: Attempted to approve paid RSVP without payment intent:",
        {
          rsvpId,
          effectivePrice,
          stagePriceCents: rsvp.stage_price_cents,
          tierPriceCents: rsvp.ticket_tiers.price_cents,
        }
      );
      return NextResponse.json(
        {
          error:
            "Cannot approve: This is a paid RSVP but no payment authorization exists. The RSVP may need to be resubmitted.",
        },
        { status: 400 }
      );
    }

    // IMPORTANT: Order of operations to prevent race conditions with webhook
    // 1. Update RSVP status to "approved" FIRST
    // 2. Then capture payment (which triggers webhook)
    // This ensures the webhook always sees "approved" status when it runs
    // If payment capture fails, we roll back the status

    // Step 1: Approve the RSVP first (before payment capture)
    // Use atomic update with status check to prevent TOCTOU race condition
    // If two organizers click approve simultaneously, only one will succeed
    const { data: updatedRsvp, error: updateError } = await supabaseAdmin
      .from("rsvps")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: supabaseUser.id,
      })
      .eq("id", rsvpId)
      .eq("status", "pending") // Atomic: Only update if still pending
      .select()
      .maybeSingle(); // Use maybeSingle to handle case where no rows match (already processed)

    // Check if update affected any rows (RSVP was actually pending)
    if (!updatedRsvp && !updateError) {
      // No rows updated means RSVP was already processed by another request
      return NextResponse.json(
        { error: "RSVP has already been processed" },
        { status: 409 } // Conflict
      );
    }

    if (updateError) {
      console.error("Error approving RSVP:", updateError);
      return NextResponse.json(
        { error: "Failed to approve RSVP" },
        { status: 500 }
      );
    }

    // Step 2: Check for Stripe Payment Authorization (Auth & Capture Flow)
    // Now that status is "approved", the webhook will see the correct status
    // Gate Stripe path on effectivePrice > 0 to handle edge case where
    // free RSVP has a PaymentIntent ID (bad data) - prevents unnecessary capture attempts
    if (effectivePrice > 0 && rsvp.stripe_payment_intent_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          rsvp.stripe_payment_intent_id
        );

        // SECURITY: Validate PaymentIntent amount matches current effective price
        // This prevents price manipulation attacks where price changes between RSVP creation and approval
        
        // Calculate base expected amount
        let expectedAmountCents =
          effectivePrice * (rsvp.requested_quantity || 1);
          
        // Deduct any applied discount from metadata
        if (paymentIntent.metadata?.discountAmountCents) {
          const discountCents = parseInt(paymentIntent.metadata.discountAmountCents, 10);
          if (!isNaN(discountCents) && discountCents > 0) {
            expectedAmountCents = Math.max(0, expectedAmountCents - discountCents);
          } else if (isNaN(discountCents)) {
            console.warn("Invalid discountAmountCents in PaymentIntent metadata:", {
              rsvpId,
              paymentIntentId: rsvp.stripe_payment_intent_id,
              rawValue: paymentIntent.metadata.discountAmountCents,
            });
          }
        }
          
        // Note: PaymentIntent amount includes platform fee, so it must be at least the base amount (minus discount)
        // Reject if amount is less than expected base price (fee should make it equal or greater)
        if (paymentIntent.amount < expectedAmountCents) {
          console.error(
            "SECURITY: PaymentIntent amount is less than expected:",
            {
              rsvpId,
              paymentIntentAmount: paymentIntent.amount,
              expectedMinAmount: expectedAmountCents,
              effectivePrice,
              quantity: rsvp.requested_quantity,
            }
          );

          // Best-effort cancellation to release funds
          try {
            if (isCancellableStatus(paymentIntent.status)) {
              await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
              console.log(
                "Payment authorization cancelled due to amount mismatch:",
                rsvpId
              );
            }
          } catch (cancelError) {
            console.error(
              "Failed to cancel payment authorization after amount mismatch:",
              {
                rsvpId,
                paymentIntentId: rsvp.stripe_payment_intent_id,
                cancelError,
              }
            );
          }

          // Roll back approval
          const { error: rollbackError } = await rollbackApproval(rsvpId);

          if (rollbackError) {
            console.error(
              "CRITICAL: Rollback failed after amount validation failure:",
              {
                rsvpId,
                rollbackError,
                paymentIntentAmount: paymentIntent.amount,
                expectedAmountCents,
              }
            );
            return NextResponse.json(
              {
                error:
                  "Payment amount validation failed and rollback failed. Manual intervention required.",
                details: {
                  rsvpId,
                  paymentIntentAmount: paymentIntent.amount,
                  expectedAmountCents,
                },
              },
              { status: 500 }
            );
          }

          return NextResponse.json(
            {
              error:
                "Payment amount does not match current price. RSVP may need to be resubmitted.",
            },
            { status: 400 }
          );
        }

        // SECURITY: Verify PaymentIntent metadata.rsvpId matches current RSVP
        // This prevents attackers from capturing a different RSVP's payment
        const metadataRsvpId = paymentIntent.metadata?.rsvpId;

        // If metadata.rsvpId exists but doesn't match, reject (security issue)
        // If metadata.rsvpId is undefined, allow (backward compatibility for RSVPs created before metadata update)
        // Note: The RSVP->PaymentIntent link is already validated via database (we got the PI ID from the RSVP record)
        if (metadataRsvpId && metadataRsvpId !== String(rsvp.id)) {
          console.error(
            "SECURITY: PaymentIntent rsvpId mismatch - possible attack:",
            {
              rsvpId,
              metadataRsvpId,
              paymentIntentId: rsvp.stripe_payment_intent_id,
            }
          );

          // Best-effort cancellation to release funds
          try {
            if (isCancellableStatus(paymentIntent.status)) {
              await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
              console.log(
                "Payment authorization cancelled due to rsvpId mismatch:",
                rsvpId
              );
            }
          } catch (cancelError) {
            console.error(
              "Failed to cancel payment authorization after rsvpId mismatch:",
              {
                rsvpId,
                paymentIntentId: rsvp.stripe_payment_intent_id,
                cancelError,
              }
            );
          }

          // Roll back approval
          const { error: rollbackError } = await rollbackApproval(rsvpId);

          if (rollbackError) {
            console.error(
              "CRITICAL: Rollback failed after rsvpId validation failure:",
              {
                rsvpId,
                rollbackError,
                metadataRsvpId,
              }
            );
            return NextResponse.json(
              {
                error:
                  "Payment metadata validation failed and rollback failed. Manual intervention required.",
                details: {
                  rsvpId,
                  metadataRsvpId,
                },
              },
              { status: 500 }
            );
          }

          return NextResponse.json(
            {
              error:
                "Payment authorization does not match this RSVP. RSVP may need to be resubmitted.",
            },
            { status: 400 }
          );
        }

        // Log if metadata.rsvpId was missing (for monitoring)
        if (!metadataRsvpId) {
          console.warn(
            "PaymentIntent metadata.rsvpId is missing - likely created before metadata update implementation:",
            {
              rsvpId,
              paymentIntentId: rsvp.stripe_payment_intent_id,
            }
          );
        }

        if (paymentIntent.status === "requires_capture") {
          // IMPORTANT: DB status is already set to "approved" (lines 181-187)
          // Webhook will see "approved" status when it processes this PaymentIntent
          // Use idempotency key to prevent double-capture on network retries
          await stripe.paymentIntents.capture(
            rsvp.stripe_payment_intent_id,
            {},
            {
              idempotencyKey: `rsvp_approve_capture_${rsvpId}`,
            }
          );
          console.log("✅ Payment authorized and captured for RSVP:", {
            rsvpId,
            paymentIntentId: rsvp.stripe_payment_intent_id,
            rsvpStatus: "approved", // Already set before capture
            captureTriggeredBy: supabaseUser.id,
          });
        } else if (paymentIntent.status !== "succeeded") {
          // Payment can't be captured - roll back approval status
          console.error("Payment not capturable, rolling back approval:", {
            rsvpId,
            paymentStatus: paymentIntent.status,
          });

          // Cancel the authorization to release customer funds immediately
          // This prevents funds being held for up to 7 days
          // Note: Only certain statuses are cancellable
          // We use the already-retrieved paymentIntent above instead of re-retrieving
          try {
            if (isCancellableStatus(paymentIntent.status)) {
              await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
              console.log("Payment authorization cancelled for RSVP:", rsvpId);
            }
          } catch (cancelError) {
            console.error("Failed to cancel payment authorization:", {
              rsvpId,
              paymentIntentId: rsvp.stripe_payment_intent_id,
              cancelError,
            });
            // Continue with rollback even if cancel fails
          }

          const { error: rollbackError } = await rollbackApproval(rsvpId);

          if (rollbackError) {
            console.error("CRITICAL: Rollback failed after payment issue:", {
              rsvpId,
              rollbackError,
              paymentStatus: paymentIntent.status,
            });
            return NextResponse.json(
              {
                error:
                  "Payment cannot be captured and rollback failed. Manual intervention required.",
                details: { rsvpId, paymentStatus: paymentIntent.status },
              },
              { status: 500 }
            );
          }

          return NextResponse.json(
            {
              error: `Cannot approve: Payment authorization status is ${paymentIntent.status}`,
            },
            { status: 400 }
          );
        }
      } catch (stripeError) {
        // Payment capture may have failed - but check if it actually succeeded
        // This prevents incorrect rollbacks when capture succeeds but network fails
        console.error(
          "Stripe capture error - verifying actual payment status:",
          stripeError
        );

        // Re-retrieve PaymentIntent to check its actual status
        // This is critical to avoid rolling back a successful payment
        let finalPaymentIntent: Stripe.PaymentIntent | null = null;
        try {
          finalPaymentIntent = await stripe.paymentIntents.retrieve(
            rsvp.stripe_payment_intent_id
          );
          console.log("Re-retrieved PaymentIntent status:", {
            rsvpId,
            paymentIntentId: rsvp.stripe_payment_intent_id,
            status: finalPaymentIntent.status,
          });
        } catch (retrieveError) {
          console.error(
            "Failed to re-retrieve PaymentIntent after capture error:",
            {
              rsvpId,
              paymentIntentId: rsvp.stripe_payment_intent_id,
              retrieveError,
            }
          );
          // Continue without finalPaymentIntent - will handle below
        }

        // If PaymentIntent actually succeeded, don't rollback - return success
        if (finalPaymentIntent?.status === "succeeded") {
          console.log(
            "✅ PaymentIntent succeeded despite error - approval successful:",
            {
              rsvpId,
              paymentIntentId: rsvp.stripe_payment_intent_id,
              originalError:
                stripeError instanceof Error
                  ? stripeError.message
                  : String(stripeError),
            }
          );
          // Payment actually succeeded, so the approval is valid
          // Revalidate cache only - webhook will send ticket confirmation email
          revalidatePath("/organizer");

          return NextResponse.json({
            message: "RSVP approved successfully",
            rsvp: updatedRsvp,
          });
        }

        // Payment did NOT succeed - safe to rollback and cancel
        // Try to cancel the authorization to release customer funds
        // Only if the PaymentIntent is still in a cancellable state
        try {
          const currentIntent =
            finalPaymentIntent ||
            (await stripe.paymentIntents.retrieve(
              rsvp.stripe_payment_intent_id
            ));
          if (isCancellableStatus(currentIntent.status)) {
            await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
            console.log(
              "Payment authorization cancelled after confirmed capture failure:",
              rsvpId
            );
          }
        } catch (cancelError) {
          console.error("Failed to cancel payment authorization:", {
            rsvpId,
            paymentIntentId: rsvp.stripe_payment_intent_id,
            cancelError,
          });
          // Continue with rollback even if cancel fails
        }

        const { error: rollbackError } = await rollbackApproval(rsvpId);

        if (rollbackError) {
          console.error("CRITICAL: Rollback failed after capture failure:", {
            rsvpId,
            rollbackError,
            stripeError,
          });
          return NextResponse.json(
            {
              error:
                "Payment capture failed and rollback failed. Manual intervention required.",
              details: { rsvpId },
            },
            { status: 500 }
          );
        }

        return NextResponse.json(
          {
            error: "Failed to capture payment authorization",
            details:
              stripeError instanceof Error
                ? stripeError.message
                : "Unknown error",
          },
          { status: 500 }
        );
      }
    } else if (effectivePrice === 0) {
      // Handle free RSVP approval: Generate tickets immediately
      console.log("Approving free RSVP - creating tickets:", rsvpId);

      // CRITICAL: If RSVP has a PaymentIntent but price is now $0, cancel it to release customer funds
      // This handles the edge case where tier price changed to $0 after RSVP creation with payment authorization
      if (rsvp.stripe_payment_intent_id) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(
            rsvp.stripe_payment_intent_id
          );

          // Cancel the authorization if it's in a cancellable state
          // This prevents customer funds from being held for up to 7 days
          if (paymentIntent.status === "succeeded") {
            // Already captured - must refund
            await stripe.refunds.create({
              payment_intent: rsvp.stripe_payment_intent_id,
              reason: "requested_by_customer",
              reverse_transfer: true, // Ensure fees are returned from connected account
              metadata: {
                rsvpId,
                reason: "free_rsvp_approval_refund"
              }
            });
            console.log(
              "✅ Refunded succeeded PaymentIntent for free RSVP (tier price changed to $0):",
              {
                rsvpId,
                paymentIntentId: rsvp.stripe_payment_intent_id,
              }
            );
          } else if (isCancellableStatus(paymentIntent.status)) {
            await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
            console.log(
              "✅ Cancelled PaymentIntent for free RSVP (tier price changed to $0):",
              {
                rsvpId,
                paymentIntentId: rsvp.stripe_payment_intent_id,
                previousStatus: paymentIntent.status,
              }
            );
          } else {
            console.warn(
              "Free RSVP has PaymentIntent in non-cancellable state:",
              {
                rsvpId,
                paymentIntentId: rsvp.stripe_payment_intent_id,
                status: paymentIntent.status,
              }
            );
          }
        } catch (cancelError) {
          console.error("Failed to cancel PaymentIntent for free RSVP:", {
            rsvpId,
            paymentIntentId: rsvp.stripe_payment_intent_id,
            cancelError,
          });
          // Continue with approval even if cancel fails - the PaymentIntent will auto-release after 7 days
          // This is better than blocking the approval
        }
      }

      const quantity = rsvp.requested_quantity || 1;
      const unitPrice = 0;
      const subtotal = 0;

      // Fetch organization fee percent (even though fee is 0, we pass it for consistency)
      let feePercent = 0;
      try {
        const { data: org } = await supabaseAdmin
          .from("organizations")
          .select("platform_fee_percent")
          .eq("id", rsvp.events.organization_id)
          .single();
        feePercent = org?.platform_fee_percent ?? 0;
      } catch (err) {
        console.error("Error fetching org fee percent:", err);
      }

      // Create order and tickets using shared logic
      // Mock payment info for free order
      const idempotencyKey = `free_${rsvp.id}`;
      let orderCreated = false;
      let emailAlreadySent = false; // Track if recovery path already sent email

      // Extract promotional code ID from RSVP record (column) or registration data (legacy fallback)
      const promotionalCodeId = 
        (rsvp as any).promotional_code_id || 
        (rsvp.registration_data && 
        typeof rsvp.registration_data === 'object' && 
        '_promotional_code_id' in rsvp.registration_data 
          ? (rsvp.registration_data as any)._promotional_code_id 
          : undefined);

      // Pre-check: Handle case where order already exists from a previous partial failure
      // This prevents stuck state when order INSERT succeeds but ticket creation fails
      const { data: existingOrder, error: existingOrderError } =
        await supabaseAdmin
          .from("orders")
          .select("id, status")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

      // Check for database errors during the lookup
      if (existingOrderError) {
        console.error(
          "Error checking for existing order (idempotency key lookup):",
          {
            rsvpId,
            idempotencyKey,
            error: existingOrderError,
          }
        );
        // Return error to prevent silent failure and potential duplicate order creation
        return NextResponse.json(
          {
            error: "Failed to check for existing order. Please try again.",
            details: {
              rsvpId,
              reason: "database_lookup_error",
            },
          },
          { status: 500 }
        );
      }

      if (existingOrder) {
        console.log("Existing order found for free RSVP (idempotency retry):", {
          rsvpId,
          orderId: existingOrder.id,
          orderStatus: existingOrder.status,
        });

        // Check if tickets already exist for this order
        const { data: existingTickets, error: ticketsError } =
          await supabaseAdmin
            .from("tickets")
            .select("id")
            .eq("order_id", existingOrder.id)
            .limit(1);

        if (ticketsError) {
          console.error("Error checking for existing tickets:", ticketsError);
          // Continue to recovery logic (which handles ticket creation if missing)
        } else if (existingTickets && existingTickets.length > 0) {
          // Order and tickets already exist - this is a successful retry
          console.log("✅ Order and tickets already exist for free RSVP:", {
            rsvpId,
            orderId: existingOrder.id,
            hasTickets: true,
          });
          // Mark order as paid if it was in requires_manual_review status
          if (existingOrder.status === "requires_manual_review") {
            const { error: statusUpdateError } = await supabaseAdmin
              .from("orders")
              .update({ status: "paid" })
              .eq("id", existingOrder.id);

            if (statusUpdateError) {
              console.error(
                "Failed to update order status from requires_manual_review to paid:",
                {
                  rsvpId,
                  orderId: existingOrder.id,
                  error: statusUpdateError,
                }
              );
              // Don't fail the entire approval since tickets exist and RSVP is valid
              // Log error for monitoring but continue - order will remain in requires_manual_review
              // This is better than blocking the approval flow
            } else {
              console.log(
                "✅ Updated order status from requires_manual_review to paid:",
                {
                  rsvpId,
                  orderId: existingOrder.id,
                }
              );
            }
          }
          // Skip order creation - proceed to update RSVP status
          orderCreated = true;
        } else {
          // Order exists but no tickets - this is the stuck state
          // Use recovery helper to attempt ticket creation
          const recoveryResult = await recoverExistingOrderForFreeRsvp({
            rsvpId,
            existingOrder,
            rsvp,
            quantity,
          });

          if (!recoveryResult.success) {
            return NextResponse.json(
              {
                error: recoveryResult.error,
                details: {
                  rsvpId,
                  orderId: existingOrder.id,
                  reason: "recovery_failed",
                },
              },
              { status: recoveryResult.statusCode }
            );
          }

          orderCreated = true;
          // Track if recovery already sent the email to prevent duplicate
          emailAlreadySent = recoveryResult.emailSent || false;
        }
      }

      // Only attempt order creation if no existing order was found
      if (!orderCreated) {
        try {
          orderCreated = await createOrder(
            rsvp.user_id,
            rsvp.event_id,
            rsvp.events.organization_id,
            rsvp.ticket_tier_id,
            quantity,
            unitPrice,
            subtotal,
            {
              id: idempotencyKey, // Unique idempotency key per free RSVP to prevent constraint violations
              amount: 0,
              currency: (rsvp.events?.currency ?? "USD").toLowerCase(),
              payment_method: "free",
              payment_provider: "free",
              metadata: {
                rsvpId: rsvp.id,
                eventId: rsvp.event_id,
                ticketTierId: rsvp.ticket_tier_id,
                quantity: String(quantity),
                feePercent: String(feePercent),
                promotionalCodeId: promotionalCodeId,
              },
            },
            "rsvp",
            rsvp.stage_id,
            rsvp.ticket_tiers.name,
            rsvp.events.name,
            feePercent
          );
        } catch (createOrderError) {
          // Check if error is due to duplicate idempotency key
          if (
            createOrderError &&
            typeof createOrderError === "object" &&
            "code" in createOrderError &&
            createOrderError.code === "23505"
          ) {
            // Unique constraint violation - order already exists
            // This shouldn't happen due to our pre-check, but handle it gracefully
            console.warn("Duplicate order detected during createOrder call:", {
              rsvpId,
              idempotencyKey,
            });
            // Try to fetch the existing order and check tickets
            const { data: duplicateOrder } = await supabaseAdmin
              .from("orders")
              .select("id, status")
              .eq("idempotency_key", idempotencyKey)
              .single();

            if (duplicateOrder) {
              const { data: duplicateTickets } = await supabaseAdmin
                .from("tickets")
                .select("id")
                .eq("order_id", duplicateOrder.id)
                .limit(1);

              if (duplicateTickets && duplicateTickets.length > 0) {
                // Order and tickets exist - success
                console.log(
                  "✅ Duplicate order has tickets - treating as success:",
                  {
                    rsvpId,
                    orderId: duplicateOrder.id,
                  }
                );
                orderCreated = true;
              } else {
                // Order exists but no tickets - stuck state
                console.error("Duplicate order exists but no tickets:", {
                  rsvpId,
                  orderId: duplicateOrder.id,
                });

                // Attempt recovery for duplicate order without tickets
                const recoveryResult = await recoverExistingOrderForFreeRsvp({
                  rsvpId,
                  existingOrder: duplicateOrder,
                  rsvp,
                  quantity,
                });

                if (recoveryResult.success) {
                  console.log(
                    "✅ Recovered duplicate order by creating tickets:",
                    {
                      rsvpId,
                      orderId: duplicateOrder.id,
                    }
                  );
                  orderCreated = true;
                  // Track if recovery already sent the email to prevent duplicate
                  emailAlreadySent = recoveryResult.emailSent || false;
                } else {
                  console.error(
                    "Failed to recover duplicate order:",
                    recoveryResult.error
                  );
                  orderCreated = false;
                }
              }
            } else {
              orderCreated = false;
            }
          } else {
            console.error("Exception creating order for free RSVP:", {
              rsvpId,
              error: createOrderError,
            });
            orderCreated = false;
          }
        }
      }

      if (!orderCreated) {
        console.error("Failed to create order/tickets for free RSVP:", rsvpId);
        // Rollback approval
        const { error: rollbackError } = await rollbackApproval(rsvpId);

        if (rollbackError) {
          console.error(
            "CRITICAL: Rollback failed after free RSVP order creation failure:",
            {
              rsvpId,
              rollbackError,
            }
          );
          return NextResponse.json(
            {
              error:
                "Failed to generate tickets for free RSVP and rollback failed. Manual intervention required.",
              details: { rsvpId },
            },
            { status: 500 }
          );
        }

        return NextResponse.json(
          { error: "Failed to generate tickets for free RSVP" },
          { status: 500 }
        );
      }

      console.log("✅ Tickets created for free RSVP:", rsvpId);

      // Update RSVP status to "purchased" for consistency with paid flow
      // This mirrors the webhook behavior for paid RSVPs
      // Use optimistic locking to ensure RSVP is still in approved state
      const { error: rsvpUpdateError } = await supabaseAdmin
        .from("rsvps")
        .update({
          status: "purchased",
          purchased_at: new Date().toISOString(),
        })
        .eq("id", rsvpId)
        .eq("status", "approved"); // Optimistic lock for consistency

      if (rsvpUpdateError) {
        console.error("Failed to update free RSVP status to purchased:", {
          rsvpId,
          error: rsvpUpdateError,
        });
        // Don't fail the entire approval since tickets were already created
        // The RSVP will remain in "approved" state, which is acceptable
        // Log for monitoring: RSVPs stuck in "approved" vs "purchased" could cause confusion in reporting
        try {
          await supabaseAdmin.from("order_errors").insert({
            order_id: null,
            error_type: "rsvp_status_update_failed",
            error_message:
              "Tickets created but RSVP status update to 'purchased' failed",
            error_details: {
              rsvpId,
              currentStatus: "approved",
              expectedStatus: "purchased",
              error: rsvpUpdateError.message || String(rsvpUpdateError),
            },
            severity: "medium",
          });
        } catch (logError) {
          console.error("Failed to log order error:", logError);
        }
        console.warn(
          "RSVP status update to 'purchased' failed - logged to order_errors:",
          {
            rsvpId,
            currentStatus: "approved",
            expectedStatus: "purchased",
            error: rsvpUpdateError.message || String(rsvpUpdateError),
            note: "Tickets were created successfully, but RSVP status update failed",
          }
        );
      } else if (updatedRsvp) {
        // Status update succeeded - update local object for response consistency
        updatedRsvp.status = "purchased";
        updatedRsvp.purchased_at = new Date().toISOString();
      }

      // Send ticket confirmation email with QR codes
      // This is required for event entry (approval email alone is not enough)
      // Skip if recovery path already sent the email to prevent duplicates
      if (!emailAlreadySent) {
        if (!rsvp.users?.email) {
          console.warn("Skipping ticket email — no user email for RSVP", {
            rsvpId,
            orderId: idempotencyKey, // Using idempotencyKey as proxy for order reference since we fetch by it
          });
        } else {
          try {
            // Fetch the created tickets
            // We need to fetch them because createOrder returns boolean, not the tickets
            // And for existing orders, we need the tickets anyway
            const { data: order } = await supabaseAdmin
              .from("orders")
              .select("id")
              .eq("idempotency_key", idempotencyKey)
              .single();
              
            if (order) {
              const { data: tickets } = await supabaseAdmin
                .from("tickets")
                .select("id, qr_code, attendee_name")
                .eq("order_id", order.id);
                
              if (tickets && tickets.length > 0) {
                const emailTickets = tickets.map((t: any) => ({
                  id: t.id,
                  qrCode: t.qr_code || "",
                  attendeeName: t.attendee_name || rsvp.users?.first_name || "Guest",
                }));

                const userName = rsvp.users?.first_name 
                  ? `${rsvp.users.first_name} ${rsvp.users.last_name || ""}`.trim()
                  : rsvp.users?.email || "Customer";

                await sendTicketConfirmationEmail({
                  userEmail: rsvp.users.email,
                  userName: userName,
                  eventName: rsvp.events.name,
                  eventDate: rsvp.events.starts_at || new Date().toISOString(),
                  eventTimezone: rsvp.events.timezone || "America/Guayaquil",
                  eventVenue: rsvp.events.venue || "",
                  ticketTierName: rsvp.ticket_tiers.name,
                  quantity: quantity,
                  totalAmount: 0, // Free RSVP
                  orderId: order.id,
                  currency: rsvp.events.currency ?? "USD",
                  tickets: emailTickets,
                  isRsvpApproval: true, // RSVP-specific messaging
                });
                console.log("✅ Sent ticket confirmation email for free RSVP approval");
              } else {
                console.warn("Tickets not found for sending confirmation email:", order.id);
              }
            }
          } catch (emailErr) {
            console.error("Failed to send ticket confirmation email for free RSVP:", emailErr);
            // Don't fail the approval, just log error
          }
        }
      } else {
        console.log("Skipping ticket confirmation email (already sent by recovery path):", rsvpId);
      }
    }

    // Get organization name
    const { data: organization, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", rsvp.events.organization_id)
      .single();

    // Revalidate cache only - do NOT send approval email here
    // IMPORTANT: The ticket confirmation email (with PDF, cost breakdown, promo discounts) is sent by:
    // - Free RSVPs: Sent above in this route (lines 1149-1195)
    // - Paid RSVPs: Sent by Stripe webhook → createOrder() in app/lib/orders.ts
    // Sending sendRsvpApprovalEmail() here would result in duplicate emails for the user
    console.log("Skipping approval email (ticket confirmation email handles all communication):", rsvpId);
    revalidatePath("/organizer");

    sendPushNotification({
      userId: rsvp.user_id,
      type: "rsvp_approved",
      title: "RSVP Approved!",
      body: `Your RSVP for ${rsvp.events.name} was approved. Your tickets are ready!`,
      data: { deepLink: "/(tabs)/my-tickets", eventId: rsvp.events.id },
    }).catch((err) => console.error("[push] rsvp_approved failed:", err));

    return NextResponse.json({
      message: "RSVP approved successfully",
      rsvp: updatedRsvp,
    });
  } catch (error) {
    console.error("❌ RSVP approval API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
