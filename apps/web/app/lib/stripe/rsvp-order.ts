/**
 * Order + tickets for a paid RSVP once its PaymentIntent is captured — moved VERBATIM out of
 * app/api/webhooks/stripe/route.ts (fase 3.4, 2026-10-28) so the RSVP reconciliation cron can run
 * the exact same code as the webhook (a route file can't export helpers). The webhook imports it
 * from here; behaviour is unchanged.
 */
import Stripe from "stripe";
import { supabaseAdmin } from "../supabase/server";
import { revalidatePath } from "next/cache";
import { createOrder } from "../orders";

export const DEFAULT_FEE_PERCENT = 12.5;

export interface RsvpWithRelations {
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

// Helper function to link order to audit log after successful order creation
export async function linkOrderToAuditLog(paymentIntentId: string): Promise<void> {
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
export async function getFeePercent(
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

export async function createOrderAndTicketsFromRsvp(
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

