import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../../lib/supabase/server";
import {
  sendRsvpRejectionEmail,
  type RejectionPaymentOutcome,
} from "../../../../../lib/email/rsvp-notifications";
import { sendPushNotification } from "../../../../../lib/push-notifications";
import { revalidatePath } from "next/cache";
import { stripe } from "../../../../../lib/stripe/stripe";
import { canManageEventRsvps } from "../../../../../lib/utils/event-rsvp-authz";

/**
 * Extract card brand + last4 from an expanded PaymentIntent, if available.
 * Server-authoritative — pulled directly from `latest_charge.payment_method_details.card`.
 * Safe against all pre-charge PI states (returns `undefined` fields).
 */
function extractCardDetails(
  pi: Stripe.PaymentIntent
): { cardBrand?: string; cardLast4?: string } {
  const latestCharge = pi.latest_charge;
  if (!latestCharge || typeof latestCharge === "string") return {};
  const card = latestCharge.payment_method_details?.card;
  if (!card) return {};
  return {
    cardBrand: card.brand ?? undefined,
    cardLast4: card.last4 ?? undefined,
  };
}

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/** Events shape from rsvps.events!inner SELECT (includes timezone).
 *  `organization_id` is NOT NULL on the events table and always returned by
 *  the SELECT, so it's typed as required. */
interface RsvpEventJoin {
  id: string;
  name: string;
  starts_at: string;
  venue?: string;
  timezone?: string | null;
  organization_id: string;
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
        organization_id
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

    const rsvpTyped = rsvp as typeof rsvp & { events: RsvpEventJoin };

    // Authorize: primary-org member, OR cohost org owner/admin (W3-B1)
    const authorized = await canManageEventRsvps(
      supabaseAdmin,
      supabaseUser.id,
      rsvpTyped.events.organization_id,
      rsvpTyped.events.id,
    );

    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized to manage this RSVP" },
        { status: 403 }
      );
    }

    // Check if RSVP is still pending
    if (rsvpTyped.status !== "pending") {
      return NextResponse.json(
        {
          error: `RSVP has already been ${rsvpTyped.status}`,
        },
        { status: 400 }
      );
    }

    // UPDATE STATUS FIRST: Reject the RSVP in the database
    // This prevents race conditions where payment is cancelled but RSVP remains "pending"
    // Optimistic locking: Only update if status is still "pending"
    const { data: updatedRsvp, error: updateError } = await supabaseAdmin
      .from("rsvps")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejected_by: supabaseUser.id,
      })
      .eq("id", rsvpId)
      .eq("status", "pending")
      .select()
      .maybeSingle(); // Use maybeSingle to handle case where no rows match (already processed)

    if (!updatedRsvp && !updateError) {
      // No rows updated means RSVP was already processed by another request
      return NextResponse.json(
        { error: "RSVP was already processed by another request" },
        { status: 409 }
      );
    }

    if (updateError) {
      console.error("Error rejecting RSVP:", updateError);
      return NextResponse.json(
        { error: "Failed to reject RSVP" },
        { status: 500 }
      );
    }

    // Check for Stripe Payment Authorization (Auth & Capture Flow)
    // Now that status is "rejected", we attempt to cancel/refund the payment
    let paymentRequiresFollowUp = false;
    let paymentOutcome: RejectionPaymentOutcome = { kind: "none" };
    if (rsvp.stripe_payment_intent_id) {
      try {
        // Expand `latest_charge` so we can surface the exact amount + card
        // brand/last4 in the rejection email (industry-standard refund/
        // hold-release copy). `payment_method_details` is NOT an expandable
        // field on Charge (always inline; types: `PaymentMethodDetails | null`)
        // — Stripe returns `invalid_request_error` if you list it in `expand`.
        // Expanding `latest_charge` alone returns the full Charge with
        // `payment_method_details` populated. Server-authoritative — never
        // trust a client-computed amount.
        const paymentIntent = await stripe.paymentIntents.retrieve(
          rsvp.stripe_payment_intent_id,
          { expand: ["latest_charge"] }
        );
        const cardDetails = extractCardDetails(paymentIntent);
        const currency = (paymentIntent.currency ?? "usd").toUpperCase();

        if (paymentIntent.status === "requires_capture") {
          // Cancel the uncaptured authorization
          await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
          console.log("✅ Payment authorization cancelled for RSVP:", rsvpId);
          paymentOutcome = {
            kind: "auth_released",
            amount: paymentIntent.amount,
            currency,
            ...cardDetails,
          };
        } else if (paymentIntent.status === "requires_action") {
          // Cancel the PaymentIntent that's waiting for customer authentication
          await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
          console.log(
            "✅ Payment intent (requires_action) cancelled for RSVP:",
            rsvpId
          );
          // In 3DS flow a charge may exist in `pending`; treat as auth-released
          // if we have card details, otherwise fall back to generic denial copy.
          paymentOutcome = cardDetails.cardBrand
            ? {
                kind: "auth_released",
                amount: paymentIntent.amount,
                currency,
                ...cardDetails,
              }
            : { kind: "none" };
        } else if (paymentIntent.status === "requires_confirmation") {
          // Cancel the PaymentIntent that hasn't been confirmed yet
          await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
          console.log(
            "✅ Payment intent (requires_confirmation) cancelled for RSVP:",
            rsvpId
          );
          // No charge/hold ever existed on the user's card — generic copy.
          paymentOutcome = { kind: "none" };
        } else if (paymentIntent.status === "canceled") {
          // Already cancelled, no action needed
          console.log("ℹ️ Payment intent already cancelled for RSVP:", rsvpId);
          paymentOutcome = { kind: "none" };
        } else if (paymentIntent.status === "requires_payment_method") {
          // Payment method not attached or previous attempt failed
          // Cancel it to clean up the PaymentIntent (it's a cancellable status)
          await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
          console.log(
            "✅ Payment intent (requires_payment_method) cancelled for RSVP:",
            rsvpId
          );
          // No successful hold on the user's card — generic copy.
          paymentOutcome = { kind: "none" };
        } else if (paymentIntent.status === "succeeded") {
          // Refund the already-captured payment
          try {
            const refund = await stripe.refunds.create({
              payment_intent: rsvp.stripe_payment_intent_id,
              reverse_transfer: true, // Pull funds back from organizer (destination charge)
            });
            console.log(
              `✅ Payment refunded for RSVP: ${rsvpId}, refund ID: ${refund.id}`
            );
            paymentOutcome = {
              kind: "refunded",
              // Prefer `refund.amount` (authoritative for the actual amount
              // returned to the customer) over `paymentIntent.amount`.
              amount: refund.amount,
              currency: (refund.currency ?? currency).toUpperCase(),
              ...cardDetails,
            };
          } catch (refundError) {
            console.error(`❌ Refund failed for RSVP ${rsvpId}:`, refundError);
            // Mark for manual intervention - user was charged but not refunded
            paymentRequiresFollowUp = true;
            paymentOutcome = { kind: "follow_up" };
          }
        } else if (paymentIntent.status === "processing") {
          // Payment is still processing (common with async payment methods like bank transfers)
          // Cannot cancel or refund until it settles
          console.warn(
            `⚠️ PaymentIntent ${paymentIntent.id} for RSVP ${rsvpId} is still "processing". ` +
              `Cannot cancel/refund until payment settles. Manual follow-up required.`
          );
          paymentRequiresFollowUp = true;
          paymentOutcome = { kind: "follow_up" };
        } else {
          // Unknown status
          console.warn(
            `⚠️ Unexpected PaymentIntent status "${paymentIntent.status}" for RSVP ${rsvpId}`
          );
          paymentRequiresFollowUp = true;
          paymentOutcome = { kind: "follow_up" };
        }
      } catch (stripeError) {
        console.error("Stripe operation failed:", stripeError);
        // We log but continue, marking for manual intervention
        paymentRequiresFollowUp = true;
        paymentOutcome = { kind: "follow_up" };
      }
    }

    // If payment requires follow-up, update the DB record with this flag
    if (paymentRequiresFollowUp) {
      const { error: flagError } = await supabaseAdmin
        .from("rsvps")
        .update({ payment_requires_follow_up: true })
        .eq("id", rsvpId);

      if (flagError) {
        console.error(
          "Failed to set payment_requires_follow_up flag:",
          flagError
        );
      }
    }

    // Get organization name
    const { data: organization, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", rsvpTyped.events.organization_id)
      .single();

    // Send rejection email
    // Check if user exists (can be null if user was deleted)
    if (!rsvp.users || !rsvp.users.email) {
      console.warn("Skipping rejection email: RSVP user not found or has no email", {
        rsvpId,
        userId: rsvp.user_id,
      });
      // Still proceed with rejection, just skip email
    } else {
      try {
        const userName = rsvp.users.first_name
          ? `${rsvp.users.first_name} ${rsvp.users.last_name || ""}`.trim()
          : rsvp.users.email;

        await sendRsvpRejectionEmail({
          userEmail: rsvp.users.email,
          userName: userName,
          eventName: rsvpTyped.events.name,
          eventDate: rsvpTyped.events.starts_at,
          eventTimezone: rsvpTyped.events.timezone || "America/Guayaquil",
          eventVenue: rsvpTyped.events.venue,
          ticketTierName: rsvp.ticket_tiers.name,
          quantity: rsvp.requested_quantity,
          organizationName: organization?.name || "Event Organizer",
          paymentOutcome,
        });

        console.log("✅ RSVP rejection email sent to:", rsvp.users.email);
      } catch (emailError) {
        console.error("❌ Failed to send RSVP rejection email:", emailError);
        // Don't fail the rejection, just log the error
      }
    }

    // ⚡ INSTANT UPDATE: Clear organizer dashboard cache
    revalidatePath("/organizer");

    sendPushNotification({
      userId: rsvp.user_id,
      type: "rsvp_rejected",
      title: "RSVP Update",
      body: `Your RSVP for ${rsvpTyped.events.name} was not approved`,
      data: { deepLink: "/(tabs)/my-tickets", eventId: rsvpTyped.events.id },
    }).catch((err) => console.error("[push] rsvp_rejected failed:", err));

    const rsvpResponse =
      paymentRequiresFollowUp && updatedRsvp
        ? { ...updatedRsvp, payment_requires_follow_up: true }
        : updatedRsvp;

    return NextResponse.json({
      message: paymentRequiresFollowUp
        ? "RSVP rejected. Payment is still processing and requires manual follow-up."
        : "RSVP rejected successfully",
      rsvp: rsvpResponse,
      paymentRequiresFollowUp,
    });
  } catch (error) {
    console.error("RSVP rejection API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
