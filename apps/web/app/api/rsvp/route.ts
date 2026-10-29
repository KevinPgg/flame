import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../lib/supabase/server";
import { z } from "zod";
import {
  sendOrganizerRsvpNotification,
  sendRsvpPendingConfirmation,
} from "../../lib/email/rsvp-notifications";
import { sendPushNotification, sendPushToOrgMembersByRole } from "../../lib/push-notifications";
import { getBaseUrl } from "../../lib/utils/url";
import { revalidatePath } from "next/cache";
import { stripe } from "../../lib/stripe/stripe";
import { filterFieldsForTier,
  validateRsvpGuests,
  RSVP_GUESTS_KEY,
} from "@project-flame/lib";

// Helper function to cancel PaymentIntent and release customer funds
async function cancelPaymentIntentSafely(
  paymentIntentId: string,
  reason: string
) {
  // Note: "processing" is NOT included because it can race to "succeeded"
  // between retrieve() and cancel(), leading to failed cancellation attempts
  const cancellableStatuses = [
    "requires_payment_method",
    "requires_capture",
    "requires_confirmation",
    "requires_action",
  ];

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Handle "processing" status explicitly - wait for final state
    if (paymentIntent.status === "processing") {
      console.warn(
        "PaymentIntent is processing - cannot cancel, wait for webhook:",
        {
          paymentIntentId,
          reason,
          status: paymentIntent.status,
        }
      );
      return { cancelled: false, status: "processing" };
    }

    if (cancellableStatuses.includes(paymentIntent.status)) {
      // Use idempotency key to prevent duplicate cancel attempts
      await stripe.paymentIntents.cancel(
        paymentIntentId,
        {},
        {
          idempotencyKey: `cancel_pi_${paymentIntentId}`,
        }
      );

      // Re-retrieve to verify final status after cancel attempt
      // This ensures we log the true outcome, not just the attempt
      const finalPaymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      if (finalPaymentIntent.status === "canceled") {
        console.log("Successfully cancelled PaymentIntent:", {
          paymentIntentId,
          reason,
          previousStatus: paymentIntent.status,
          finalStatus: finalPaymentIntent.status,
        });
        return { cancelled: true, status: finalPaymentIntent.status };
      } else {
        console.warn(
          "PaymentIntent cancel attempted but status changed (possible race):",
          {
            paymentIntentId,
            reason,
            previousStatus: paymentIntent.status,
            finalStatus: finalPaymentIntent.status,
          }
        );
        return { cancelled: false, status: finalPaymentIntent.status };
      }
    } else {
      console.warn("PaymentIntent not in cancellable state:", {
        paymentIntentId,
        status: paymentIntent.status,
        reason,
      });
      return { cancelled: false, status: paymentIntent.status };
    }
  } catch (cancelErr) {
    console.error("CRITICAL: Failed to cancel PaymentIntent:", {
      paymentIntentId,
      reason,
      error: cancelErr,
    });

    // Try to retrieve final status even on exception
    try {
      const finalPaymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );
      console.log("Retrieved PaymentIntent status after cancel error:", {
        paymentIntentId,
        status: finalPaymentIntent.status,
      });
      return { cancelled: false, status: finalPaymentIntent.status };
    } catch (retrieveError) {
      console.error("Failed to retrieve PaymentIntent after cancel error:", {
        paymentIntentId,
        retrieveError,
      });
      return { cancelled: false, status: "error" };
    }
  }
}

// Validation schema for RSVP creation
// Helper function to return error response with PaymentIntent cancellation
async function returnErrorWithCancellation(
  error: string,
  status: number,
  paymentIntentId: string | undefined,
  reason: string,
  code?: string
) {
  // Cancel PaymentIntent if provided
  if (paymentIntentId) {
    await cancelPaymentIntentSafely(paymentIntentId, reason);
  }
  
  const response: { error: string; code?: string } = { error };
  if (code) {
    response.code = code;
  }
  
  return NextResponse.json(response, { status });
}

const rsvpSchema = z.object({
  pending_rsvp_id: z.string().uuid().optional(),
  event_id: z.string().uuid().optional(),
  ticket_tier_id: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(100).optional().default(1),
  stage_id: z.string().uuid().optional(), // Optional stage_id for staged tiers
  secret_code: z
    .string()
    .trim()
    .min(3, "Secret code must be at least 3 characters")
    .optional(), // Optional: if provided, must be at least 3 chars after trimming
  promoter_code: z.string().optional(),
  registration_data: z.record(z.string(), z.any()).optional(), // Plain object keyed by form field IDs
  paymentIntentId: z
    .string()
    .regex(/^pi_.+|^free_promo_.+$/, "Invalid PaymentIntent ID format")
    .optional(),
  promotional_code_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  // Store paymentIntentId at top level for outer catch block cancellation
  let paymentIntentId: string | undefined;
  let pendingRsvpId: string | undefined;

  try {
    const { userId } = await auth();

    if (!userId || !supabaseAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // CRITICAL: Extract paymentIntentId BEFORE Zod validation
    // This ensures the outer catch block can cancel the PaymentIntent even if validation fails
    paymentIntentId = body.paymentIntentId;
    pendingRsvpId = body.pending_rsvp_id;

    const {
      pending_rsvp_id: parsedPendingRsvpId,
      event_id: parsedEventId,
      ticket_tier_id: parsedTicketTierId,
      quantity: parsedQuantity,
      stage_id: parsedStageId,
      secret_code: parsedSecretCode,
      promoter_code: parsedPromoterCode,
      registration_data: parsedRegistrationData,
      paymentIntentId: parsedPaymentIntentId,
      promotional_code_id: parsedPromotionalCodeId,
    } = rsvpSchema.parse(body);

    // Update with validated values
    paymentIntentId = parsedPaymentIntentId;
    pendingRsvpId = parsedPendingRsvpId;

    let event_id = parsedEventId;
    let ticket_tier_id = parsedTicketTierId;
    let quantity = parsedQuantity;
    let stage_id = parsedStageId;
    let secret_code = parsedSecretCode;
    let promoter_code = parsedPromoterCode;
    let registration_data = parsedRegistrationData;
    let promotional_code_id = parsedPromotionalCodeId;
    let discount_amount_cents = 0; // Initialize discount amount

    if (pendingRsvpId) {
      if (!paymentIntentId) {
        return NextResponse.json(
          { error: "Missing payment intent for pending RSVP" },
          { status: 400 }
        );
      }

      const { data: pendingData, error: pendingError } = await supabaseAdmin
        .from("rsvp_pending_requests")
        .select(
          "event_id, ticket_tier_id, quantity, stage_id, secret_code, promoter_code, registration_data, clerk_user_id, expires_at"
        )
        .eq("id", pendingRsvpId)
        .single();

      if (pendingError || !pendingData) {
        // Cancel PaymentIntent to release funds if pending RSVP is lost
        if (paymentIntentId) {
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Pending RSVP details not found"
          );
        }
        return NextResponse.json(
          { error: "Pending RSVP details not found" },
          { status: 404 }
        );
      }

      if (pendingData.clerk_user_id !== userId) {
        // Cancel PaymentIntent if unauthorized
        if (paymentIntentId) {
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Unauthorized pending RSVP access"
          );
        }
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      if (pendingData.expires_at) {
        const expiresAt = new Date(pendingData.expires_at);
        if (Number.isFinite(expiresAt.getTime()) && expiresAt < new Date()) {
          // Cancel PaymentIntent if expired
          if (paymentIntentId) {
            await cancelPaymentIntentSafely(
              paymentIntentId,
              "Pending RSVP details expired"
            );
          }
          return NextResponse.json(
            { error: "Pending RSVP details expired" },
            { status: 410 }
          );
        }
      }

      event_id = pendingData.event_id;
      ticket_tier_id = pendingData.ticket_tier_id;
      quantity = pendingData.quantity ?? 1;
      stage_id = pendingData.stage_id ?? undefined;
      secret_code = pendingData.secret_code ?? undefined;
      promoter_code = pendingData.promoter_code ?? undefined;
      registration_data = pendingData.registration_data ?? undefined;
    }

    if (!event_id || !ticket_tier_id) {
      // Cancel PaymentIntent if missing required details
      if (paymentIntentId) {
        await cancelPaymentIntentSafely(
          paymentIntentId,
          "Missing required RSVP details (event_id or ticket_tier_id)"
        );
      }
      return NextResponse.json(
        { error: "Missing required RSVP details" },
        { status: 400 }
      );
    }

    // Get the user's Supabase ID early for ownership validation
    let { data: supabaseUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    // If user not found in Supabase, try to sync them from Clerk
    if (userError || !supabaseUser) {
      console.log(
        "User not found in Supabase, attempting to sync from Clerk..."
      );

      const clerkUser = await currentUser();
      if (!clerkUser) {
        // Cancel PaymentIntent to release customer funds before returning
        if (paymentIntentId) {
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "User not found in Clerk"
          );
        }
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const { data: syncedUser, error: syncError } = await supabaseAdmin
        .from("users")
        .upsert(
          {
            clerk_id: userId,
            email: clerkUser.emailAddresses[0]?.emailAddress || "",
            first_name: clerkUser.firstName || null,
            last_name: clerkUser.lastName || null,
          },
          {
            onConflict: "clerk_id",
          }
        )
        .select()
        .single();

      if (syncError || !syncedUser) {
        console.error("Failed to sync user to Supabase:", syncError);
        // Cancel PaymentIntent to release customer funds before returning
        if (paymentIntentId) {
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Failed to sync user to Supabase"
          );
        }
        return NextResponse.json(
          { error: "Failed to sync user data" },
          { status: 500 }
        );
      }

      supabaseUser = syncedUser;
      console.log("✅ User successfully synced to Supabase");
    }

    // TypeScript guard: Ensure supabaseUser is not null after sync
    if (!supabaseUser) {
      // Cancel PaymentIntent to release customer funds before returning
      if (paymentIntentId) {
        await cancelPaymentIntentSafely(
          paymentIntentId,
          "User not found after sync attempt"
        );
      }
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Validate Payment Intent if provided (Auth & Capture Flow)
    // Skip Stripe validation for free promo codes (handled separately)
    const isFreePromo = paymentIntentId?.startsWith("free_promo_");
    
    if (paymentIntentId && !isFreePromo) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          paymentIntentId
        );

        // NOTE: validStatuses includes "succeeded" to handle idempotent/retry scenarios
        // where a prior webhook already captured the PaymentIntent. This allows RSVP creation
        // to be safely retried without failing on already-processed payments.
        const validStatuses = ["requires_capture", "succeeded"];
        if (!validStatuses.includes(paymentIntent.status)) {
          console.error(
            `Invalid PaymentIntent status for RSVP: ${paymentIntent.status}`
          );
          // Cancel payment to release authorization and prevent funds being held
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Invalid payment status: " + paymentIntent.status
          );
          return NextResponse.json(
            {
              error:
                "Payment authorization failed. Status: " + paymentIntent.status,
            },
            { status: 400 }
          );
        }

        // SECURITY: Validate PaymentIntent metadata matches RSVP request
        // This prevents attackers from using a payment for a cheap ticket to RSVP for an expensive one
        const metadata = paymentIntent.metadata;

        // SECURITY: Verify ownership first - only the creator can use this PaymentIntent
        if (metadata.userId !== supabaseUser.id) {
          console.error(
            `PaymentIntent userId mismatch: expected ${supabaseUser.id}, got ${metadata.userId}`
          );
          // Cancel payment to release authorization and prevent misuse
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Ownership verification failed"
          );
          return NextResponse.json(
            {
              error: "Unauthorized: You cannot use this payment authorization",
            },
            { status: 403 }
          );
        }

        // Verify this is an RSVP payment intent
        if (metadata.type !== "rsvp_request") {
          console.error(
            `PaymentIntent type mismatch: expected rsvp_request, got ${metadata.type}`
          );
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Payment type validation failed"
          );
          return NextResponse.json(
            { error: "Invalid payment type for RSVP" },
            { status: 400 }
          );
        }

        // Verify event matches
        if (metadata.eventId !== event_id) {
          console.error(
            `PaymentIntent eventId mismatch: expected ${event_id}, got ${metadata.eventId}`
          );
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Event ID validation failed"
          );
          return NextResponse.json(
            { error: "Payment authorization does not match this event" },
            { status: 400 }
          );
        }

        // Verify ticket tier matches
        if (metadata.ticketTierId !== ticket_tier_id) {
          console.error(
            `PaymentIntent ticketTierId mismatch: expected ${ticket_tier_id}, got ${metadata.ticketTierId}`
          );
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Ticket tier validation failed"
          );
          return NextResponse.json(
            { error: "Payment authorization does not match this ticket tier" },
            { status: 400 }
          );
        }

        // Verify quantity matches (metadata values are strings)
        if (metadata.quantity !== String(quantity)) {
          console.error(
            `PaymentIntent quantity mismatch: expected ${quantity}, got ${metadata.quantity}`
          );
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Quantity validation failed"
          );
          return NextResponse.json(
            {
              error: "Payment authorization does not match requested quantity",
            },
            { status: 400 }
          );
        }

        // Verify stage matches (if stage_id is provided in RSVP request)
        // metadata.stageId can be null/undefined for non-staged tiers
        const metadataStageId = metadata.stageId || null;
        const requestStageId = stage_id || null;
        if (metadataStageId !== requestStageId) {
          console.error(
            `PaymentIntent stageId mismatch: expected ${requestStageId}, got ${metadataStageId}`
          );
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "Stage ID validation failed"
          );
          return NextResponse.json(
            { error: "Payment authorization does not match selected stage" },
            { status: 400 }
          );
        }
      } catch (e) {
        console.error("Error retrieving PaymentIntent:", e);

        // Attempt to cancel the PaymentIntent to release customer funds
        // This prevents funds being held if validation fails
        if (paymentIntentId) {
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "PaymentIntent retrieval or validation failed"
          );
        }

        return NextResponse.json(
          { error: "Invalid payment authorization" },
          { status: 400 }
        );
      }
    }

    // Extract price data from metadata to update RSVP
    // This ensures the RSVP record reflects the actual price (including discounts)
    // rather than just the base tier price
    let paymentMetadata: Record<string, any> | undefined;
    if (paymentIntentId && !isFreePromo) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        paymentMetadata = pi.metadata;
        
        // Extract discount amount if available in metadata
        if (paymentMetadata?.discountAmountCents) {
          const discount = parseInt(paymentMetadata.discountAmountCents, 10);
          if (Number.isFinite(discount)) {
            discount_amount_cents = discount;
          }
        }

        // Extract promotional code ID if available in metadata
        // This ensures the RSVP record links to the promo code used for payment
        if (paymentMetadata?.promotionalCodeId) {
          promotional_code_id = paymentMetadata.promotionalCodeId;
        }
      } catch (e) {
        console.warn("Failed to retrieve PI metadata for RSVP update:", e);
      }
    }

    // Handle free promo code validation
    if (isFreePromo) {
      if (!promotional_code_id) {
        return NextResponse.json(
          { error: "Missing discount code for free purchase" },
          { status: 400 }
        );
      }

      // Verify promo code and calculate discount
      const { data: promoCode, error: promoError } = await supabaseAdmin
        .from("promotional_codes")
        .select("id, code, discount_percentage, event_id")
        .eq("id", promotional_code_id)
        .single();

      if (promoError || !promoCode) {
        return NextResponse.json(
          { error: "Invalid discount code" },
          { status: 400 }
        );
      }

      if (promoCode.event_id !== event_id) {
        return NextResponse.json(
          { error: "Discount code not valid for this event" },
          { status: 400 }
        );
      }

      // We'll verify the total is 0 later when we have the tier price
      // For now, prepare metadata to simulate what Stripe would have returned
      paymentMetadata = {
        promotionalCodeId: promoCode.id,
        promoCode: promoCode.code,
        // We'll calculate amounts after fetching tier
      };
    }

    // Handle registration data and potential profile updates (Cedula)
    // Update user's document_id if cedula is provided in registration form
    if (registration_data) {
      // Check for common cedula field names
      const cedulaValue =
        registration_data["cedula"] ||
        registration_data["document_id"] ||
        registration_data["id_number"] ||
        registration_data["identificacion"]; // Common Spanish terms

      if (cedulaValue) {
        // Update user's document_id if found in form
        // This saves cedula to user profile when provided in registration form
        const { error: updateError } = await supabaseAdmin
          .from("users")
          .update({ document_id: cedulaValue.toString() })
          .eq("id", supabaseUser.id);

        if (updateError) {
          console.error(
            "Failed to update user document_id from form:",
            updateError
          );
          // Continue even if update fails - cedula is not required
        } else {
          console.log("✅ User document_id updated from registration form");
        }
      }
    }

    // Check if event exists and is published
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select(
        `
        id, 
        name, 
        status, 
        max_attendees, 
        starts_at, 
        venue,
        registration_form_config,
        organization_id,
        organizations!organization_id (
          id,
          name
        )
      `
      )
      .eq("id", event_id)
      .eq("status", "published")
      .single();

    if (eventError || !event) {
      return await returnErrorWithCancellation(
        "Event not found",
        404,
        paymentIntentId,
        "Event not found during RSVP creation"
      );
    }

    // Check if ticket tier exists and belongs to this event
    // Fetch tier BEFORE form validation so we can filter fields based on tier config
    // Include ticket_stages to properly validate stage-based availability
    // Include secret_code + is_hidden to gate hidden-tier RSVPs (W4-C3, Jun 2026)
    // Include registration_form_fields to filter which form fields apply to this tier
    const { data: ticketTier, error: tierError } = await supabaseAdmin
      .from("ticket_tiers")
      .select(
        `id, name, price_cents, quantity_total, quantity_sold, per_user_limit, sales_start, sales_end, secret_code, is_hidden, registration_form_fields,
         ticket_stages (
           id,
           name,
           price_cents,
           quantity,
           sold_quantity,
           order_index
         )`
      )
      .eq("id", ticket_tier_id)
      .eq("event_id", event_id)
      .single();

    if (tierError || !ticketTier) {
      return await returnErrorWithCancellation(
        "Ticket tier not found",
        404,
        paymentIntentId,
        "Ticket tier not found during RSVP creation"
      );
    }

    // If free promo, verify total amount is 0
    if (isFreePromo && paymentMetadata) {
      let basePrice = ticketTier.price_cents;
      
      // If stage selected, use stage price
      if (stage_id) {
        const stage = ticketTier.ticket_stages.find((s: any) => s.id === stage_id);
        if (stage) {
          basePrice = stage.price_cents;
        }
      }

      const subtotal = basePrice * quantity;
      
      // SECURITY: Verify that the promotional code actually grants 100% discount
      // Do NOT trust the client's "free_promo_" prefix without verification
      if (!promotional_code_id) {
         return NextResponse.json(
          { error: "Missing discount code ID for free purchase validation" },
          { status: 400 }
        );
      }

      const { data: promoVerification, error: verificationError } = await supabaseAdmin
        .from("promotional_codes")
        .select("discount_percentage, id")
        .eq("id", promotional_code_id)
        .single();

      if (verificationError || !promoVerification) {
        return NextResponse.json(
          { error: "Invalid discount code" },
          { status: 400 }
        );
      }

      if (promoVerification.discount_percentage !== 100) {
        console.error("Security Alert: Attempted free purchase with non-100% promo code", {
           userId,
           promotionalCodeId: promotional_code_id,
           discountPercentage: promoVerification.discount_percentage
        });
        return NextResponse.json(
          { error: "Discount code does not grant 100% discount" },
          { status: 400 }
        );
      }
      
      // We'll update paymentMetadata with calculated amounts for the RSVP update later
      // For 100% discount, basePriceCents (the discounted base price) must be 0
      paymentMetadata.basePriceCents = "0";
      paymentMetadata.totalAmountCents = "0"; // Enforce 0 for free promo
      paymentMetadata.platformFeeCents = "0";
      
      // Set discount amount for free promo (100% discount)
      discount_amount_cents = subtotal;
    }

    // Resolve the tier-effective form config first, then decide whether to
    // require registration_data. `filterFieldsForTier` is the single source of
    // truth — see `packages/lib/src/utils/registration-form.ts`. It also applies
    // the archived-field hide that historically lived inline here.
    //   - tier.registration_form_fields == null/undefined → all non-archived fields
    //   - tier.registration_form_fields == []              → NO fields (collect nothing)
    //   - tier.registration_form_fields == [ids]           → only those (and non-archived)
    const baseFormConfig = Array.isArray(event.registration_form_config)
      ? event.registration_form_config
      : [];
    const formConfig = filterFieldsForTier(
      baseFormConfig,
      ticketTier.registration_form_fields,
    );

    // Validated and filtered registration data (only includes fields from form config)
    let validatedRegistrationData: Record<string, any> | undefined = undefined;

    if (formConfig.length > 0) {
      if (!registration_data || typeof registration_data !== "object") {
        return await returnErrorWithCancellation(
          "Registration form data is required",
          400,
          paymentIntentId,
          "Missing registration form data"
        );
      }

      const missingFields: string[] = [];
      validatedRegistrationData = {};

      // Check required fields and build validated data object
      // Only validate fields that apply to this tier
      for (const field of formConfig) {
        const value = registration_data[field.id];

        if (field.required) {
          if (
            value === undefined ||
            value === null ||
            (typeof value === "string" && value.trim() === "") ||
            (field.type === "checkbox" && !value)
          ) {
            missingFields.push(field.label || field.id);
          }
        }

        // Only include fields that are in the form config (filter unexpected keys)
        if (value !== undefined && value !== null) {
          validatedRegistrationData[field.id] = value;
        }
      }

      // Fase 3.4: answers of guests 2..N (`_guests`), validated like the requester's. Older
      // clients don't send it and stay valid; guest 1 stays at the top level as always.
      const guestCheck = validateRsvpGuests(formConfig, registration_data, quantity);
      if (guestCheck.error) {
        return await returnErrorWithCancellation(guestCheck.error, 400, paymentIntentId, "Invalid guest answers", "INVALID_GUESTS");
      }
      missingFields.push(...guestCheck.missing);
      if (guestCheck.guests) validatedRegistrationData[RSVP_GUESTS_KEY] = guestCheck.guests;

      if (missingFields.length > 0) {
        return await returnErrorWithCancellation(
          `Missing required fields: ${missingFields.join(", ")}`,
          400,
          paymentIntentId,
          "Missing required registration fields",
          "MISSING_REQUIRED_FIELDS"
        );
      }
    }

    // Normalize empty string to undefined
    const normalizedSecretCode = secret_code === "" ? undefined : secret_code;

    // Validate secret code if tier is HIDDEN and has a code (W4-C3, Jun 2026).
    // Tiers with a secret_code but is_hidden=false no longer gate RSVPs — the
    // access-code input on the event page is the only path that uses codes,
    // and it only unlocks hidden tiers.
    if (ticketTier.is_hidden && ticketTier.secret_code) {
      if (!normalizedSecretCode) {
        return await returnErrorWithCancellation(
          "Access code is required for this ticket tier",
          403,
          paymentIntentId,
          "Missing secret code",
          "MISSING_SECRET_CODE"
        );
      }
      // Case-insensitive comparison
      if (
        ticketTier.secret_code.trim().toUpperCase() !==
        normalizedSecretCode.trim().toUpperCase()
      ) {
        return await returnErrorWithCancellation(
          "Invalid access code",
          403,
          paymentIntentId,
          "Invalid secret code",
          "INVALID_SECRET_CODE"
        );
      }
    }

    // Check if tier is available
    const now = new Date();
    const salesStart = ticketTier.sales_start
      ? new Date(ticketTier.sales_start)
      : null;
    const salesEnd = ticketTier.sales_end
      ? new Date(ticketTier.sales_end)
      : null;

    if (salesStart && now < salesStart) {
      return await returnErrorWithCancellation(
        "Ticket sales have not started yet",
        400,
        paymentIntentId,
        "Sales not started"
      );
    }

    if (salesEnd && now > salesEnd) {
      return await returnErrorWithCancellation(
        "Ticket sales have ended",
        400,
        paymentIntentId,
        "Sales ended"
      );
    }

    // Note: Availability validation is now done atomically in the database function
    // to prevent race conditions. We'll call create_rsvp_atomic which locks rows
    // and validates availability in a single transaction.

    // Check per-user limit
    // Note: This is checked AFTER stage availability to ensure per_user_limit doesn't exceed what's available
    if (ticketTier.per_user_limit !== null) {
      if (ticketTier.per_user_limit === 0) {
        return await returnErrorWithCancellation(
          "This ticket tier is not available for purchase",
          400,
          paymentIntentId,
          "Tier not available for purchase"
        );
      }
      if (quantity > ticketTier.per_user_limit) {
        return await returnErrorWithCancellation(
          `Maximum ${ticketTier.per_user_limit} ticket${ticketTier.per_user_limit === 1 ? "" : "s"} per user for this tier`,
          400,
          paymentIntentId,
          "Per-user limit exceeded"
        );
      }
    }

    // Check total RSVPs for the event (event capacity check)
    const { count: totalRsvps } = await supabaseAdmin
      .from("rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event_id)
      .in("status", ["pending", "approved"]);

    if (totalRsvps && totalRsvps >= event.max_attendees) {
      return await returnErrorWithCancellation(
        "This event has reached maximum capacity",
        400,
        paymentIntentId,
        "Event at maximum capacity"
      );
    }

    // Create the RSVP atomically using database function
    // This prevents race conditions by locking rows and validating availability in a single transaction
    const { data: rsvpResult, error: rsvpError } = await supabaseAdmin.rpc(
      "create_rsvp_atomic",
      {
        p_user_id: supabaseUser.id,
        p_event_id: event_id,
        p_ticket_tier_id: ticket_tier_id,
        p_quantity: quantity,
        p_stage_id: stage_id || null, // Pass the requested stage_id if provided
        p_promoter_code: promoter_code || null,
        p_promotional_code_id: promotional_code_id || null,
        p_discount_amount_cents: discount_amount_cents || 0,
      }
    );

    if (rsvpError) {
      // Handle specific error cases first to determine logging level
      if (rsvpError.code === "23505") {
        // Unique violation - user already has RSVP
        // Log as info since this is a handled user action, not a system error
        console.log(
          `Duplicate RSVP attempt blocked: User ${supabaseUser.id}, Event ${event_id}`
        );

        // Cancel PaymentIntent to release customer funds immediately
        if (paymentIntentId) {
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "RSVP creation failed: duplicate RSVP"
          );
        }

        return NextResponse.json(
          {
            error: "You already have an RSVP for this event",
            code: "DUPLICATE_RSVP",
          },
          { status: 400 }
        );
      } else if (rsvpError.code === "23514" || rsvpError.code === "P0002") {
        // Check violation or not found - availability issue
        // Log as info/warn since this is a business logic rejection
        console.log(`RSVP availability check failed: ${rsvpError.message}`);

        // Use structured HINT field from DB for machine-readable error classification
        const errorHint = rsvpError.hint;
        let errorCode = "AVAILABILITY_ERROR"; // Default fallback

        // Check structured hint first (preferred method)
        if (errorHint === "SOLD_OUT") {
          errorCode = "SOLD_OUT";
        } else if (errorHint === "INSUFFICIENT_QUANTITY") {
          errorCode = "INSUFFICIENT_QUANTITY";
        } else {
          // Fallback: prioritized exact matches with word boundaries if hint is missing
          const errorMsg = rsvpError.message?.toLowerCase() || "";

          // Check for exact "sold out" phrase first (highest priority)
          if (/\bsold out\b/.test(errorMsg)) {
            errorCode = "SOLD_OUT";
          }
          // Then check for availability-related terms
          else if (
            /\bavailable\b/.test(errorMsg) ||
            /\binsufficient\b/.test(errorMsg)
          ) {
            errorCode = "INSUFFICIENT_QUANTITY";
          }
          // Otherwise keep the default AVAILABILITY_ERROR
        }

        // Cancel PaymentIntent to release customer funds immediately
        if (paymentIntentId) {
          await cancelPaymentIntentSafely(
            paymentIntentId,
            "RSVP creation failed: availability issue"
          );
        }

        return NextResponse.json(
          {
            error: rsvpError.message || "Insufficient tickets available",
            code: errorCode,
          },
          { status: 400 }
        );
      }

      // For any other UNEXPECTED errors, log as actual error
      console.error("Error creating RSVP:", {
        error: rsvpError,
        user_id: supabaseUser.id,
        event_id,
        ticket_tier_id,
        quantity,
      });

      // Cancel PaymentIntent to release customer funds immediately
      if (paymentIntentId) {
        await cancelPaymentIntentSafely(
          paymentIntentId,
          "RSVP creation failed: unexpected database error"
        );
      }

      return NextResponse.json(
        { error: "Failed to create RSVP" },
        { status: 500 }
      );
    }

    if (!rsvpResult || !rsvpResult.success) {
      // Cancel PaymentIntent to release customer funds immediately
      if (paymentIntentId) {
        await cancelPaymentIntentSafely(
          paymentIntentId,
          "RSVP creation failed: database function returned failure"
        );
      }

      return NextResponse.json(
        { error: "Failed to create RSVP" },
        { status: 500 }
      );
    }

    const rsvpId = rsvpResult.rsvp_id;

    // Save PaymentIntent ID if provided
    if (paymentIntentId) {
      // For free promo, don't save the fake ID to stripe_payment_intent_id column
      // But we DO want to save price details
      const updateData: any = {};
      
      if (!isFreePromo) {
        updateData.stripe_payment_intent_id = paymentIntentId;
      }
      
      // Update price fields from metadata if available
      if (paymentMetadata) {
        if (paymentMetadata.basePriceCents) {
          const basePrice = parseInt(paymentMetadata.basePriceCents, 10);
          if (!isNaN(basePrice)) updateData.base_price_cents = basePrice;
        }
        if (paymentMetadata.markupPercent) {
          const markupPercent = parseFloat(paymentMetadata.markupPercent);
          if (!isNaN(markupPercent)) updateData.markup_percent = markupPercent;
        }
        if (paymentMetadata.markupFixedCents) {
          const markupFixed = parseInt(paymentMetadata.markupFixedCents, 10);
          if (!isNaN(markupFixed)) updateData.markup_fixed_cents = markupFixed;
        }
        // Calculate total amount (base + markup)
        // Note: platformFeeCents in metadata is the total markup amount
        if (paymentMetadata.basePriceCents && paymentMetadata.platformFeeCents) {
           const base = parseInt(paymentMetadata.basePriceCents, 10);
           const fee = parseInt(paymentMetadata.platformFeeCents, 10);
           if (!isNaN(base) && !isNaN(fee)) {
             updateData.total_amount_cents = base + fee;
           }
        }
        // Explicit override for free promo
        if (isFreePromo) {
          updateData.total_amount_cents = 0;
        }
      }

      const { error: piUpdateError } = await supabaseAdmin
        .from("rsvps")
        .update(updateData)
        .eq("id", rsvpId);

      if (piUpdateError) {
        console.error("CRITICAL: Failed to save PaymentIntent ID to RSVP:", {
          rsvpId,
          paymentIntentId,
          error: piUpdateError,
          timestamp: new Date().toISOString(),
        });

        // Attempt to rollback the RSVP by deleting it to prevent blocking future RSVP attempts
        // Since the PaymentIntent ID save failed, the RSVP is in an inconsistent state
        // and should be removed entirely rather than just marked as cancelled
        try {
          const { error: rollbackError } = await supabaseAdmin
            .from("rsvps")
            .delete()
            .eq("id", rsvpId);

          if (rollbackError) {
            console.error(
              "CRITICAL: Failed to delete RSVP after payment save failure:",
              rollbackError
            );
          } else {
            console.log(
              `Successfully deleted RSVP ${rsvpId} after PaymentIntent ID save failure`
            );
          }
        } catch (rollbackErr) {
          console.error("Exception during RSVP rollback:", rollbackErr);
        }

        // Cancel the PaymentIntent to avoid capture of orphaned authorization
        await cancelPaymentIntentSafely(
          paymentIntentId,
          "Failed to save payment_intent_id to RSVP record"
        );

        return NextResponse.json(
          {
            error:
              "Failed to save payment information. Your payment authorization has been cancelled.",
          },
          { status: 500 }
        );
      }

      // CRITICAL: Update PaymentIntent metadata with RSVP ID for security validation
      // The PaymentIntent was created BEFORE the RSVP existed, so metadata.rsvpId was undefined.
      // Update it now so the approval route can validate the payment belongs to this RSVP.
      if (!isFreePromo) {
        try {
          await stripe.paymentIntents.update(paymentIntentId, {
            metadata: {
              rsvpId: rsvpId,
            },
          });
          console.log("✅ Updated PaymentIntent metadata with RSVP ID:", {
            paymentIntentId,
            rsvpId,
          });
        } catch (metadataUpdateError) {
          console.error("Failed to update PaymentIntent metadata with RSVP ID:", {
            paymentIntentId,
            rsvpId,
            error: metadataUpdateError,
          });
          // Don't fail the RSVP creation for this - the RSVP-PaymentIntent link exists in the database
          // The approval route can fall back to database validation if metadata is missing
        }
      }
    }

    // Save registration data if present
    // Use validated data if form config exists, otherwise use original registration_data
    let dataToSave = validatedRegistrationData ?? registration_data;

    // Inject promotional_code_id into registration_data if present (for free promo tracking)
    // This allows the approval route to find the promo code and record it in the order
    if (promotional_code_id) {
      if (!dataToSave) {
        // If no registration data, create a new object
        dataToSave = { _promotional_code_id: promotional_code_id };
      } else {
        // Create a new object to avoid mutating the original if it's a reference
        dataToSave = { ...dataToSave, _promotional_code_id: promotional_code_id };
      }
    }

    if (
      dataToSave &&
      typeof dataToSave === "object" &&
      Object.keys(dataToSave).length > 0
    ) {
      const { error: updateError } = await supabaseAdmin
        .from("rsvps")
        .update({ registration_data: dataToSave })
        .eq("id", rsvpId);

      if (updateError) {
        // Enhanced error logging with context for debugging
        console.error(
          `Failed to save registration data for RSVP ${rsvpId} (event: ${event_id}):`,
          {
            error: updateError,
            rsvpId,
            eventId: event_id,
            registrationDataKeys: dataToSave ? Object.keys(dataToSave) : [],
            timestamp: new Date().toISOString(),
          }
        );
        // Not failing the RSVP creation, but logging it with full context.
        // Organizers can check logs if registration data appears missing.
      } else {
        console.log(
          `✅ Registration data saved for RSVP ${rsvpId} (event: ${event_id})`
        );
      }
    }

    // Send pending confirmation email to user
    try {
      const clerkUser = await currentUser();
      const organization = event.organizations as any;

      await sendRsvpPendingConfirmation({
        userEmail: clerkUser?.emailAddresses[0]?.emailAddress || "",
        userName:
          `${clerkUser?.firstName || ""} ${clerkUser?.lastName || ""}`.trim() ||
          "User",
        eventName: event.name,
        eventDate: event.starts_at,
        eventVenue: event.venue,
        ticketTierName: ticketTier.name,
        quantity: quantity,
        organizationName: organization?.name || "Organization",
      });
    } catch (confirmationError) {
      // Log error but don't fail the RSVP creation
      console.error(
        "Error sending user pending confirmation email:",
        confirmationError
      );
    }

    // Send notification to organizers (gated by env var — set SEND_ORGANIZER_RSVP_EMAIL=true to enable)
    if (process.env.SEND_ORGANIZER_RSVP_EMAIL === "true") {
      try {
        const clerkUser = await currentUser();
        const organization = event.organizations as any;

        // Get owner+admin members for this event's org
        const { data: organizationMembers, error: membersError } =
          await supabaseAdmin
            .from("organization_members")
            .select(
              `
            user_id,
            role,
            users!user_id (
              first_name,
              last_name,
              email
            )
          `
            )
            .eq("organization_id", event.organization_id)
            .in("role", ["owner", "admin"]);

        // Also fetch organizers assigned to this specific event
        const { data: assignedOrganizers, error: assignedOrganizersError } =
          await supabaseAdmin
            .from("event_assignments")
            .select(
              `
            user_id,
            users:user_id (
              first_name,
              last_name,
              email
            )
          `
            )
            .eq("event_id", event.id)
            .eq("organization_id", event.organization_id)
            .not("user_id", "is", null);

        if (assignedOrganizersError) {
          console.error("[rsvp] event_assignments notification lookup failed:", {
            action: "rsvp notification lookup",
            eventId: event.id,
            organizationId: event.organization_id,
            error: assignedOrganizersError,
          });
        }

        if (membersError) {
          console.error(
            "[rsvp] organization_members notification lookup failed:",
            {
              action: "rsvp notification lookup",
              eventId: event.id,
              organizationId: event.organization_id,
              error: membersError,
            }
          );
        }

        // Merge owner/admin + assigned organizers, dedupe by user_id
        const recipientMap = new Map<
          string,
          { first_name: string | null; last_name: string | null; email: string }
        >();
        if (!membersError && organizationMembers) {
          for (const member of organizationMembers) {
            const user = member.users as any;
            if (user?.email) recipientMap.set(member.user_id, user);
          }
        }
        if (assignedOrganizers) {
          for (const assignment of assignedOrganizers) {
            const user = assignment.users as any;
            if (
              user?.email &&
              assignment.user_id &&
              !recipientMap.has(assignment.user_id)
            ) {
              recipientMap.set(assignment.user_id, user);
            }
          }
        }

        const rsvpManagementUrl = `${getBaseUrl()}/organizer/rsvps/${event.id}`;
        for (const [, organizer] of recipientMap) {
          if (organizer?.email) {
            await sendOrganizerRsvpNotification({
              organizerEmail: organizer.email,
              organizerName:
                `${organizer.first_name || ""} ${organizer.last_name || ""}`.trim() ||
                "Organizer",
              userEmail: clerkUser?.emailAddresses[0]?.emailAddress || "",
              userName:
                `${clerkUser?.firstName || ""} ${clerkUser?.lastName || ""}`.trim() ||
                "User",
              eventName: event.name,
              eventDate: event.starts_at,
              eventVenue: event.venue,
              ticketTierName: ticketTier.name,
              quantity: quantity,
              organizationName: organization?.name || "Organization",
              rsvpManagementUrl,
            });
          }
        }
      } catch (notificationError) {
        // Non-fatal — log but don't fail the RSVP creation
        console.error(
          "Error sending organizer notification:",
          notificationError
        );
      }
    }

    if (pendingRsvpId) {
      const { error: cleanupError } = await supabaseAdmin
        .from("rsvp_pending_requests")
        .delete()
        .eq("id", pendingRsvpId);

      if (cleanupError) {
        console.error("Failed to clean up pending RSVP request:", {
          pendingRsvpId,
          error: cleanupError,
        });
      }
    }

    // ⚡ INSTANT UPDATE: Clear organizer dashboard cache (new RSVP increases pending count)
    revalidatePath("/organizer");

    // Push notifications (fire-and-forget)
    const clerkUserForPush = await currentUser().catch(() => null);
    const pushUserName = clerkUserForPush
      ? `${clerkUserForPush.firstName || ""} ${clerkUserForPush.lastName || ""}`.trim() || "Someone"
      : "Someone";

    sendPushNotification({
      userId: supabaseUser.id,
      type: "rsvp_pending",
      title: "RSVP Received",
      body: `Your RSVP for ${event.name} is pending approval`,
      data: { deepLink: "/(tabs)/my-tickets", eventId: event.id },
    }).catch((err) => console.error("[push] rsvp_pending failed:", err));

    sendPushToOrgMembersByRole(
      event.organization_id,
      "new_rsvp_request",
      "New RSVP Request",
      `${pushUserName} requested ${quantity} ticket(s) for ${event.name}`,
      ["owner", "admin"],
      {
        eventId: event.id,
        data: {
          deepLink: "/(tabs)/rsvp",
          eventId: event.id,
          orgId: event.organization_id,
        },
      },
    ).catch((err) => console.error("[push] new_rsvp_request failed:", err));

    return NextResponse.json({
      message: "RSVP submitted successfully",
      rsvp: {
        id: rsvpId,
        status: "pending",
        requested_at: rsvpResult.requested_at,
      },
    });
  } catch (error) {
    console.error("RSVP API error:", error);

    // Attempt to cancel any authorized payment on unhandled errors
    // This is a safety net to prevent customer funds being held for up to 7 days
    // if an exception occurs after PaymentIntent validation but before explicit handlers
    if (paymentIntentId) {
      try {
        await cancelPaymentIntentSafely(
          paymentIntentId,
          "Unhandled RSVP API error"
        );
      } catch (cancelErr) {
        // Log but don't throw - this is best-effort cleanup
        console.error(
          "Failed to cancel PaymentIntent in outer catch:",
          cancelErr
        );
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
