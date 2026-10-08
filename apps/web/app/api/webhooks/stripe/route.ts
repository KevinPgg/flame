import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { revalidatePath } from "next/cache";
import { stripe } from "../../../lib/stripe/stripe"; // Use shared client
import { createOrder } from "../../../lib/orders";

const DEFAULT_FEE_PERCENT = 12.5;

// Type definitions for RSVP and Hold records with relations
interface RsvpWithRelations {
  id: string;
  user_id: string;
  event_id: string;
  ticket_tier_id: string;
  requested_quantity: number | null;
  status: string;
  stage_price_cents: number | null;
  stage_id: string | null;
  stripe_payment_intent_id: string;
  metadata?: Record<string, unknown>;
  // Pricing fields for promo code support
  base_price_cents: number | null; // Total base price after discount (quantity * unit - discount)
  total_amount_cents: number | null; // Total amount including fees
  markup_percent: number | null;
  markup_fixed_cents: number | null;
  ticket_tiers: {
    name: string;
    price_cents: number;
  };
  events: {
    name: string;
    organization_id: string;
    slug?: string;
  };
  users?: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

interface HoldWithRelations {
  id: string;
  user_id: string;
  event_id: string;
  tier_id: string;
  quantity: number;
  stage_price_cents: number | null;
  stage_id: string | null;
  ticket_tiers: {
    name: string;
    price_cents: number;
  };
  events: {
    name: string;
    organization_id: string;
    slug?: string;
  };
  users?: {
    email: string;
  };
}

function getEndpointSecret() {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET environment variable is not configured"
    );
  }
  return process.env.STRIPE_WEBHOOK_SECRET;
}

import { SAFE_METADATA_KEYS, redactMetadata } from "../../../lib/stripe/webhook-utils";

// Redact sensitive PII from Stripe event before storing for compliance
function redactEventData(event: Stripe.Event): Record<string, any> {
  // Filter metadata to only include whitelisted keys (prevent PII leakage)
  const rawMetadata = (event.data.object as any).metadata || {};
  const safeMetadata = redactMetadata(rawMetadata);

  const redacted = {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    // Store only essential non-sensitive data from the event
    data: {
      object: {
        id: (event.data.object as any).id,
        object: (event.data.object as any).object,
        amount: (event.data.object as any).amount,
        currency: (event.data.object as any).currency,
        status: (event.data.object as any).status,
        // Store only whitelisted metadata keys (filtered above to prevent PII)
        metadata: safeMetadata,
        // Redact customer PII - store only the ID for reference
        customer: typeof (event.data.object as any).customer === 'string' 
          ? (event.data.object as any).customer 
          : (event.data.object as any).customer?.id || null,
        // Note: Payment method details are already tokenized by Stripe
        // We only store the ID, not raw card data
        payment_method: typeof (event.data.object as any).payment_method === 'string'
          ? (event.data.object as any).payment_method
          : null,
      },
    },
  };
  return redacted;
}

// Helper function to log payment intent events to audit table
async function logPaymentIntentAudit(
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  if (!supabaseAdmin) {
    console.error(
      "Cannot log payment intent audit: Database connection unavailable",
      {
        eventId: event.id,
        paymentIntentId: paymentIntent.id,
      }
    );
    return;
  }

  try {
    // Extract metadata fields
    const rawMetadata = paymentIntent.metadata || {};
    
    // Filter metadata to only include allowed keys (prevent PII leakage)
    const safeMetadata = redactMetadata(rawMetadata);

    const {
      holdId,
      rsvpId,
      eventId,
      organizationId,
      userId,
      basePriceCents,
      platformFeeCents,
      markupPercent,
      markupFixedCents,
    } = rawMetadata;

    // Extract transfer data if present
    const transferData = paymentIntent.transfer_data as
      | { destination?: string; amount?: number }
      | undefined;

    // Parse numeric fields safely to avoid NaN in database
    const parseIntSafe = (value: string | undefined | null): number | null => {
      if (value == null) return null;
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const parseFloatSafe = (value: string | undefined | null): number | null => {
      if (value == null) return null;
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const auditRecord = {
      stripe_payment_intent_id: paymentIntent.id,
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      amount_cents: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      capture_method: paymentIntent.capture_method,
      metadata: safeMetadata,
      hold_id: holdId || null,
      rsvp_id: rsvpId || null,
      user_id: userId || null,
      event_id: eventId || null,
      organization_id: organizationId || null,
      base_price_cents: parseIntSafe(basePriceCents),
      platform_fee_cents: parseIntSafe(platformFeeCents),
      markup_percent: parseFloatSafe(markupPercent),
      markup_fixed_cents: parseIntSafe(markupFixedCents),
      transfer_destination: transferData?.destination || null,
      transfer_amount_cents: transferData?.amount ?? null,
      last_payment_error: paymentIntent.last_payment_error?.message || null,
      cancellation_reason: paymentIntent.cancellation_reason || null,
      stripe_created_at: new Date(paymentIntent.created * 1000).toISOString(),
      // Store redacted event data to comply with data retention policies
      // Removes sensitive PII while keeping essential debugging info
      raw_event_data: redactEventData(event),
    };

    const { error } = await supabaseAdmin
      .from("stripe_payment_audit")
      .insert(auditRecord);

    if (error) {
      console.error("Failed to insert payment intent audit log:", {
        eventId: event.id,
        paymentIntentId: paymentIntent.id,
        error,
      });
    } else {
      console.log(
        `✅ Logged payment intent audit: ${paymentIntent.id} (${event.type})`
      );
    }
  } catch (err) {
    console.error("Exception logging payment intent audit:", {
      eventId: event.id,
      paymentIntentId: paymentIntent.id,
      error: err,
    });
  }
}

// Helper function to link order to audit log after successful order creation
async function linkOrderToAuditLog(paymentIntentId: string): Promise<void> {
  if (!supabaseAdmin) {
    console.error(
      "Cannot link order to audit log: Database connection unavailable",
      { paymentIntentId }
    );
    return;
  }

  try {
    // Find the order that was created for this payment intent
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();

    if (orderError) {
      console.error("Error looking up order for audit link:", {
        paymentIntentId,
        error: orderError,
      });
      // Skip update if lookup failed
      return;
    }

    if (order) {
      // Update all audit records for this payment intent with the order ID
      const { error: updateError } = await supabaseAdmin
        .from("stripe_payment_audit")
        .update({ order_id: order.id })
        .eq("stripe_payment_intent_id", paymentIntentId)
        .is("order_id", null); // Only update records without order_id

      if (updateError) {
        console.error("Failed to link order to audit log:", {
          paymentIntentId,
          orderId: order.id,
          error: updateError,
        });
      } else {
        console.log(
          `✅ Linked order ${order.id} to audit log for payment intent ${paymentIntentId}`
        );
      }
    }
  } catch (err) {
    console.error("Exception linking order to audit log:", {
      paymentIntentId,
      error: err,
    });
  }
}

// Helper function to get fee percent from PaymentIntent metadata or organization
async function getFeePercent(
  paymentIntent: Stripe.PaymentIntent,
  organizationId: string,
  context: { type: "rsvp" | "hold"; id: string }
): Promise<number> {
  // Try metadata first
  if (paymentIntent.metadata?.feePercent) {
    const feePercent = parseFloat(paymentIntent.metadata.feePercent);
    if (!isNaN(feePercent)) return feePercent;
  }

  // Fallback to organization
  try {
    if (!supabaseAdmin) {
      console.error("Database connection error in getFeePercent");
      // Use documented fallback instead of 0 to avoid dropping fees on db error
      return DEFAULT_FEE_PERCENT;
    }

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("platform_fee_percent")
      .eq("id", organizationId)
      .single();

    if (orgError) {
      console.error("Error fetching org fee percent:", {
        organizationId,
        context,
        paymentIntentId: paymentIntent.id,
        error: orgError,
      });
      return DEFAULT_FEE_PERCENT;
    }

    return org?.platform_fee_percent ?? DEFAULT_FEE_PERCENT;
  } catch (err) {
    console.error("CRITICAL: Error fetching org fee percent - using 12.5% fallback:", {
      organizationId,
      context,
      paymentIntentId: paymentIntent.id,
      error: err,
    });
    // Use documented fallback instead of 0 to avoid dropping fees
    return DEFAULT_FEE_PERCENT;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig) {
    console.error("Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const endpointSecret = getEndpointSecret();
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  console.log("Received Stripe webhook:", event.type, event.id);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(
          event,
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(
          event,
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case "payment_intent.canceled":
        await handlePaymentIntentCanceled(
          event,
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case "payment_intent.amount_capturable_updated":
        await handlePaymentIntentAmountCapturableUpdated(
          event,
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent
) {
  console.log("Processing succeeded payment intent:", paymentIntent.id);

  // Log to audit table (non-blocking)
  await logPaymentIntentAudit(event, paymentIntent);

  if (!supabaseAdmin) {
    console.error("CRITICAL: Database connection error in webhook handler", {
      paymentIntentId: paymentIntent.id,
      handler: "handlePaymentIntentSucceeded",
    });
    // Throw error to return 500 and trigger Stripe retry
    throw new Error("Database connection not available");
  }

  // Check if order already exists (idempotency guard)
  const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  // Handle database errors (non-"not found" errors)
  if (existingOrderError && existingOrderError.code !== "PGRST116") {
    console.error(
      "Database error checking for existing order - returning 500 for Stripe retry:",
      {
        paymentIntentId: paymentIntent.id,
        error: existingOrderError,
      }
    );
    // Throw error to trigger 500 response, so Stripe will retry
    throw new Error(
      `Database error during idempotency check: ${existingOrderError.message}`
    );
  }

  if (existingOrder) {
    console.log("Order already exists for PI:", paymentIntent.id);
    // Link the existing order to any audit records that don't have an order_id yet
    await linkOrderToAuditLog(paymentIntent.id);
    return;
  }

  // Use optional chaining for metadata access - metadata may be undefined if PI created from different flow
  const metadata = paymentIntent.metadata || {};
  const {
    holdId,
    eventId,
    organizationId,
    feePercent,
    basePriceCents,
    platformFeeCents,
  } = metadata;

  // Handle promotional code usage increment
  // REMOVED: This logic was moved to createOrder() to prevent double counting
  // The webhook calls createOrder() which now handles the increment safely


  // Validate metadata completeness for hold-based payments
  if (holdId) {
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    // Check required companion fields for hold-based processing
    if (!eventId) missingFields.push("eventId");
    if (!organizationId) missingFields.push("organizationId");

    // Validate numeric fields are parseable
    if (feePercent !== undefined && feePercent !== null) {
      const parsed = parseFloat(feePercent);
      if (isNaN(parsed)) {
        invalidFields.push(`feePercent (value: ${feePercent})`);
      }
    }
    if (basePriceCents !== undefined && basePriceCents !== null) {
      const parsed = parseInt(basePriceCents, 10);
      if (isNaN(parsed)) {
        invalidFields.push(`basePriceCents (value: ${basePriceCents})`);
      }
    }
    if (platformFeeCents !== undefined && platformFeeCents !== null) {
      const parsed = parseInt(platformFeeCents, 10);
      if (isNaN(parsed)) {
        invalidFields.push(`platformFeeCents (value: ${platformFeeCents})`);
      }
    }

    // Log errors if metadata is incomplete or malformed
    if (missingFields.length > 0 || invalidFields.length > 0) {
      console.error("Invalid metadata for hold-based PaymentIntent:", {
        paymentIntentId: paymentIntent.id,
        holdId,
        missingFields: missingFields.length > 0 ? missingFields : undefined,
        invalidFields: invalidFields.length > 0 ? invalidFields : undefined,
        metadata,
      });

      // Create ghost order for tracking and attempt refund
      try {
        const { data: ghostOrder, error: ghostOrderError } = await supabaseAdmin
          .from("orders")
          .insert({
            user_id: null,
            organization_id: organizationId || null,
            event_id: eventId || null,
            ticket_tier_id: null,
            quantity: 1,
            unit_price_cents: 0,
            subtotal_cents: paymentIntent.amount, // Ensure subtotal + fees = total (fees=0 here)
            fees_cents: 0,
            total_cents: paymentIntent.amount,
            total_amount_cents: paymentIntent.amount,
            platform_fee_cents: 0,
            stripe_payment_intent_id: paymentIntent.id,
            status: "requires_manual_review",
            payment_method: "stripe",
            payment_provider: "stripe",
            idempotency_key: paymentIntent.id,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        // Explicitly check ghostOrder was created successfully
        if (ghostOrderError || !ghostOrder) {
          console.error(
            "CRITICAL: Failed to create ghost order for invalid metadata:",
            {
              paymentIntentId: paymentIntent.id,
              error: ghostOrderError,
            }
          );
          // Cannot proceed with error tracking or refund without order ID
          // Log alert for manual intervention
          console.error(
            "ALERT: Payment captured but unable to create tracking order:",
            {
              paymentIntentId: paymentIntent.id,
              amount: paymentIntent.amount,
              metadata,
            }
          );
          return;
        }

        // Only proceed with error tracking if we have a valid order ID
        await supabaseAdmin.from("order_errors").insert({
          order_id: ghostOrder.id,
          error_type: "invalid_payment_intent_metadata",
          error_message: "PaymentIntent has incomplete or malformed metadata",
          error_details: {
            paymentIntentId: paymentIntent.id,
            holdId,
            missingFields,
            invalidFields,
            metadata,
          },
          severity: "critical",
        });

        console.log("Ghost order created for invalid metadata:", ghostOrder.id);

        // Refund the captured payment since we can't process it properly
        try {
          const refund = await stripe.refunds.create(
            {
              payment_intent: paymentIntent.id,
              reverse_transfer: paymentIntent.transfer_data ? true : undefined, // Only reverse transfer if one exists
              reason: "requested_by_customer",
              metadata: {
                reason: "invalid_metadata_ghost_order",
                ghost_order_id: ghostOrder.id,
              },
            },
            {
              idempotencyKey: `invalid_metadata_refund_${paymentIntent.id}`,
            }
          );

          console.log("Refunded ghost order payment:", {
            paymentIntentId: paymentIntent.id,
            refundId: refund.id,
            amount: refund.amount,
            ghostOrderId: ghostOrder.id,
          });

          // Update the ghost order with refund details
          await supabaseAdmin
            .from("orders")
            .update({
              status: "refunded",
              refund_id: refund.id,
              refunded_at: new Date().toISOString(),
              error_details: {
                refund_reason: "invalid_metadata_ghost_order",
                refund_id: refund.id,
                refund_amount: refund.amount,
              },
            })
            .eq("id", ghostOrder.id);

          console.log("Updated ghost order with refund details:", ghostOrder.id);
        } catch (refundError) {
          console.error("CRITICAL: Failed to refund ghost order payment:", {
            paymentIntentId: paymentIntent.id,
            ghostOrderId: ghostOrder.id,
            error:
              refundError instanceof Error
                ? refundError.message
                : String(refundError),
          });
          // Log to order_errors for manual intervention
          await supabaseAdmin.from("order_errors").insert({
            order_id: ghostOrder.id,
            error_type: "refund_failed_for_ghost_order",
            error_message: `Failed to refund payment for ghost order: ${refundError instanceof Error ? refundError.message : String(refundError)}`,
            error_details: {
              paymentIntentId: paymentIntent.id,
              ghostOrderId: ghostOrder.id,
              refundError:
                refundError instanceof Error
                  ? refundError.message
                  : String(refundError),
            },
            severity: "critical",
          });
        }
      } catch (trackingErr) {
        console.error(
          "Failed to create tracking record for invalid metadata:",
          {
            paymentIntentId: paymentIntent.id,
            trackingErr,
          }
        );
      }

      // Skip hold-based processing due to invalid metadata
      console.log("Skipping hold-based processing due to invalid metadata");
      return;
    }
  }

  if (!holdId) {
    // Might be an RSVP flow update?
    // If RSVP exists with this PI, we should update it to 'purchased' if not already?
    // RSVP Auth & Capture Flow:
    // 1. Request -> PI (Manual) -> RSVP (Pending).
    // 2. Approve -> Capture -> PI (Succeeded).
    // 3. Webhook -> Update RSVP to Purchased?
    // Actually, 'approved' RSVP is waiting for user to use the token?
    // No, 'approve' triggers capture. So the money is taken.
    // The user should get the ticket.
    // In the new "Auth & Capture" flow, "Approval" IS the purchase completion.
    // So we should generate tickets and set status to "purchased".

    // Let's check if there is an RSVP with this PI
    // Use inner joins (!inner) to ensure we fail fast if related records are missing
    // This prevents processing incomplete data where event/tier was deleted mid-payment
    // Specify exact foreign key relationship for users to avoid ambiguity
    const { data: rsvp, error: rsvpLookupError } = await supabaseAdmin
      .from("rsvps")
      .select("*, ticket_tiers!inner(*), events!inner(*), users!rsvps_user_id_fkey(*)")
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .single();

    // Handle RSVP lookup errors (PGRST116 means not found, which is acceptable)
    if (rsvpLookupError && rsvpLookupError.code !== "PGRST116") {
      console.error(
        "CRITICAL: Database error looking up RSVP for PaymentIntent - will retry:",
        {
          paymentIntentId: paymentIntent.id,
          error: rsvpLookupError,
        }
      );
      // IMPORTANT: We're in the no-holdId block, so there's no hold to fall back to.
      // If we don't throw here, customer gets charged without tickets and Stripe won't retry.
      // Throw error to return 500 and trigger Stripe's automatic retry mechanism.
      throw new Error(
        `Database error during RSVP lookup: ${rsvpLookupError.message}`
      );
    }

    if (rsvp) {
      console.log("Found RSVP for PI:", paymentIntent.id);
      // Generate Order & Tickets for RSVP
      await createOrderAndTicketsFromRsvp(rsvp, paymentIntent);
      return;
    }

    console.log("No Hold ID or RSVP found for PI:", paymentIntent.id);
    
    // CRITICAL: Orphaned PaymentIntent - no associated hold or RSVP
    // This indicates a payment was captured but we can't link it to any order/RSVP
    // Log error and refund immediately to prevent customer loss
    try {
      // Log to order_errors for ops reconciliation
      // Capture the inserted row's id to safely update it later
      const { data: insertedError, error: errorLogError } = await supabaseAdmin
        .from("order_errors")
        .insert({
          order_id: null,
          error_type: "orphaned_payment_intent_no_hold_or_rsvp",
          error_message: `PaymentIntent ${paymentIntent.id} has no associated hold or RSVP`,
          error_details: {
            payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            customer_id: paymentIntent.customer || null,
            metadata: paymentIntent.metadata,
          },
          severity: "critical",
        })
        .select("id")
        .single();

      if (errorLogError) {
        console.error("Failed to log orphaned PaymentIntent error:", errorLogError);
      }

      // Create refund for the orphaned payment
      // Use idempotency key to prevent duplicate refunds on webhook retries
      const refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntent.id,
          reverse_transfer: paymentIntent.transfer_data ? true : undefined, // Only reverse transfer if one exists
          reason: "requested_by_customer",
        },
        {
          idempotencyKey: `orphaned_refund_${paymentIntent.id}`,
        }
      );

      console.log("Refunded orphaned PaymentIntent:", {
        paymentIntentId: paymentIntent.id,
        refundId: refund.id,
        amount: refund.amount,
      });

      // Update order_errors with refund ID for reconciliation
      // Use the inserted row's id to safely update only the row we just created
      if (!errorLogError && insertedError) {
        await supabaseAdmin
          .from("order_errors")
          .update({
            error_details: {
              payment_intent_id: paymentIntent.id,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency,
              customer_id: paymentIntent.customer || null,
              metadata: paymentIntent.metadata,
              refund_id: refund.id,
              refund_amount: refund.amount,
            },
          })
          .eq("id", insertedError.id);
      }
    } catch (refundError) {
      console.error("CRITICAL: Failed to refund orphaned PaymentIntent:", {
        paymentIntentId: paymentIntent.id,
        error: refundError instanceof Error ? refundError.message : String(refundError),
      });
      // Re-throw to trigger Stripe retry mechanism
      throw new Error(
        `Failed to process orphaned PaymentIntent ${paymentIntent.id}: ${refundError instanceof Error ? refundError.message : String(refundError)}`
      );
    }
    
    return;
  }

  // Direct Purchase via Hold
  // Fetch Hold with error handling
  // Use inner joins (!inner) to ensure we fail fast if related records are missing
  // This prevents processing incomplete data where event/tier was deleted mid-payment
  // Specify exact foreign key relationship for users to avoid ambiguity
  const { data: hold, error: holdError } = await supabaseAdmin
    .from("holds")
    .select("*, ticket_tiers!inner(*), events!inner(*), users!holds_user_id_fkey(*)")
    .eq("id", holdId)
    .single();

  if (holdError || !hold) {
    // CRITICAL: Payment was captured but we can't find the hold
    // This means customer was charged but we can't create their order
    // Log to order_errors for reconciliation and attempt refund
    console.error("CRITICAL: Hold not found after payment capture:", {
      holdId,
      paymentIntentId: paymentIntent.id,
      error: holdError,
      amount: paymentIntent.amount,
    });

    // Create a "ghost" order record for tracking/reconciliation
    // This ensures we have a record of the payment even without the hold
    try {
      const { data: ghostOrder, error: ghostOrderError } = await supabaseAdmin
        .from("orders")
        .insert({
          user_id: paymentIntent.metadata?.userId || null,
          organization_id: paymentIntent.metadata?.organizationId || null,
          event_id: paymentIntent.metadata?.eventId || null,
          ticket_tier_id: paymentIntent.metadata?.ticketTierId || null,
          quantity: parseInt(paymentIntent.metadata?.quantity || "1", 10),
          unit_price_cents: 0,
          subtotal_cents: paymentIntent.amount, // Ensure subtotal + fees = total (fees=0 here)
          fees_cents: 0,
          total_cents: paymentIntent.amount,
          total_amount_cents: paymentIntent.amount,
          platform_fee_cents: 0,
          stripe_payment_intent_id: paymentIntent.id,
          status: "requires_manual_review",
          payment_method: "stripe",
          payment_provider: "stripe",
          idempotency_key: paymentIntent.id,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      // Explicitly check ghostOrder was created successfully
      if (ghostOrderError || !ghostOrder) {
        console.error(
          "CRITICAL: Failed to create ghost order for missing hold:",
          {
            holdId,
            paymentIntentId: paymentIntent.id,
            error: ghostOrderError,
          }
        );
        // Cannot proceed with refund or error tracking without order ID
        // Log alert for manual intervention
        console.error(
          "ALERT: Payment captured, hold missing, and unable to create tracking order:",
          {
            holdId,
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            metadata: paymentIntent.metadata,
          }
        );
        return;
      }

      console.log("Created ghost order for reconciliation:", ghostOrder.id);

      // Log to order_errors for ops tracking - only if we have valid order ID
      await supabaseAdmin.from("order_errors").insert({
        order_id: ghostOrder.id,
        error_type: "hold_not_found",
        error_message:
          "Payment captured but hold was not found (possibly expired during checkout)",
        error_details: {
          holdId,
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          metadata: paymentIntent.metadata,
          holdError: holdError?.message || "Hold not found",
          refund_status: "pending_automated_refund",
        },
        severity: "critical",
      });

      // Attempt automated refund - only if we have valid order ID
      try {
        await stripe.refunds.create(
          {
            payment_intent: paymentIntent.id,
            reverse_transfer: paymentIntent.transfer_data ? true : undefined, // Only reverse transfer if one exists
            // Reason omitted - defaults to "requested_by_customer" which is appropriate for fulfillment failures
          },
          {
            idempotencyKey: `missing_hold_refund_${paymentIntent.id}`,
          }
        );

        // Update order status to refunded - we know ghostOrder.id exists here
        await supabaseAdmin
          .from("orders")
          .update({ status: "refunded" })
          .eq("id", ghostOrder.id);

        console.log(
          "✅ Automated refund processed for ghost order:",
          ghostOrder.id
        );
      } catch (refundError) {
        console.error(
          "❌ Failed to process automated refund for ghost order:",
          {
            orderId: ghostOrder.id,
            error: refundError,
          }
        );
        // Log refund failure - we know ghostOrder.id exists here
        await supabaseAdmin.from("order_errors").insert({
          order_id: ghostOrder.id,
          error_type: "automated_refund_failed",
          error_message: "Failed to process automated refund for ghost order",
          error_details: {
            paymentIntentId: paymentIntent.id,
            error:
              refundError instanceof Error
                ? refundError.message
                : String(refundError),
          },
          severity: "critical",
        });
      }
    } catch (trackingErr) {
      console.error(
        "ALERT SYSTEM FAILURE: Could not create tracking record for missing hold:",
        {
          holdId,
          paymentIntentId: paymentIntent.id,
          trackingErr,
        }
      );
    }

    return;
  }

  await createOrderAndTicketsFromHold(hold, paymentIntent);
}

async function createOrderAndTicketsFromRsvp(
  rsvp: RsvpWithRelations,
  paymentIntent: Stripe.PaymentIntent
) {
  if (!supabaseAdmin) {
    console.error(
      "CRITICAL: Database connection error in createOrderAndTicketsFromRsvp",
      {
        rsvpId: rsvp.id,
        paymentIntentId: paymentIntent.id,
      }
    );
    // Throw error so caller can handle and trigger Stripe retry
    throw new Error(
      "Database connection not available in createOrderAndTicketsFromRsvp"
    );
  }

  // Guard: Only process RSVPs that have been explicitly approved
  // IMPORTANT: "pending" was removed from allowedStatuses to prevent a race condition
  const allowedStatuses = ["approved"];
  if (!allowedStatuses.includes(rsvp.status)) {
    // Detect in-flight approval case: webhook arrived before DB status update completed
    // This can happen due to network delays or race conditions
    if (
      rsvp.status === "pending" &&
      paymentIntent.capture_method === "manual" &&
      (paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing")
    ) {
      console.warn(
        "⚠️ RACE CONDITION DETECTED: PaymentIntent captured but RSVP still pending - likely in-flight approval:",
        {
          rsvpId: rsvp.id,
          paymentIntentId: paymentIntent.id,
          rsvpStatus: rsvp.status,
          paymentIntentStatus: paymentIntent.status,
          captureMethod: paymentIntent.capture_method,
        }
      );
      throw new Error(
        "Webhook race condition: PaymentIntent captured while RSVP still pending"
      );
    }

    console.log(
      `⚠️ Skipping order creation for RSVP ${rsvp.id} with status "${rsvp.status}" (PaymentIntent: ${paymentIntent.id}). ` +
        `RSVP must be approved before order/ticket creation.`
    );
    return;
  }

  // Defensive null checks for related data
  if (!rsvp.ticket_tiers || !rsvp.events) {
    console.error(
      "CRITICAL: RSVP missing related ticket_tiers or events data:",
      {
        rsvpId: rsvp.id,
        paymentIntentId: paymentIntent.id,
        hasTicketTiers: !!rsvp.ticket_tiers,
        hasEvents: !!rsvp.events,
      }
    );

    // Create ghost order for tracking and manual resolution
    try {
      const { data: ghostOrder, error: ghostOrderError } = await supabaseAdmin
        .from("orders")
        .insert({
          user_id: rsvp.user_id,
          organization_id: rsvp.events?.organization_id || null, // Best effort
          event_id: rsvp.event_id,
          ticket_tier_id: rsvp.ticket_tier_id,
          quantity: rsvp.requested_quantity || 1,
          unit_price_cents: 0, // Unknown without tier data
          subtotal_cents: paymentIntent.amount, // Ensure subtotal matches total since fees are 0
          fees_cents: 0,
          total_cents: paymentIntent.amount,
          total_amount_cents: paymentIntent.amount,
          platform_fee_cents: 0,
          stripe_payment_intent_id: paymentIntent.id,
          status: "requires_manual_review",
          payment_method: "stripe",
          payment_provider: "stripe",
          idempotency_key: paymentIntent.id,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (ghostOrderError || !ghostOrder) {
        console.error("Failed to create ghost order for broken RSVP:", ghostOrderError);
      } else {
        await supabaseAdmin.from("order_errors").insert({
          order_id: ghostOrder.id,
          error_type: "rsvp_missing_relations",
          error_message: "RSVP missing ticket_tiers or events data during checkout",
          error_details: {
            rsvpId: rsvp.id,
            paymentIntentId: paymentIntent.id,
            hasTicketTiers: !!rsvp.ticket_tiers,
            hasEvents: !!rsvp.events,
          },
          severity: "critical",
        });
      }
    } catch (err) {
      console.error("Exception creating ghost order for broken RSVP:", err);
    }

    // Throw error to trigger Stripe retry (500 response)
    // This gives us a chance to process it if the data inconsistency is temporary
    throw new Error(`RSVP ${rsvp.id} missing related data. Retrying...`);
  }

  // Process approved RSVP payment - create order and tickets
  const quantity = rsvp.requested_quantity || 1;
  
  // IMPORTANT: Use the ORIGINAL unit price (stage or tier price), not base_price_cents
  // The discount is stored separately in PaymentIntent metadata as discountAmountCents
  // and will be applied via the orders table CHECK constraint:
  // total_cents = subtotal_cents + fees_cents + platform_fee_cents - discount_amount_cents
  // 
  // Using base_price_cents (discounted) here would cause the discount to be applied TWICE:
  // once in subtotal (via base_price_cents) and again via discount_amount_cents
  const unitPrice = rsvp.stage_price_cents ?? rsvp.ticket_tiers.price_cents;
  const subtotal = unitPrice * quantity;

  // Get feePercent from PaymentIntent metadata or fetch from organization
  // This is used as a fallback if not present in metadata (e.g. manual payment intent)
  const feePercent = await getFeePercent(
    paymentIntent,
    rsvp.events.organization_id,
    {
      type: "rsvp",
      id: rsvp.id,
    }
  );

  const orderCreated = await createOrder(
    rsvp.user_id,
    rsvp.event_id,
    rsvp.events.organization_id,
    rsvp.ticket_tier_id,
    quantity,
    unitPrice,
    subtotal,
    {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
      payment_method: "stripe",
      payment_provider: "stripe",
    },
    "rsvp",
    rsvp.stage_id, // Pass stageId from RSVP
    rsvp.ticket_tiers.name, // Tier name for QR code
    rsvp.events.name, // Event name for QR code
    feePercent // Pass fallback feePercent explicitly
  );

  // Only update RSVP status if order was successfully created
  if (!orderCreated) {
    console.error(
      "Order creation failed for RSVP, keeping status to allow manual resolution:",
      {
        rsvpId: rsvp.id,
        paymentIntentId: paymentIntent.id,
        userId: rsvp.user_id,
        eventId: rsvp.event_id,
      }
    );

    // CRITICAL: If order creation failed, we must log a critical error in order_errors
    // to flag this "Ghost Payment" (captured but no order).
    try {
      await supabaseAdmin.from("order_errors").insert({
        order_id: null,
        error_type: "ghost_payment_rsvp_order_failed",
        error_message: "Payment captured for RSVP but createOrder returned false",
        error_details: {
          paymentIntentId: paymentIntent.id,
          rsvpId: rsvp.id,
          amount: paymentIntent.amount,
        },
        severity: "critical",
      });
      console.log("Logged ghost_payment_rsvp_order_failed error for:", paymentIntent.id);
    } catch (logErr) {
      console.error("Failed to log ghost payment error:", logErr);
    }

    return;
  }

  // Link order to audit log (non-blocking)
  await linkOrderToAuditLog(paymentIntent.id);

  // ⚡ ON-DEMAND REVALIDATION: Clear caches after successful Stripe payment
  // This ensures organizer dashboard shows updated revenue immediately
  try {
    // Revalidate event page to update availability
    if (rsvp.events?.slug) {
      revalidatePath(`/events/${rsvp.events.slug}`);
      console.log(
        `[STRIPE WEBHOOK] Revalidated event page: /events/${rsvp.events.slug}`
      );
    }
    // Revalidate organizer dashboard for revenue & attendee counts
    revalidatePath("/organizer");
    console.log("[STRIPE WEBHOOK] Revalidated organizer dashboard");
    // Revalidate user account page for ticket list
    revalidatePath("/account");
  } catch (revalidationError) {
    console.error("Warning: Cache revalidation failed:", revalidationError);
    // Don't fail the order creation if cache revalidation fails
  }

  // Update RSVP with error handling
  const { error: rsvpUpdateError } = await supabaseAdmin
    .from("rsvps")
    .update({ status: "purchased" }) // or "completed"
    .eq("id", rsvp.id);

  if (rsvpUpdateError) {
    console.error("Failed to update RSVP status to purchased:", {
      rsvpId: rsvp.id,
      intendedStatus: "purchased",
      error: rsvpUpdateError,
    });

    // Log to order_errors for consistency with approve route pattern
    // Note: Order and tickets were created successfully, status inconsistency is non-critical
    try {
      await supabaseAdmin.from("order_errors").insert({
        order_id: null, // Order created successfully but ID not returned from createOrder()
        error_type: "rsvp_status_update_failed",
        error_message:
          "Order and tickets created successfully but RSVP status update to 'purchased' failed",
        error_details: {
          rsvpId: rsvp.id,
          intendedStatus: "purchased",
          currentStatus: rsvp.status,
          error: rsvpUpdateError,
          paymentIntentId: paymentIntent.id,
        },
        severity: "medium",
      });
    } catch (loggingError) {
      console.error("Failed to log RSVP status update error:", loggingError);
    }
  }
}

async function createOrderAndTicketsFromHold(
  hold: HoldWithRelations,
  paymentIntent: Stripe.PaymentIntent
) {
  if (!supabaseAdmin) {
    console.error(
      "CRITICAL: Database connection error in createOrderAndTicketsFromHold",
      {
        holdId: hold.id,
        paymentIntentId: paymentIntent.id,
      }
    );
    // Throw error so caller can handle and trigger Stripe retry
    throw new Error(
      "Database connection not available in createOrderAndTicketsFromHold"
    );
  }

  // Defensive null checks for related data
  if (!hold.ticket_tiers || !hold.events) {
    console.error(
      "CRITICAL: Hold missing related ticket_tiers or events data:",
      {
        holdId: hold.id,
        paymentIntentId: paymentIntent.id,
        hasTicketTiers: !!hold.ticket_tiers,
        hasEvents: !!hold.events,
      }
    );

    // Create ghost order for tracking and manual resolution
    try {
      const { data: ghostOrder, error: ghostOrderError } = await supabaseAdmin
        .from("orders")
        .insert({
          user_id: hold.user_id,
          organization_id: hold.events?.organization_id || null, // Best effort
          event_id: hold.event_id,
          ticket_tier_id: hold.tier_id,
          quantity: hold.quantity,
          unit_price_cents: 0, // Unknown without tier data
          subtotal_cents: paymentIntent.amount, // Ensure subtotal matches total since fees are 0
          fees_cents: 0,
          total_cents: paymentIntent.amount,
          total_amount_cents: paymentIntent.amount,
          platform_fee_cents: 0,
          stripe_payment_intent_id: paymentIntent.id,
          status: "requires_manual_review",
          payment_method: "stripe",
          payment_provider: "stripe",
          idempotency_key: paymentIntent.id,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (ghostOrderError || !ghostOrder) {
        console.error("Failed to create ghost order for broken Hold:", ghostOrderError);
      } else {
        await supabaseAdmin.from("order_errors").insert({
          order_id: ghostOrder.id,
          error_type: "hold_missing_relations",
          error_message: "Hold missing ticket_tiers or events data during checkout",
          error_details: {
            holdId: hold.id,
            paymentIntentId: paymentIntent.id,
            hasTicketTiers: !!hold.ticket_tiers,
            hasEvents: !!hold.events,
          },
          severity: "critical",
        });
      }
    } catch (err) {
      console.error("Exception creating ghost order for broken Hold:", err);
    }

    // Throw error to trigger Stripe retry (500 response)
    // This gives us a chance to process it if the data inconsistency is temporary
    throw new Error(`Hold ${hold.id} missing related data. Retrying...`);
  }

  const quantity = hold.quantity;
  const unitPrice = hold.stage_price_cents ?? hold.ticket_tiers.price_cents;
  const subtotal = unitPrice * quantity;

  // Fallback fee lookup for holds (same logic as RSVP)
  const feePercent = await getFeePercent(
    paymentIntent,
    hold.events.organization_id,
    {
      type: "hold",
      id: hold.id,
    }
  );

  const orderCreated = await createOrder(
    hold.user_id,
    hold.event_id,
    hold.events.organization_id,
    hold.tier_id,
    quantity,
    unitPrice,
    subtotal,
    {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
      payment_method: "stripe",
      payment_provider: "stripe",
    },
    "hold",
    hold.stage_id, // Pass stageId from Hold
    hold.ticket_tiers.name, // Tier name for QR code
    hold.events.name, // Event name for QR code
    feePercent // Pass fallback feePercent explicitly
  );

  // Only delete hold if order was successfully created
  if (!orderCreated) {
    console.error(
      "Order creation failed, preserving hold to maintain reservation:",
      {
        holdId: hold.id,
        paymentIntentId: paymentIntent.id,
      }
    );

    // CRITICAL: If order creation failed, we must log a critical error in order_errors
    // to flag this "Ghost Payment" (captured but no order).
    // We intentionally pass order_id: null because no order exists.
    try {
      await supabaseAdmin.from("order_errors").insert({
        order_id: null,
        error_type: "ghost_payment_order_failed",
        error_message: "Payment captured but createOrder returned false (DB insert failed?)",
        error_details: {
          paymentIntentId: paymentIntent.id,
          holdId: hold.id,
          amount: paymentIntent.amount,
        },
        severity: "critical",
      });
      console.log("Logged ghost_payment_order_failed error for:", paymentIntent.id);
    } catch (logErr) {
      console.error("Failed to log ghost payment error:", logErr);
    }

    return;
  }

  // Link order to audit log (non-blocking)
  await linkOrderToAuditLog(paymentIntent.id);

  // ⚡ ON-DEMAND REVALIDATION: Clear caches after successful Stripe payment
  // This ensures organizer dashboard shows updated revenue immediately
  try {
    // Revalidate event page to update availability
    if (hold.events?.slug) {
      revalidatePath(`/events/${hold.events.slug}`);
      console.log(
        `[STRIPE WEBHOOK] Revalidated event page: /events/${hold.events.slug}`
      );
    }
    // Revalidate organizer dashboard for revenue & attendee counts
    revalidatePath("/organizer");
    console.log("[STRIPE WEBHOOK] Revalidated organizer dashboard");
    // Revalidate user account page for ticket list
    revalidatePath("/account");
  } catch (revalidationError) {
    console.error("Warning: Cache revalidation failed:", revalidationError);
    // Don't fail the order creation if cache revalidation fails
  }

  // Delete hold after successful order creation
  try {
    const { error: holdDeleteError } = await supabaseAdmin
      .from("holds")
      .delete()
      .eq("id", hold.id);
    if (holdDeleteError) {
      console.error("Failed to delete hold after order creation:", {
        holdId: hold.id,
        error: holdDeleteError,
      });
    }
  } catch (deleteErr) {
    console.error("Exception deleting hold:", {
      holdId: hold.id,
      error: deleteErr,
    });
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  // Legacy handler - likely not used in new flow but kept for backward compatibility if needed
  // Note: New flow uses PaymentElements and payment_intent.succeeded
  // We log a warning and return early to prevent Stripe retries (responding with 200 OK via the main handler)
  console.warn(
    "WARNING: Received legacy checkout.session.completed event. This flow is deprecated and should not be used. Session ID:",
    session.id
  );
  // Return void to allow the webhook handler to proceed and return 200 OK
  return;
}

async function handlePaymentFailed(
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent
) {
  console.log("Processing failed payment:", paymentIntent.id);

  // Log to audit table (non-blocking)
  await logPaymentIntentAudit(event, paymentIntent);

  if (!supabaseAdmin) {
    console.error("CRITICAL: Database connection error in webhook handler", {
      paymentIntentId: paymentIntent.id,
      handler: "handlePaymentFailed",
    });
    // Throw error to return 500 and trigger Stripe retry
    throw new Error("Database connection not available");
  }

  // Inspect payment error to determine if failure is retryable or permanent
  const paymentError = paymentIntent.last_payment_error;
  const isRetryable =
    (paymentError?.type === "card_error" &&
      (paymentError.code === "card_declined" ||
        paymentError.code === "insufficient_funds" ||
        paymentError.code === "expired_card" ||
        paymentError.code === "incorrect_cvc")) ||
    (paymentError?.type as string) === "api_error" ||
    (paymentError?.type as string) === "rate_limit_error";
    
  const isPermanent =
    paymentError?.type === "invalid_request_error" ||
    (paymentError?.type === "card_error" &&
      paymentError.code !== "card_declined" &&
      paymentError.code !== "insufficient_funds" &&
      paymentError.code !== "expired_card" &&
      paymentError.code !== "incorrect_cvc");

  const failureType = isRetryable
    ? "retryable"
    : isPermanent
    ? "permanent"
    : "unknown";

  console.log("Payment failure analysis:", {
    paymentIntentId: paymentIntent.id,
    failureType,
    errorType: paymentError?.type,
    errorCode: paymentError?.code,
    errorMessage: paymentError?.message,
  });

  let { holdId, rsvpId } = paymentIntent.metadata || {};

  // If rsvpId is missing, try to find RSVP by paymentIntent.id
  // This handles cases where RSVP was linked to PI (Auth & Capture) but metadata is missing or incomplete
  if (!rsvpId) {
    try {
      const { data: rsvp, error: rsvpError } = await supabaseAdmin
        .from("rsvps")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .maybeSingle();

      if (rsvpError) {
        console.error("Error looking up RSVP for failed payment:", rsvpError);
      } else if (rsvp) {
        console.log(
          "Found RSVP by PaymentIntent ID for failure handling:",
          rsvp.id
        );
        rsvpId = rsvp.id;
      }
    } catch (lookupErr) {
      console.error("Error looking up RSVP for failed payment:", lookupErr);
    }
  }

  // For RSVP: Update status based on failure type
  if (rsvpId) {
    try {
      // Determine status based on failure type
      // Retryable failures: keep as pending so user can retry
      // Permanent failures: mark as payment_failed
      const newStatus = isRetryable ? "pending" : "payment_failed";

      const { error: rsvpError } = await supabaseAdmin
        .from("rsvps")
        .update({
          status: newStatus,
        })
        .eq("id", rsvpId)
        .in("status", ["pending", "approved"]); // Update both pending and approved RSVPs

      if (rsvpError) {
        console.error(
          `Failed to update RSVP status to ${newStatus}:`,
          rsvpError
        );
      } else {
        console.log(`Updated RSVP status to ${newStatus}:`, {
          rsvpId,
          failureType,
          errorCode: paymentError?.code,
        });

        // NOTE: Customer notification for retryable failures
        // Currently logged only. Future enhancement: implement email/SMS notification
        // via job queue (e.g., BullMQ, Inngest) to prompt payment method update
        if (isRetryable) {
          console.log(
            "⚠️ Retryable failure detected - manual follow-up recommended:",
            {
              rsvpId,
              errorCode: paymentError?.code,
              errorMessage: paymentError?.message,
              action: "Contact customer to update payment method",
            }
          );
          // Future enhancement: Implement automated notification system
          // Options: Email via Resend, SMS via Twilio, or in-app notification
        }
      }
    } catch (err) {
      console.error("Exception updating RSVP status:", err);
    }
  }

  // For Holds: Release the hold immediately
  if (holdId) {
    console.log(`Payment failed for Hold ${holdId}, releasing hold...`);
    try {
      const { error: holdError } = await supabaseAdmin
        .from("holds")
        .delete()
        .eq("id", holdId);

      if (holdError) {
        console.error(
          "Failed to release hold after payment failure:",
          holdError
        );
      } else {
        console.log("Released hold after payment failure:", holdId);
      }
    } catch (err) {
      console.error("Exception releasing hold:", err);
    }
  }

  console.log("Payment failed for intent:", paymentIntent.id);
}

async function handlePaymentIntentCanceled(
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent
) {
  console.log("Processing canceled payment intent:", paymentIntent.id);

  // Log to audit table (non-blocking)
  await logPaymentIntentAudit(event, paymentIntent);

  if (!supabaseAdmin) {
    console.error("CRITICAL: Database connection error in webhook handler", {
      paymentIntentId: paymentIntent.id,
      handler: "handlePaymentIntentCanceled",
    });
    // Throw error to return 500 and trigger Stripe retry
    throw new Error("Database connection not available");
  }

  let { holdId, rsvpId } = paymentIntent.metadata || {};

  // If rsvpId is missing, try to find RSVP by paymentIntent.id
  // This handles cases where RSVP was linked to PI (Auth & Capture) but metadata is missing or incomplete
  // Same logic as handlePaymentFailed
  if (!rsvpId) {
    try {
      const { data: rsvp, error: rsvpError } = await supabaseAdmin
        .from("rsvps")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .maybeSingle();

      if (rsvpError) {
        console.error("Error looking up RSVP for canceled payment:", rsvpError);
      } else if (rsvp) {
        console.log(
          "Found RSVP by PaymentIntent ID for cancellation handling:",
          rsvp.id
        );
        rsvpId = rsvp.id;
      }
    } catch (lookupErr) {
      console.error("Error looking up RSVP for canceled payment:", lookupErr);
    }
  }

  // For RSVP: Update status to 'canceled' or 'rejected'
  if (rsvpId) {
    try {
      // Check current RSVP status to determine appropriate update
      const { data: rsvp, error: fetchError } = await supabaseAdmin
        .from("rsvps")
        .select("id, status")
        .eq("id", rsvpId)
        .maybeSingle();

      if (fetchError) {
        console.error("Error fetching RSVP for cancellation:", {
          rsvpId,
          error: fetchError,
        });
        throw fetchError;
      }

      if (rsvp) {
        // If RSVP was pending, mark as canceled (user or system canceled)
        // If RSVP was already rejected, keep it as rejected
        const newStatus =
          rsvp.status === "rejected" ? "rejected" : "canceled";

        const { error: rsvpError } = await supabaseAdmin
          .from("rsvps")
          .update({ status: newStatus })
          .eq("id", rsvpId);

        if (rsvpError) {
          console.error(
            `Failed to update RSVP status to ${newStatus}:`,
            rsvpError
          );
        } else {
          console.log(`Updated RSVP status to ${newStatus}:`, rsvpId);
        }
      }
    } catch (err) {
      console.error("Exception updating RSVP status on cancellation:", err);
    }
  }

  // For Holds: Release the hold immediately
  if (holdId) {
    console.log(`Payment canceled for Hold ${holdId}, releasing hold...`);
    try {
      const { error: holdError } = await supabaseAdmin
        .from("holds")
        .delete()
        .eq("id", holdId);

      if (holdError) {
        console.error(
          "Failed to release hold after payment cancellation:",
          holdError
        );
      } else {
        console.log("Released hold after payment cancellation:", holdId);
      }
    } catch (err) {
      console.error("Exception releasing hold on cancellation:", err);
    }
  }

  console.log(
    `Payment intent canceled: ${paymentIntent.id} (reason: ${paymentIntent.cancellation_reason || "not specified"})`
  );
}

async function handlePaymentIntentAmountCapturableUpdated(
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent
) {
  console.log(
    "Processing amount_capturable_updated for payment intent:",
    paymentIntent.id
  );

  // Log to audit table (non-blocking)
  await logPaymentIntentAudit(event, paymentIntent);

  if (!supabaseAdmin) {
    console.error("CRITICAL: Database connection error in webhook handler", {
      paymentIntentId: paymentIntent.id,
      handler: "handlePaymentIntentAmountCapturableUpdated",
    });
    // Throw error to return 500 and trigger Stripe retry
    throw new Error("Database connection not available");
  }

  let { rsvpId } = paymentIntent.metadata || {};
  let lookupMethod = "metadata";

  // This event fires when a manual capture payment is authorized
  // For RSVP flow: Check if RSVP is already approved, and if so, capture immediately
  // Otherwise, just log that authorization is ready (organizer approval will trigger capture)
  
  // If rsvpId is missing from metadata, try fallback lookup by stripe_payment_intent_id
  if (!rsvpId) {
    try {
      const { data: rsvp, error: rsvpError } = await supabaseAdmin
        .from("rsvps")
        .select("id, status")
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .maybeSingle();

      if (rsvpError) {
        console.error("Error looking up RSVP for amount_capturable_updated:", rsvpError);
      } else if (rsvp) {
        console.log(
          "Found RSVP by PaymentIntent ID for amount_capturable_updated:",
          rsvp.id
        );
        rsvpId = rsvp.id;
        lookupMethod = "stripe_payment_intent_id";
      }
    } catch (lookupErr) {
      console.error("Error looking up RSVP for amount_capturable_updated:", lookupErr);
    }
  }

  if (rsvpId) {
    try {
      // Verify RSVP exists and check its status
      // Use the rsvpId we found (either from metadata or fallback lookup)
      const { data: rsvp, error: rsvpError } = await supabaseAdmin
        .from("rsvps")
        .select("id, status")
        .eq("id", rsvpId)
        .maybeSingle();

      if (rsvpError) {
        console.error("Error retrieving RSVP details:", rsvpError);
        // Continue loop or exit? This is inside a try/catch block so logging is enough, then it falls through
      } else if (rsvp) {
        if (rsvp.status === "approved") {
          // RSVP is already approved - capture immediately before authorization expires
          // This handles the case where organizer approved before authorization completed
          console.log(
            `RSVP ${rsvpId} is approved and payment is authorized - capturing immediately (found via ${lookupMethod}):`,
            {
              paymentIntentId: paymentIntent.id,
              amountCapturable: paymentIntent.amount_capturable,
            }
          );

          try {
            // Capture the payment with idempotency key
            await stripe.paymentIntents.capture(paymentIntent.id, undefined, {
              idempotencyKey: `webhook_capture_${rsvpId}_${paymentIntent.id}`,
            });

            console.log(
              `✅ Successfully captured payment for approved RSVP ${rsvpId}`
            );
            // The payment_intent.succeeded webhook will handle order/ticket creation
          } catch (captureError) {
            console.error(
              `Failed to capture payment for approved RSVP ${rsvpId}:`,
              {
                paymentIntentId: paymentIntent.id,
                error:
                  captureError instanceof Error
                    ? captureError.message
                    : String(captureError),
              }
            );
            // Don't throw - log error and let organizer retry via approve route
          }
        } else if (rsvp.status === "pending") {
          // RSVP is pending - payment is authorized and ready for organizer approval
          console.log(
            `✅ RSVP ${rsvpId} payment authorized and ready to capture (amount: $${(paymentIntent.amount_capturable / 100).toFixed(2)}) - awaiting organizer approval (found via ${lookupMethod})`
          );
        } else {
          console.log(
            `RSVP ${rsvpId} status is ${rsvp.status} - no action needed for amount_capturable_updated`
          );
        }
      } else {
        console.log(
          `RSVP ${rsvpId} not found - no action needed for amount_capturable_updated`
        );
      }
    } catch (err) {
      console.error(
        "Exception processing amount_capturable_updated for RSVP:",
        err
      );
    }
  } else {
    // No RSVP (or Hold) found YET for this authorized PI. This is NOT necessarily
    // a true orphan — there is a known race window in both the mobile and web RSVP
    // paid flows:
    //
    //   1. Client calls create-payment-intent → PI created with NO rsvpId in metadata
    //      and NO RSVP row in DB yet.
    //   2. Client presents PaymentSheet / Stripe Elements → Stripe authorizes the
    //      card → fires `amount_capturable_updated` (this webhook).
    //   3. Client calls POST /api/rsvp → creates RSVP row, sets
    //      stripe_payment_intent_id, then stripe.paymentIntents.update() to add
    //      rsvpId to metadata.
    //
    // The webhook (step 2) and the link (step 3) race. Auto-canceling here would
    // race-cancel legitimate in-flight purchases. Instead we log a non-blocking
    // ops signal so a periodic cleanup job (or manual review) can cancel truly
    // orphaned authorizations after a safe delay (e.g., >30 min in requires_capture).
    //
    // True orphans (like Amalia Lertora's pi_3TYuHd1CwyzKTQCT1huajQoD from May 19,
    // 2026 — see MAY_2026_FIXES.md #19) happen when the client crashes / loses
    // connection / abandons between step 2 and step 3. Stripe's manual-capture
    // auths auto-expire after 7 days, so the customer is not charged — but they
    // see a pending hold on their card for up to a week. Deferred cleanup gets
    // that down to the cleanup-job cadence.
    // Sanitize metadata via redactMetadata for parity with logPaymentIntentAudit
    // (used in the two adjacent branches above) — never persist or log raw
    // PaymentIntent metadata, which can contain customer-supplied fields.
    const safeOrphanMetadata = redactMetadata(paymentIntent.metadata);

    console.warn(
      "[STRIPE WEBHOOK] amount_capturable_updated received with no linked RSVP/Hold — logging as potential orphan (race condition: client may still be calling /api/rsvp).",
      {
        paymentIntentId: paymentIntent.id,
        amountCapturable: paymentIntent.amount_capturable,
        currency: paymentIntent.currency,
        metadata: safeOrphanMetadata,
      }
    );

    try {
      // Idempotency guard — Stripe retries webhook deliveries on any non-2xx
      // response and on processing timeouts, which would otherwise create
      // duplicate order_errors rows for the same PaymentIntent. Cheap SELECT
      // before INSERT keyed on (error_type, error_details->>'paymentIntentId').
      // No schema change required; this query plan is an index-friendly JSONB
      // path expression and the error_type filter narrows the row set heavily.
      const { data: existingOrphanLog } = await supabaseAdmin
        .from("order_errors")
        .select("id")
        .eq("error_type", "potentially_orphaned_authorized_payment_intent")
        .eq("error_details->>paymentIntentId", paymentIntent.id)
        .maybeSingle();

      if (existingOrphanLog) {
        console.log(
          "[STRIPE WEBHOOK] orphan PI already logged — skipping duplicate insert:",
          paymentIntent.id,
        );
      } else {
        const { error: errorLogError } = await supabaseAdmin
          .from("order_errors")
          .insert({
            order_id: null,
            error_type: "potentially_orphaned_authorized_payment_intent",
            error_message: `PaymentIntent ${paymentIntent.id} authorized but no RSVP/Hold linked at webhook time — pending cleanup verification`,
            error_details: {
              paymentIntentId: paymentIntent.id,
              amountCapturable: paymentIntent.amount_capturable,
              currency: paymentIntent.currency,
              metadata: safeOrphanMetadata,
              note: "Race condition between this webhook and client /api/rsvp call. Operator/cron should re-check after >30min and cancel if still unlinked. Stripe auto-expires manual-capture auths after 7 days.",
            },
            severity: "medium",
          });

        if (errorLogError) {
          console.error("Failed to log potentially orphaned authorized PI:", errorLogError);
        }
      }
    } catch (logErr) {
      console.error("Exception logging potentially orphaned authorized PI:", logErr);
    }
  }

  console.log(
    `Amount capturable updated: ${paymentIntent.id} - $${(paymentIntent.amount_capturable / 100).toFixed(2)} ready to capture`
  );
}

async function handleAccountUpdated(account: Stripe.Account) {
  if (!supabaseAdmin) {
    console.error("CRITICAL: Database connection error in handleAccountUpdated");
    throw new Error("Database connection not available");
  }

  const accountId = account.id;
  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;

  const { data: org, error: fetchError } = await supabaseAdmin
    .from("organizations")
    .select("id, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("stripe_account_id", accountId)
    .maybeSingle();

  if (fetchError) {
    console.error("Error looking up organization for account.updated:", {
      accountId,
      error: fetchError,
    });
    throw new Error(
      `Database error looking up organization for account.updated (${accountId}): ${fetchError.message}`
    );
  }

  if (!org) {
    // Possible causes:
    //  1. account.updated fired before /api/stripe/connect/onboard committed
    //     the stripe_account_id write (onboarding race — Stripe will fire
    //     account.updated again as the user progresses, so this is self-
    //     healing if the org row catches up).
    //  2. Real drift — a Stripe Connect account exists with no matching org.
    //     This needs operator attention.
    // We log a warning (not console.log) so this surfaces in error monitoring
    // instead of silently disappearing into info-level logs.
    console.warn(
      `[STRIPE WEBHOOK] account.updated received for unknown Stripe account ${accountId} — no matching organization. ` +
        `If this is the first account.updated during onboarding, it's expected (DB write may not have committed yet). ` +
        `If it repeats after the user finishes onboarding, investigate drift.`,
      {
        accountId,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted: account.details_submitted,
      }
    );
    return;
  }

  if (
    org.stripe_charges_enabled === chargesEnabled &&
    org.stripe_payouts_enabled === payoutsEnabled
  ) {
    console.log(`account.updated for ${accountId}: no status change, skipping DB write`);
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from("organizations")
    .update({
      stripe_charges_enabled: chargesEnabled,
      stripe_payouts_enabled: payoutsEnabled,
    })
    .eq("id", org.id);

  if (updateError) {
    console.error("Failed to update organization Stripe status:", {
      accountId,
      organizationId: org.id,
      error: updateError,
    });
    throw new Error(
      `Database error updating Stripe Connect status for org ${org.id} (account ${accountId}): ${updateError.message}`
    );
  }

  console.log(
    `✅ Synced Stripe Connect status for org ${org.id}: charges=${chargesEnabled}, payouts=${payoutsEnabled}`
  );
}
