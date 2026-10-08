import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { stripe } from "@/app/lib/stripe/stripe";
import { getAccountStatus } from "@/app/lib/stripe/connect";
import {
  calculateFee,
  getEventMarkup,
  DEFAULT_PLATFORM_FEE_PERCENT,
} from "@/app/lib/stripe/fees";
import { isCancellableStatus } from "@/app/lib/stripe/constants";
import {
  validateMinimumAmount,
  formatCentsAsPrice,
  STRIPE_MINIMUM_CENTS,
  SUPPORTED_CURRENCIES,
} from "@project-flame/lib";
import Stripe from "stripe";

// Payment flow types for better type safety
type PaymentFlow = "hold" | "rsvp";

// PaymentIntent metadata interface for type safety
interface PaymentIntentMetadata {
  holdId?: string;
  eventId: string;
  organizationId: string;
  ticketTierId: string;
  quantity: string;
  type: "ticket_purchase" | "rsvp_request";
  stageId?: string | null;
  rsvpId?: string;
  userId: string;
  promoterCode?: string;
  promoCode?: string;
  promotionalCodeId?: string;
  discountAmountCents?: string;
  // Financial Audit Fields
  basePriceCents?: string;
  markupPercent?: string;
  markupFixedCents?: string;
  feePercent?: string; // Legacy
  platformFeeCents?: string;
}

interface StageWithTier {
  id: string;
  price_cents: number | null;
  ticket_tier_id: string;
  ticket_tiers: { event_id: string };
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      console.error("Supabase admin client not initialized");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      if (e instanceof SyntaxError) {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 }
        );
      }
      throw e;
    }

    const {
      holdId,
      eventId: bodyEventId,
      ticketTierId: bodyTicketTierId,
      quantity,
      rsvpId,
      idempotencyKey: clientProvidedIdempotencyKey,
      promoterCode,
      promoCode,
      oldPaymentIntentId, // Optional: ID of previous PI to cancel (e.g. when applying promo code)
    } = body;
    
    // Validate flow parameter if provided
    const flow = body.flow as PaymentFlow | undefined;
    if (flow !== undefined && flow !== "hold" && flow !== "rsvp") {
      return NextResponse.json(
        { error: "Invalid flow parameter. Must be 'hold' or 'rsvp'" },
        { status: 400 }
      );
    }

    // Use mutable variables for RSVP flow (may be overwritten with RSVP record values)
    let eventId = bodyEventId;
    let ticketTierId = bodyTicketTierId;

    // Validate holdId type if provided
    if (holdId !== undefined && typeof holdId !== "string") {
      return NextResponse.json(
        { error: "Invalid holdId format" },
        { status: 400 }
      );
    }

    // Parse quantity for RSVP flow (hold flow uses hold.quantity from DB)
    let parsedQuantity: number | undefined;
    if (quantity !== undefined) {
      // Validate format before parsing to prevent silent truncation
      if (typeof quantity === "string") {
        if (!/^\d+$/.test(quantity)) {
          return NextResponse.json(
            { error: "Invalid quantity format: must contain only digits" },
            { status: 400 }
          );
        }
        parsedQuantity = parseInt(quantity, 10);
      } else if (typeof quantity === "number") {
        if (!Number.isInteger(quantity)) {
          return NextResponse.json(
            { error: "Invalid quantity format: must be an integer" },
            { status: 400 }
          );
        }
        parsedQuantity = quantity;
      }
    }

    // Input validation for RSVP flow (hold flow validates via holdId lookup)
    if (!holdId && flow === "rsvp") {
      // RSVP flow requires these parameters
      if (!eventId || typeof eventId !== "string") {
        return NextResponse.json(
          { error: "Invalid or missing eventId" },
          { status: 400 }
        );
      }
      if (!ticketTierId || typeof ticketTierId !== "string") {
        return NextResponse.json(
          { error: "Invalid or missing ticketTierId" },
          { status: 400 }
        );
      }
      if (
        !parsedQuantity ||
        !Number.isInteger(parsedQuantity) ||
        parsedQuantity < 1
      ) {
        return NextResponse.json(
          { error: "Invalid or missing quantity" },
          { status: 400 }
        );
      }
      // Business rule: Enforce maximum quantity per transaction
      if (parsedQuantity > 100) {
        return NextResponse.json(
          { error: "Quantity cannot exceed 100 tickets per transaction" },
          { status: 400 }
        );
      }
      // Note: rsvpId is optional but recommended for better tracking
    }

    // Get Supabase User ID and email
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .eq("clerk_id", userId)
      .single();

    if (userError || !user) {
      console.error("Error fetching user:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let organizationId,
      eventIdVal,
      basePriceCents,
      metadata: Partial<PaymentIntentMetadata> = {};
    let isRsvp = flow === "rsvp";
    let stageId = null;
    let eventCurrency: string;

    const validCurrencyCodes = new Set(
      SUPPORTED_CURRENCIES.map((c) => c.code.toLowerCase())
    );
    function requireEventCurrency(
      raw: unknown,
      context: string
    ): string {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) {
        throw new Error(`Event currency is missing (${context}). Cannot proceed with payment.`);
      }
      const lower = s.toLowerCase();
      if (!validCurrencyCodes.has(lower)) {
        throw new Error(
          `Event currency "${s}" is not a supported ISO currency (${context}). Supported: ${[...validCurrencyCodes].join(", ")}.`
        );
      }
      return lower;
    }

    // SECURITY: If rsvpId is provided, validate and use RSVP record values instead of request body
    // This prevents parameter manipulation attacks where malicious users provide incorrect
    // eventId, ticketTierId, quantity, or stageId that don't match their RSVP
    let rsvpRecord: {
      event_id: string;
      ticket_tier_id: string;
      requested_quantity: number | null;
      stage_id: string | null;
      stage_price_cents: number | null;
      status: string;
    } | null = null;

    if (isRsvp && rsvpId) {
      const { data: fetchedRsvp, error: rsvpFetchError } = await supabaseAdmin
        .from("rsvps")
        .select(
          "event_id, ticket_tier_id, requested_quantity, stage_id, stage_price_cents, status"
        )
        .eq("id", rsvpId)
        .eq("user_id", user.id) // Security: Ensure user owns the RSVP
        .maybeSingle();

      if (rsvpFetchError || !fetchedRsvp) {
        // Determine the appropriate status code:
        // - Database error (rsvpFetchError): 500 (server error)
        // - RSVP not found (!fetchedRsvp): 404 (not found)
        // Note: Unauthorized access is handled by the .eq("user_id", user.id) filter above
        const statusCode = rsvpFetchError ? 500 : 404;
        const errorMessage = rsvpFetchError
          ? "Failed to fetch RSVP"
          : "RSVP not found";

        return NextResponse.json(
          {
            error: errorMessage,
          },
          { status: statusCode }
        );
      }

      // Validate RSVP status - only pending RSVPs should create payment intents
      if (fetchedRsvp.status !== "pending") {
        return NextResponse.json(
          {
            error: `RSVP is not in pending status (current status: ${fetchedRsvp.status})`,
          },
          { status: 400 }
        );
      }

      rsvpRecord = fetchedRsvp;

      // SECURITY: Validate that request body parameters match RSVP record
      // This prevents users from manipulating parameters to pay for different tiers/quantities
      if (eventId && eventId !== fetchedRsvp.event_id) {
        return NextResponse.json(
          {
            error: "Event ID in request does not match RSVP record",
          },
          { status: 400 }
        );
      }

      if (ticketTierId && ticketTierId !== fetchedRsvp.ticket_tier_id) {
        return NextResponse.json(
          {
            error: "Ticket tier ID in request does not match RSVP record",
          },
          { status: 400 }
        );
      }

      if (
        parsedQuantity !== undefined &&
        parsedQuantity !== fetchedRsvp.requested_quantity
      ) {
        return NextResponse.json(
          {
            error: "Quantity in request does not match RSVP record",
          },
          { status: 400 }
        );
      }

      const { stageId: bodyStageId } = body;
      if (bodyStageId !== undefined && bodyStageId !== fetchedRsvp.stage_id) {
        return NextResponse.json(
          {
            error: "Stage ID in request does not match RSVP record",
          },
          { status: 400 }
        );
      }

      // Use RSVP record values instead of request body
      eventId = fetchedRsvp.event_id;
      ticketTierId = fetchedRsvp.ticket_tier_id;

      // Explicitly handle missing quantity
      if (
        fetchedRsvp.requested_quantity === null ||
        fetchedRsvp.requested_quantity === undefined
      ) {
        console.warn(
          `RSVP ${rsvpId} has missing quantity. Rejecting payment intent creation.`
        );
        return NextResponse.json(
          { error: "Invalid RSVP data: missing quantity" },
          { status: 400 }
        );
      }
      parsedQuantity = fetchedRsvp.requested_quantity;
      stageId = fetchedRsvp.stage_id;
    }

    if (holdId) {
      // --- DIRECT PURCHASE VIA HOLD ---
      // CRITICAL: Reset isRsvp to false to ensure automatic capture (not manual)
      // even if client mistakenly sends flow: "rsvp" alongside holdId
      isRsvp = false;

      const { data: hold, error: holdError } = await supabaseAdmin
        .from("holds")
        .select(
          `
                *,
                events!inner (
                    id,
                    organization_id,
                    name,
                    currency
                ),
                ticket_tiers!inner (
                    id,
                    name,
                    price_cents,
                    currency
                )
            `
        )
        .eq("id", holdId)
        .single();

      if (holdError || !hold) {
        return NextResponse.json({ error: "Hold not found" }, { status: 404 });
      }

      if (hold.user_id !== user.id) {
        return NextResponse.json(
          { error: "Unauthorized access to hold" },
          { status: 403 }
        );
      }

      if (new Date(hold.expires_at) < new Date()) {
        return NextResponse.json(
          { error: "Hold has expired" },
          { status: 400 }
        );
      }

      organizationId = hold.events.organization_id;
      eventIdVal = hold.event_id;
      // Require persisted reservation currency only — do not fall back to tier/event.
      // Charging with live tier/event currency when hold.currency is missing risks wrong-currency charges.
      const holdSnapshotCurrency = (hold as { currency?: string }).currency;
      if (!holdSnapshotCurrency?.trim()) {
        return NextResponse.json(
          { error: "Hold missing reservation currency; cannot create payment" },
          { status: 400 }
        );
      }
      try {
        eventCurrency = requireEventCurrency(
          holdSnapshotCurrency,
          "hold (reservation)"
        );
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Invalid event currency" },
          { status: 400 }
        );
      }
      const unitPrice = hold.stage_price_cents ?? hold.ticket_tiers.price_cents;
      
      // Validate unitPrice is not null/undefined before calculating basePriceCents
      if (unitPrice === null || unitPrice === undefined) {
        return NextResponse.json(
          {
            error: "Pricing configuration missing for selected tier or stage",
          },
          { status: 400 }
        );
      }
      
      basePriceCents = unitPrice * hold.quantity;
      stageId = hold.stage_id;

      metadata = {
        holdId: holdId,
        eventId: eventIdVal,
        organizationId: organizationId,
        type: "ticket_purchase",
        stageId: stageId,
        // Include user/tier/quantity for ghost order creation if hold expires after payment
        userId: String(user.id), // Ensure userId is stored as string for metadata
        ticketTierId: hold.ticket_tiers.id,
        quantity: String(hold.quantity),
        promoterCode: hold.promoter_code || promoterCode || undefined,
      };
    } else if (isRsvp && eventId && ticketTierId && parsedQuantity) {
      // --- RSVP REQUEST (AUTH ONLY) ---
      // NOTE: If rsvpId was provided, we've already validated and set the values above
      // This branch handles both:
      // 1. New RSVP creation (no rsvpId) - uses request body values
      // 2. Existing RSVP payment (with rsvpId) - uses RSVP record values (already validated above)

      // Fetch Event & Tier info
      const { data: event, error: eventError } = await supabaseAdmin
        .from("events")
        .select("organization_id, id, currency")
        .eq("id", eventId)
        .single();

      if (eventError || !event) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }

      // Fetch tier AND validate it belongs to the specified event
      // This prevents attackers from specifying a tier from a different event with different pricing
      const { data: tier, error: tierError } = await supabaseAdmin
        .from("ticket_tiers")
        .select("price_cents, id, event_id, currency")
        .eq("id", ticketTierId)
        .eq("event_id", eventId) // Security: Ensure tier belongs to this event
        .single();

      if (tierError || !tier) {
        return NextResponse.json(
          { error: "Ticket tier not found or does not belong to this event" },
          { status: 404 }
        );
      }

      // Use stageId from RSVP record if rsvpId was provided, otherwise from request body
      // (stageId is already set above if rsvpRecord exists)
      if (!rsvpRecord) {
        const { stageId: bodyStageId } = body;
        stageId = bodyStageId || null;
      }

      organizationId = event.organization_id;
      eventIdVal = event.id;
      // Require tier currency (reservation snapshot) only — do not fall back to event.
      // Charging with live event currency when tier.currency is missing risks wrong-currency charges.
      const rsvpSnapshotCurrency = (tier as { currency?: string }).currency;
      if (!rsvpSnapshotCurrency?.trim()) {
        return NextResponse.json(
          { error: "Ticket tier missing currency; cannot create RSVP payment" },
          { status: 400 }
        );
      }
      try {
        eventCurrency = requireEventCurrency(
          rsvpSnapshotCurrency,
          "rsvp (tier)"
        );
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Invalid event currency" },
          { status: 400 }
        );
      }

      // Calculate base price - use stage price if stageId provided, otherwise tier price
      // If rsvpRecord exists, use its stage_price_cents; otherwise fetch from stage table
      if (stageId) {
        let stagePriceCents: number | null = null;

        // If we have rsvpRecord, use its stage_price_cents (already validated)
        if (rsvpRecord && rsvpRecord.stage_id === stageId) {
          stagePriceCents = rsvpRecord.stage_price_cents;
        } else {
          // For new RSVP creation (no rsvpId), fetch stage and validate
          // Fetch the stage and verify it belongs to:
          // 1. The specified ticket tier (prevents price manipulation via different tier's stages)
          // 2. The correct event (via the tier)
          const { data: stage, error: stageError } = await supabaseAdmin
            .from("ticket_stages")
            .select(
              "id, price_cents, ticket_tier_id, ticket_tiers!inner(event_id)"
            )
            .eq("id", stageId)
            .eq("ticket_tier_id", ticketTierId) // Security: Ensure stage belongs to the specified tier
            .single();

          if (stageError || !stage) {
            return NextResponse.json(
              {
                error:
                  "Stage not found or does not belong to the specified ticket tier",
              },
              { status: 404 }
            );
          }

          // Additional check: Verify the tier's event matches the specified event
          // Use 'unknown' intermediate cast to handle Supabase's array return type for relations
          const stageData = stage as unknown as StageWithTier;
          const stageEventId = stageData.ticket_tiers.event_id;
          if (stageEventId !== event.id) {
            return NextResponse.json(
              { error: "Stage does not belong to this event" },
              { status: 400 }
            );
          }

          stagePriceCents = stage.price_cents;
        }

        // Use stage price if available, fallback to tier price
        const effectiveUnitCents = stagePriceCents ?? tier.price_cents;
        if (effectiveUnitCents === null || effectiveUnitCents === undefined) {
          return NextResponse.json(
            {
              error: "Pricing configuration missing for selected tier or stage",
            },
            { status: 400 }
          );
        }
        basePriceCents = effectiveUnitCents * parsedQuantity;
      } else {
        // Validate tier price is not null before calculating basePriceCents
        if (tier.price_cents === null || tier.price_cents === undefined) {
          return NextResponse.json(
            {
              error: "Pricing configuration missing for selected tier or stage",
            },
            { status: 400 }
          );
        }
        basePriceCents = tier.price_cents * parsedQuantity;
      }

      metadata = {
        eventId: eventIdVal,
        organizationId: organizationId,
        ticketTierId: ticketTierId,
        quantity: String(parsedQuantity), // Convert to string for consistency with hold flow
        type: "rsvp_request",
        stageId: stageId,
        rsvpId: rsvpId, // Include rsvpId if provided
        userId: String(user.id), // Include userId for ownership verification (stored as string)
        promoterCode: promoterCode || undefined,
      };
    } else {
      return NextResponse.json(
        {
          error:
            "Missing required parameters (holdId OR eventId/tierId/quantity)",
        },
        { status: 400 }
      );
    }

    // Retrieve Organization Connect Account
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("stripe_account_id, id")
      .eq("id", organizationId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (!org.stripe_account_id) {
      return NextResponse.json(
        { error: "Organization is not connected to Stripe" },
        { status: 400 }
      );
    }

    // --- PROMO CODE VALIDATION AND APPLICATION ---
    let discountAmountCents = 0;
    let appliedPromoCode: string | undefined = undefined;

    if (promoCode) {
      if (typeof promoCode !== "string") {
        return NextResponse.json(
          { error: "Invalid discount code format" },
          { status: 400 }
        );
      }
      const sanitizedCode = promoCode.trim().toUpperCase();

      // Find the promotional code
      const { data: promotionalCodeData, error: codeError } = await supabaseAdmin
        .from("promotional_codes")
        .select(
          `
          id,
          code,
          discount_percentage,
          usage_limit,
          usage_count,
          event_id,
          events!inner (
            id,
            status
          )
        `
        )
        .eq("event_id", eventIdVal)
        .eq("code", sanitizedCode)
        .single();

      if (codeError || !promotionalCodeData) {
        return NextResponse.json(
          { error: "Invalid discount code" },
          { status: 404 }
        );
      }

      // Check if event is published
      const eventData = promotionalCodeData.events;
      const event = (Array.isArray(eventData) ? eventData[0] : eventData) as { id: string; status: string };

      if (!event || event.status !== "published") {
        return NextResponse.json(
          { error: "This discount code is not available" },
          { status: 400 }
        );
      }

      // Check if usage limit has been reached
      if (
        promotionalCodeData.usage_limit !== null &&
        promotionalCodeData.usage_count >= promotionalCodeData.usage_limit
      ) {
        return NextResponse.json(
          { error: "This discount code has reached its usage limit" },
          { status: 400 }
        );
      }

      // Calculate discount amount
      // IMPORTANT: Must use Math.round() to match the ROUND() logic in DB
      discountAmountCents = Math.round(
        (basePriceCents * promotionalCodeData.discount_percentage) / 100
      );

      // Ensure discount doesn't exceed subtotal
      discountAmountCents = Math.min(discountAmountCents, basePriceCents);
      
      appliedPromoCode = promotionalCodeData.code;
      
      // Update metadata with promo info
      metadata.promoCode = appliedPromoCode;
      metadata.promotionalCodeId = promotionalCodeData.id;
      metadata.discountAmountCents = String(discountAmountCents);
    }

    // Apply discount to basePriceCents for fee calculation and transfer
    // The organizer receives the discounted amount
    const discountedBasePriceCents = Math.max(0, basePriceCents - discountAmountCents);

    // Calculate Fees - use event-specific markup if available, fallback to currency-aware defaults
    const markupSettings = await getEventMarkup(eventIdVal, eventCurrency);

    let totalAmountCents: number;
    let platformFeeCents: number;

    // If the discounted base price is 0 (100% off), we treat it as a free ticket
    // and waive the platform fee to ensure the total is 0.
    if (discountedBasePriceCents === 0) {
      totalAmountCents = 0;
      platformFeeCents = 0;
    } else {
      const fees = calculateFee(
        discountedBasePriceCents,
        markupSettings.percent,
        markupSettings.fixedCents
      );
      totalAmountCents = fees.totalAmountCents;
      platformFeeCents = fees.platformFeeCents;
    }

    // If total amount is 0, return immediately without creating PaymentIntent
    // This triggers the free purchase flow on the frontend
    if (totalAmountCents === 0) {
      // If we have an old PaymentIntent (e.g. from a previous attempt without the promo),
      // we must cancel it to prevent orphaned authorizations.
      if (
        oldPaymentIntentId &&
        typeof oldPaymentIntentId === "string" &&
        oldPaymentIntentId.startsWith("pi_")
      ) {
        try {
          // Retrieve to check status before cancelling
          const oldPI = await stripe.paymentIntents.retrieve(oldPaymentIntentId);
          
          // Verify ownership before cancelling
          if (oldPI.metadata.userId !== String(user.id)) {
             console.warn("Security blocked cancellation of old PI (free promo flow) - user mismatch:", {
                oldPiUser: oldPI.metadata.userId,
                currentUser: user.id,
                piId: oldPaymentIntentId
             });
          } else if (isCancellableStatus(oldPI.status)) {
            // Remove holdId from metadata before cancelling to preserve the hold
            if (oldPI.metadata.holdId) {
              await stripe.paymentIntents.update(oldPaymentIntentId, {
                metadata: {
                  holdId: null,
                  rsvpId: null,
                  cancellation_reason: "replaced_by_free_promo",
                },
              });
            }

            await stripe.paymentIntents.cancel(oldPaymentIntentId, {
              cancellation_reason: "abandoned",
            });
            console.log("Cancelled previous PaymentIntent (replaced by free promo):", oldPaymentIntentId);
          }
        } catch (cancelError) {
          // Log but don't throw - we want to allow the free purchase to proceed
          console.warn("Failed to cancel old PaymentIntent during free promo flow:", {
             id: oldPaymentIntentId,
             error: cancelError instanceof Error ? cancelError.message : String(cancelError)
          });
        }
      }

      return NextResponse.json({
        clientSecret: null,
        paymentIntentId: `free_promo_${Date.now()}`, // Placeholder ID
        amounts: {
          base: basePriceCents,
          fee: platformFeeCents,
          total: totalAmountCents,
          discount: discountAmountCents,
          currency: eventCurrency,
        },
        // Return promo details so frontend can pass them to completion endpoint
        promotionalCodeId: metadata.promotionalCodeId,
        promoCode: metadata.promoCode,
        connectedAccountId: org.stripe_account_id,
      });
    }

    // Validate amount meets Stripe's currency-specific minimum before creating PaymentIntent
    const eventCurrencyUpper = eventCurrency.toUpperCase();
    if (!validateMinimumAmount(totalAmountCents, eventCurrencyUpper)) {
      const minCents = STRIPE_MINIMUM_CENTS[eventCurrencyUpper] ?? 50;
      const minDisplay = formatCentsAsPrice(minCents, eventCurrencyUpper);
      return NextResponse.json(
        {
          error: `The total amount is below the minimum for ${eventCurrencyUpper}. Minimum charge is ${minDisplay}.`,
        },
        { status: 400 }
      );
    }

    // Prepare PaymentIntent options
    const paymentIntentOptions: Stripe.PaymentIntentCreateParams = {
      amount: totalAmountCents,
      currency: eventCurrency,
      // Restrict to card only to prevent bank transfers from appearing in the payment sheet.
      // When PMC is set, pair it with explicit payment_method_types so the PMC only augments
      // card (adding Apple Pay / wallets) without enabling us_bank_account or other methods.
      payment_method_types: ["card"],
      ...(process.env.STRIPE_CONNECTED_PMC_ID
        ? { payment_method_configuration: process.env.STRIPE_CONNECTED_PMC_ID }
        : {}),
      // NOTE: on_behalf_of is intentionally omitted. Stripe gates the stripe_balance.stripe_transfers
      // feature required for on_behalf_of destination charges — it must be explicitly enabled by Stripe
      // support per platform. Without it, confirms return a generic 500 api_error in live mode.
      // Standard destination charges (transfer_data without on_behalf_of) route funds correctly
      // to organizers. on_behalf_of can be re-added once Stripe enables the feature for this platform.
      description: `Ticket Purchase - ${user.email}`,
      receipt_email: user.email,
      transfer_data: {
        destination: org.stripe_account_id,
        amount: discountedBasePriceCents, // Guaranteed Net: Organizer gets exact base price (minus discount)
      },
      // NOTE: application_fee_amount is NOT used with transfer_data[amount]
      // Stripe automatically calculates platform fee as: totalAmountCents - discountedBasePriceCents
      metadata: {
        ...metadata,
        basePriceCents: String(discountedBasePriceCents),
        markupPercent: String(markupSettings.percent),
        markupFixedCents: String(markupSettings.fixedCents),
        feePercent: String(markupSettings.percent), // Legacy field for backward compat
        platformFeeCents: String(platformFeeCents),
      },
    };

    // If RSVP, require manual capture
    if (isRsvp) {
      paymentIntentOptions.capture_method = "manual";
    }

    // CRITICAL: If this is an RSVP flow with rsvpId, check for existing PaymentIntent
    // and cancel it to prevent orphaned authorizations
    let paymentAttemptVersion = 0;
    let originalPaymentIntentId: string | null = null; // Store for optimistic locking
    if (isRsvp && rsvpId) {
      const { data: existingRsvp, error } = await supabaseAdmin
        .from("rsvps")
        .select("stripe_payment_intent_id, status, payment_attempt")
        .eq("id", rsvpId)
        .eq("user_id", user.id) // Security: Ensure user owns the RSVP
        .single();

      // Check for database errors
      if (error) {
        console.error("Error fetching existing RSVP:", error);
        return NextResponse.json(
          { error: "Failed to fetch RSVP record" },
          { status: 500 }
        );
      }

      // Check if RSVP exists
      if (!existingRsvp) {
        return NextResponse.json(
          { error: "RSVP not found or access denied" },
          { status: 404 }
        );
      }

      // Get current version (requires migration 20260127000000_add_payment_attempt_to_rsvps.sql)
      paymentAttemptVersion = existingRsvp.payment_attempt || 0;
      // Store original payment intent ID and status for optimistic locking on link update
      originalPaymentIntentId = existingRsvp.stripe_payment_intent_id || null;

      // CRITICAL: If RSVP is not pending, don't create a new PaymentIntent
      // This prevents creating orphaned PaymentIntents when an organizer approves the RSVP
      // between the earlier status check and this point
      if (existingRsvp && existingRsvp.status !== "pending") {
        return NextResponse.json(
          {
            error: `RSVP is not in pending status (current status: ${existingRsvp.status}). Payment authorization cannot be created.`,
          },
          { status: 400 }
        );
      }

      if (
        existingRsvp?.stripe_payment_intent_id &&
        existingRsvp.status === "pending"
      ) {
        // Cancel the existing PaymentIntent to release the authorization
        try {
          const existingPI = await stripe.paymentIntents.retrieve(
            existingRsvp.stripe_payment_intent_id
          );

          if (isCancellableStatus(existingPI.status)) {
            await stripe.paymentIntents.cancel(
              existingRsvp.stripe_payment_intent_id,
              {},
              {
                idempotencyKey: `cancel_orphan_${rsvpId}_${existingRsvp.stripe_payment_intent_id}`,
              }
            );
            console.log("Cancelled orphaned PaymentIntent:", {
              rsvpId,
              oldPaymentIntentId: existingRsvp.stripe_payment_intent_id,
              status: existingPI.status,
            });
          }
        } catch (cancelError) {
          console.error("Failed to cancel existing PaymentIntent:", {
            rsvpId,
            existingPaymentIntentId: existingRsvp.stripe_payment_intent_id,
            error:
              cancelError instanceof Error
                ? cancelError.message
                : String(cancelError),
          });
          // Continue anyway - we'll create the new PaymentIntent
        }

        // We are retrying payment, so increment the attempt version
        paymentAttemptVersion++;

        // Update the RSVP with the new version
        // SECURITY: Include user_id check to prevent TOCTOU races and enforce defense-in-depth
        const { data: updatedRsvp, error: updateAttemptError } =
          await supabaseAdmin
            .from("rsvps")
            .update({ payment_attempt: paymentAttemptVersion })
            .eq("id", rsvpId)
            .eq("user_id", user.id) // Ownership guard: ensure user owns the RSVP
            .select("id")
            .maybeSingle();

        // Check if update succeeded AND actually updated a row
        // If no rows matched, either the RSVP doesn't exist or doesn't belong to this user
        if (updateAttemptError || !updatedRsvp) {
          console.error("Failed to update payment attempt version:", {
            rsvpId,
            error: updateAttemptError,
            reason: !updatedRsvp
              ? "RSVP not found or user mismatch"
              : "Database error",
          });
          return NextResponse.json(
            { error: "Failed to initialize payment retry. Please try again." },
            { status: 500 }
          );
        }
      }
    }

    // If this is a new PI creation (e.g. applying promo code) and we have an old one, cancel the old one
    if (oldPaymentIntentId && typeof oldPaymentIntentId === "string" && oldPaymentIntentId.startsWith("pi_")) {
      try {
        const oldPI = await stripe.paymentIntents.retrieve(oldPaymentIntentId);
        // Only cancel if it belongs to the same user (security check)
        // Note: oldPI.metadata.userId is stored as string, user.id is UUID string
        if (String(oldPI.metadata.userId) === String(user.id)) {
          if (isCancellableStatus(oldPI.status)) {
            // CRITICAL: Remove holdId from metadata before cancelling
            // This prevents the webhook from deleting the hold when the PI is canceled
            // The hold should be preserved for the new PI
            if (oldPI.metadata.holdId) {
              await stripe.paymentIntents.update(oldPaymentIntentId, {
                metadata: {
                  holdId: null, // Remove holdId
                  rsvpId: null, // Remove rsvpId too just in case
                  cancellation_reason: "replaced_by_promo", // Add context
                },
              });
              console.log("Removed holdId from old PaymentIntent metadata before cancellation:", oldPaymentIntentId);
            }

            await stripe.paymentIntents.cancel(oldPaymentIntentId, {
              cancellation_reason: "abandoned",
            });
            console.log("Cancelled previous PaymentIntent:", oldPaymentIntentId);
          } else {
             console.warn("Old PaymentIntent not cancellable:", {
                id: oldPaymentIntentId,
                status: oldPI.status
             });
          }
        } else {
           console.warn("Security blocked cancellation of old PI - user mismatch:", {
              oldPiUser: oldPI.metadata.userId,
              currentUser: user.id
           });
        }
      } catch (cancelError) {
        console.warn("Failed to cancel old PaymentIntent:", cancelError);
        // Continue - don't block new PI creation
      }
    }

    // Create PaymentIntent
    // Version 2: Removed application_fee_amount (mutually exclusive with transfer_data[amount])
    const PAYMENT_INTENT_VERSION = "v2";
    
    // Append promo code to idempotency key to force new PI creation if promo code changes
    const promoSuffix = appliedPromoCode ? `_promo_${appliedPromoCode}` : "";
    // Append promoter code to idempotency key — promoterCode is stored in PI metadata so
    // changing it between attempts (e.g. user removes a deep-link promoter before retrying)
    // would produce the same key but different params, causing a Stripe idempotency conflict.
    //
    // IMPORTANT: derive the suffix from `paymentIntentOptions.metadata.promoterCode` —
    // the value that's actually being sent to Stripe — NOT the raw `promoterCode` request
    // param. On the hold path, metadata is set to `hold.promoter_code || promoterCode ||
    // undefined` (see metadata construction earlier in this handler), so using just
    // `promoterCode` here meant a hold-attached promoter would persist to Stripe while
    // being absent from the idempotency key. A subsequent retry with a different
    // request-body promoter could then produce the same key with different params,
    // hitting Stripe's idempotency conflict. Reading from `metadata.promoterCode`
    // aligns the suffix with the actual payload for both the hold and RSVP paths.
    // (MAY_2026_FIXES.md §25 extension — same family of bug, missed hold path.)
    const effectivePromoter = paymentIntentOptions.metadata?.promoterCode;
    const promoterSuffix = effectivePromoter
      ? `_via_${String(effectivePromoter).toUpperCase()}`
      : "";
    // Append replaced PI ID to idempotency key to force new PI creation if we're replacing an old one
    const replaceSuffix = oldPaymentIntentId ? `_replaced_${oldPaymentIntentId}` : "";

    // Pre-charge readiness guard (W8 EXTRA 3). Our destination charge requires
    // the connected account's `transfers` capability to be active; if it isn't
    // (onboarding incomplete, or verification pending/restricted), Stripe rejects
    // PaymentIntent creation with a raw 500: "your destination account needs to
    // have at least one of the following capabilities enabled: transfers, ...".
    // We verify LIVE rather than trusting the cached stripe_charges_enabled /
    // stripe_payouts_enabled columns, which never track capability status and can
    // be stale. IMPORTANT: we gate ONLY on `transfersActive` — recipient/
    // transfers-only accounts (our LATAM markets) have charges_enabled=false by
    // design, so gating on charges/payouts would wrongly block every LATAM org.
    // Placed here (right before PI creation, after the totalAmountCents === 0
    // early return) so free / 100%-off flows — which return a free_promo_ result
    // with no transfer_data — are never blocked by a payout-readiness check.
    // Best-effort: if the live status check itself fails we log and proceed, so a
    // flaky Stripe read never blocks an otherwise-healthy checkout.
    try {
      const { transfersActive } = await getAccountStatus(org.stripe_account_id);
      if (!transfersActive) {
        return NextResponse.json(
          {
            error:
              "This organizer hasn't finished their payout setup yet, so tickets can't be purchased right now. Please try again later.",
            code: "ORGANIZER_PAYOUTS_NOT_READY",
          },
          { status: 409 }
        );
      }
    } catch (statusErr) {
      console.error(
        "[create-payment-intent] connected-account readiness check failed; proceeding",
        {
          organizationId,
          stripeAccountId: org.stripe_account_id,
          error:
            statusErr instanceof Error ? statusErr.message : String(statusErr),
        }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentOptions,
      {
        idempotencyKey: rsvpId
          ? `create_pi_rsvp_${rsvpId}_${paymentAttemptVersion}_${PAYMENT_INTENT_VERSION}${promoSuffix}${promoterSuffix}${replaceSuffix}`
          : holdId
          ? `create_pi_hold_${holdId}_${PAYMENT_INTENT_VERSION}${promoSuffix}${promoterSuffix}${replaceSuffix}`
          : `create_pi_rsvp_new_${userId}_${eventId}_${ticketTierId}_${parsedQuantity}_${
              stageId || "no_stage"
            }_${
              clientProvidedIdempotencyKey || "default"
            }_${PAYMENT_INTENT_VERSION}${promoSuffix}${promoterSuffix}${replaceSuffix}`,
      }
    );

    // If this is an RSVP flow with a valid rsvpId, link the PaymentIntent to the RSVP immediately
    // CRITICAL: This link must succeed or we cancel the PaymentIntent to prevent orphaned authorizations
    // OPTIMISTIC LOCKING: Check that stripe_payment_intent_id hasn't changed AND status is still "pending"
    // This prevents race conditions where:
    // 1. Two concurrent requests both create PaymentIntents and the second overwrites the first's link
    // 2. An organizer approves the RSVP between status check and link update, leaving an orphaned PaymentIntent
    if (isRsvp && rsvpId) {
      // Build query with optimistic locking conditions
      let linkQuery = supabaseAdmin
        .from("rsvps")
        .update({
          stripe_payment_intent_id: paymentIntent.id,
          // Store financial audit fields
          base_price_cents: discountedBasePriceCents,
          markup_percent: markupSettings.percent,
          markup_fixed_cents: markupSettings.fixedCents,
          total_amount_cents: totalAmountCents,
          promoter_code: promoterCode || undefined, // Update promoter code if provided
        })
        .eq("id", rsvpId)
        .eq("user_id", user.id) // Security: Ensure user owns the RSVP
        .eq("status", "pending"); // CRITICAL: Only link if RSVP is still pending (prevents linking to approved RSVPs)

      // Optimistic lock: only update if payment_intent_id hasn't changed since we read it
      // Use .is() for null checks, .eq() for string values
      if (originalPaymentIntentId === null) {
        linkQuery = linkQuery.is("stripe_payment_intent_id", null);
      } else {
        linkQuery = linkQuery.eq(
          "stripe_payment_intent_id",
          originalPaymentIntentId
        );
      }

      const { data: updatedRsvp, error: updateError } = await linkQuery
        .select("id")
        .maybeSingle();

      // Check if update succeeded AND actually updated a row
      // If no rows matched, either:
      // 1. RSVP doesn't exist or doesn't belong to this user
      // 2. Optimistic lock failed:
      //    - Another request already linked a different PaymentIntent (stripe_payment_intent_id changed)
      //    - RSVP status changed (e.g., organizer approved it) - status is no longer "pending"
      if (updateError || !updatedRsvp) {
        const isOptimisticLockFailure = !updateError && !updatedRsvp;

        console.error("Failed to link PaymentIntent to RSVP:", {
          rsvpId,
          paymentIntentId: paymentIntent.id,
          error: updateError,
          reason: isOptimisticLockFailure
            ? "Optimistic lock failed - RSVP status changed or PaymentIntent already linked by another request"
            : !updatedRsvp
            ? "RSVP not found or user mismatch"
            : "Database error",
          originalPaymentIntentId, // Log for debugging race conditions
          note: "Optimistic lock checks both stripe_payment_intent_id and status='pending'",
        });

        // Cancel the orphaned PaymentIntent to prevent stuck authorization
        // Without this link, the orphan cleanup logic can't find this PaymentIntent
        // and customer funds would be held for 7 days
        // This is especially critical when optimistic locking fails (concurrent retry requests)
        try {
          await stripe.paymentIntents.cancel(
            paymentIntent.id,
            {},
            {
              idempotencyKey: `cancel_unlinked_${paymentIntent.id}`,
            }
          );
          console.log("Cancelled PaymentIntent after RSVP link failure:", {
            paymentIntentId: paymentIntent.id,
            reason: isOptimisticLockFailure
              ? "optimistic_lock_failure"
              : "link_update_failed",
          });
        } catch (cancelError) {
          console.error("Failed to cancel orphaned PaymentIntent:", {
            paymentIntentId: paymentIntent.id,
            cancelError:
              cancelError instanceof Error
                ? cancelError.message
                : String(cancelError),
          });
          // Even if cancel fails, we still return error to user
        }

        // Return appropriate error message based on failure reason
        return NextResponse.json(
          {
            error: isOptimisticLockFailure
              ? "Another payment request is already in progress. Please wait a moment and try again."
              : "Failed to initialize payment. Please try again.",
          },
          { status: isOptimisticLockFailure ? 409 : 500 } // 409 Conflict for optimistic lock failure
        );
      }

      console.log("Linked PaymentIntent to RSVP:", rsvpId, paymentIntent.id);
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amounts: {
        base: basePriceCents, // Return ORIGINAL base price so frontend can display Subtotal (Original) - Discount
        fee: platformFeeCents,
        total: totalAmountCents,
        discount: discountAmountCents,
        currency: paymentIntentOptions.currency,
      },
      connectedAccountId: org.stripe_account_id,
    });
  } catch (error) {
    console.error("Create Payment Intent Error:", error);

    // Differentiate Stripe errors from server errors for better client handling
    if (error instanceof Stripe.errors.StripeError) {
      // Differentiate client vs server-side Stripe errors
      const status =
        error.type === "StripeAPIError" ||
        error.type === "StripeConnectionError"
          ? 503
          : 400;
      return NextResponse.json(
        { error: error.message || "Payment processing error" },
        { status }
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
