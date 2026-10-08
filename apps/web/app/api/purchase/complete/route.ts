import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  validatePurchaseToken,
  markTokenAsUsed,
} from "../../../lib/purchase-tokens";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";
import { getBaseUrl } from "../../../lib/utils/url";
import Stripe from "stripe";
import crypto from "crypto";

function getStripeInstance() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not configured");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil",
  });
}

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json(
        { error: "Purchase token is required" },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "You must be logged in to complete a purchase" },
        { status: 401 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      );
    }

    // Validate the token and get RSVP details
    const rsvpDetails = await validatePurchaseToken(token);

    if (!rsvpDetails) {
      return NextResponse.json(
        {
          error: "Invalid or used purchase token",
          invalid: true,
        },
        { status: 404 }
      );
    }

    // Get the current user's Supabase record and verify they own this RSVP
    let currentUser;
    try {
      currentUser = await resolveDbUserFromClerkId(userId);
    } catch (error) {
      console.error("ERROR resolving user:", error);
      const status =
        error instanceof Error && error.message === "User not found"
          ? 404
          : 500;
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "User not found" },
        { status }
      );
    }

    if (currentUser.id !== rsvpDetails.user_id) {
      return NextResponse.json(
        { error: "You are not authorized to complete this purchase" },
        { status: 403 }
      );
    }

    // Calculate total amount using staged pricing if available
    const unitPrice =
      rsvpDetails.stage_price_cents ?? rsvpDetails.ticket_tiers.price_cents;
    const quantity = rsvpDetails.requested_quantity;

    const {
      data: eventCurrencyRecord,
      error: currencyError,
    } = await supabaseAdmin
      .from("events")
      .select("currency")
      .eq("id", rsvpDetails.event_id)
      .single();
    if (currencyError) {
      console.error("Error fetching event currency for RSVP complete:", {
        eventId: rsvpDetails.event_id,
        error: currencyError,
      });
    }
    const eventCurrency = ((eventCurrencyRecord as Record<string, unknown> | null)?.currency as string || "USD").toUpperCase();
    const stripeCurrency = eventCurrency.toLowerCase();

    // Defensive data integrity validation
    const quantityTotal = rsvpDetails.ticket_tiers.quantity_total;
    const quantitySold = rsvpDetails.ticket_tiers.quantity_sold;

    // Validate data types and values
    if (
      typeof quantityTotal !== "number" ||
      typeof quantitySold !== "number" ||
      !Number.isInteger(quantityTotal) ||
      !Number.isInteger(quantitySold) ||
      quantityTotal < 0 ||
      quantitySold < 0
    ) {
      console.error("Data integrity error - invalid ticket tier quantities:", {
        quantity_total: quantityTotal,
        quantity_sold: quantitySold,
        ticket_tier_id: rsvpDetails.ticket_tier_id,
      });
      return NextResponse.json(
        {
          error: "Invalid ticket tier data. Please contact support.",
          code: "INVALID_TIER_DATA",
        },
        { status: 500 }
      );
    }

    if (quantitySold > quantityTotal) {
      console.error("Data integrity error - sold quantity exceeds total:", {
        quantity_total: quantityTotal,
        quantity_sold: quantitySold,
        ticket_tier_id: rsvpDetails.ticket_tier_id,
      });
      return NextResponse.json(
        {
          error:
            "Ticket tier data inconsistency detected. Please contact support.",
          code: "OVERSOLD_TIER",
        },
        { status: 500 }
      );
    }

    // Check overall tier availability first
    const totalAvailable = quantityTotal - quantitySold;
    if (quantity > totalAvailable) {
      return NextResponse.json(
        {
          error: `Only ${totalAvailable} ticket${
            totalAvailable === 1 ? "" : "s"
          } remaining for this tier. Please adjust your quantity.`,
          available_quantity: totalAvailable,
          code: "INSUFFICIENT_TOTAL_AVAILABILITY",
        },
        { status: 400 }
      );
    }

    // Validate that requested quantity fits within current stage
    // This prevents users from purchasing across stage boundaries which could cause pricing confusion
    if (
      rsvpDetails.ticket_tiers.remaining_in_stage != null &&
      rsvpDetails.ticket_tiers.current_stage
    ) {
      const remainingInStage = rsvpDetails.ticket_tiers.remaining_in_stage;

      if (quantity > remainingInStage) {
        // Not enough tickets in current stage - inform user
        const currentStageName = rsvpDetails.ticket_tiers.current_stage.name;
        const currentStagePrice =
          rsvpDetails.ticket_tiers.current_stage.price_cents;

        return NextResponse.json(
          {
            error: `Only ${remainingInStage} ticket${
              remainingInStage === 1 ? "" : "s"
            } available at the current "${currentStageName}" price ($${(
              currentStagePrice / 100
            ).toFixed(2)}). Please adjust your quantity or contact support.`,
            available_quantity: remainingInStage,
            current_stage: currentStageName,
            current_price: currentStagePrice,
            code: "INSUFFICIENT_STAGE_AVAILABILITY",
          },
          { status: 400 }
        );
      }
    }

    const subtotalCents = unitPrice * quantity;

    // Add processing fee (3% + $0.30, minimum $1.00)
    const stripeFeePercent = 0.03;
    const stripeFeeFixed = 30; // $0.30 in cents
    const processingFee = Math.max(
      100,
      Math.round(subtotalCents * stripeFeePercent) + stripeFeeFixed
    );

    const totalCents = subtotalCents + processingFee;

    // Create order record
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: rsvpDetails.user_id,
        organization_id: rsvpDetails.events.organization_id,
        event_id: rsvpDetails.event_id,
        status: "pending",
        subtotal_cents: subtotalCents,
        fees_cents: processingFee,
        total_cents: totalCents,
        currency: eventCurrency,
        promoter_code: rsvpDetails.promoter_code || null,
        idempotency_key: crypto.randomUUID(),
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Error creating order:", orderError);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Create order items
    const currentStage = rsvpDetails.ticket_tiers.current_stage;
    const stageName = currentStage ? ` (${currentStage.name})` : "";

    const { error: orderItemError } = await supabaseAdmin
      .from("order_items")
      .insert({
        order_id: order.id,
        ticket_tier_id: rsvpDetails.ticket_tier_id,
        quantity: quantity,
        unit_price_cents: unitPrice,
        // Store stage information for record keeping
        ...(currentStage && {
          metadata: {
            stage_id: currentStage.id,
            stage_name: currentStage.name,
            stage_price_cents: currentStage.price_cents,
          },
        }),
      });

    if (orderItemError) {
      console.error("Error creating order items:", orderItemError);
      return NextResponse.json(
        { error: "Failed to create order items" },
        { status: 500 }
      );
    }

    // Create Stripe checkout session
    const stripe = getStripeInstance();

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: rsvpDetails.users.email,
      line_items: [
        {
          price_data: {
            currency: stripeCurrency,
            product_data: {
              name: `${rsvpDetails.events.name} - ${rsvpDetails.ticket_tiers.name}${stageName}`,
              description: `Event: ${rsvpDetails.events.name}\nVenue: ${
                rsvpDetails.events.venue
              }\nDate: ${new Date(
                rsvpDetails.events.starts_at
              ).toLocaleDateString()}\nPrice Stage: ${
                currentStage?.name || "Standard"
              }`,
            },
            unit_amount: unitPrice,
          },
          quantity: quantity,
        },
        {
          price_data: {
            currency: stripeCurrency,
            product_data: {
              name: "Processing Fee",
              description: "Payment processing and service fee",
            },
            unit_amount: processingFee,
          },
          quantity: 1,
        },
      ],
      success_url: `${getBaseUrl()}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getBaseUrl()}/purchase?token=${token}`,
      metadata: {
        order_id: order.id,
        rsvp_id: rsvpDetails.id,
        purchase_token: token,
      },
    });

    // Update order with Stripe session ID
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        stripe_checkout_session_id: checkoutSession.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("Error updating order with Stripe session:", updateError);
    }

    // Mark the purchase token as used
    await markTokenAsUsed(token);

    return NextResponse.json({
      checkout_url: checkoutSession.url,
      session_id: checkoutSession.id,
    });
  } catch (error) {
    console.error("Purchase completion API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
