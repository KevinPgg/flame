import { supabaseAdmin } from "./supabase/server";
import QRCode from "qrcode";
import crypto from "crypto";
import { sendTicketConfirmationEmail } from "./email/ticket-notifications";
import { sendPushToOrgMembersByRole } from "./push-notifications";
import Stripe from "stripe";

// Interface for payment info to abstract away Stripe dependency for free orders
export interface OrderPaymentInfo {
  id: string;
  amount: number;
  currency?: string;
  metadata?: Stripe.Metadata;
  payment_method: string;
  payment_provider: string;
}

// Interface for ticket generation parameters
export interface TicketGenerationParams {
  orderId: string;
  userId: string;
  eventId: string;
  ticketTierId: string;
  quantity: number;
  attendeeEmail: string;
  attendeeFirstName: string | null;
  attendeeLastName: string | null;
  tierName: string;
  eventName: string;
  stageId?: string | null;
}

// Interface for generated ticket data
export interface GeneratedTicket {
  order_id: string;
  user_id: string;
  event_id: string;
  ticket_tier_id: string;
  qr_token: string;
  qr_code: string;
  status: string;
  attendee_email: string;
  attendee_name: string;
  metadata?: { stage_id: string } | undefined;
}

/**
 * Shared utility function to generate ticket data with QR codes
 * Used by createOrder and other ticket generation flows to ensure consistency
 *
 * NOTE: QR code security and performance optimization
 * Currently, QR codes embed orderId, eventId, userId, tierName, eventName, ticketNumber, qrToken, and timestamp.
 * This exposes potentially sensitive information in the QR code itself.
 *
 * TODO: Future optimization - Consider refactoring to a lookup-based approach where QR codes
 * contain only qrToken (and optionally eventId for quick filtering). The scanner would look up
 * ticket details via the qrToken rather than embedding all data in the QR code. This would:
 * - Improve security by reducing exposed data
 * - Reduce QR code size for better scanning performance
 * - Centralize ticket validation logic
 *
 * This refactor will require updates to:
 * - QR code generation (this function)
 * - QR scanner verification endpoint (/api/qr-scanner/verify)
 * - QR scanner frontend validation logic
 * - Test suites
 */
export async function generateTickets(
  params: TicketGenerationParams,
): Promise<GeneratedTicket[]> {
  // Validate ticket quantity before QR generation to prevent memory issues
  const MAX_TICKETS_PER_ORDER = 100; // Business limit to prevent memory issues

  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    throw new RangeError(`Invalid ticket quantity: ${params.quantity}`);
  }

  if (params.quantity > MAX_TICKETS_PER_ORDER) {
    throw new RangeError(
      `Ticket quantity ${params.quantity} exceeds maximum allowed (${MAX_TICKETS_PER_ORDER})`,
    );
  }

  const tickets: GeneratedTicket[] = await Promise.all(
    Array.from({ length: params.quantity }).map(async (_, i) => {
      const qrToken = crypto.randomUUID();
      const qrData = {
        orderId: params.orderId,
        eventId: params.eventId,
        userId: params.userId,
        tierName: params.tierName,
        eventName: params.eventName,
        ticketNumber: i + 1, // 1-indexed ticket number for scanner validation
        qrToken: qrToken,
        timestamp: new Date().toISOString(),
      };

      const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData));

      const attendeeFullName = `${params.attendeeFirstName || ""} ${
        params.attendeeLastName || ""
      }`.trim();

      return {
        order_id: params.orderId,
        user_id: params.userId,
        event_id: params.eventId,
        ticket_tier_id: params.ticketTierId,
        qr_token: qrToken,
        qr_code: qrCodeDataUrl,
        status: "issued",
        attendee_email: params.attendeeEmail,
        attendee_name: attendeeFullName,
        metadata: params.stageId ? { stage_id: params.stageId } : undefined,
      };
    }),
  );

  return tickets;
}

/**
 * Helper function to log order errors for reconciliation
 */
async function logOrderError(
  orderId: string,
  errorType: string,
  errorMessage: string,
  errorDetails: Record<string, any>,
  severity: "low" | "medium" | "high" | "critical" = "high",
): Promise<void> {
  if (!supabaseAdmin) return;

  try {
    await supabaseAdmin.from("order_errors").insert({
      order_id: orderId,
      error_type: errorType,
      error_message: errorMessage,
      error_details: errorDetails,
      severity,
    });
  } catch (logError) {
    console.error("Failed to log order error:", {
      orderId,
      errorType,
      logError,
    });
  }
}

/**
 * Helper function to compensate inventory (decrement sold quantities)
 * Used when order creation fails or needs to be rolled back
 */
async function compensateInventory(
  orderId: string,
  tierId: string,
  stageId: string | null | undefined,
  quantity: number,
  reason: string,
): Promise<void> {
  if (!supabaseAdmin) return;

  // Tier compensation
  try {
    const { error: tierError } = await supabaseAdmin.rpc(
      "increment_tier_quantity_sold",
      {
        p_tier_id: tierId,
        p_increment: -quantity,
      },
    );

    if (tierError) {
      console.error(`Failed to compensate tier inventory (${reason}):`, {
        orderId,
        tierId,
        quantity: -quantity,
        rpcName: "increment_tier_quantity_sold",
        rpcParams: { p_tier_id: tierId, p_increment: -quantity },
        error: tierError,
      });
      await logOrderError(
        orderId,
        "inventory_compensation_failed",
        `Failed to compensate tier inventory (${reason})`,
        {
          tierId,
          quantity: -quantity,
          rpcName: "increment_tier_quantity_sold",
          rpcParams: { p_tier_id: tierId, p_increment: -quantity },
          error: tierError.message || String(tierError),
        },
      );
    }
  } catch (tierException) {
    console.error(`Exception during tier compensation (${reason}):`, {
      orderId,
      tierId,
      quantity: -quantity,
      rpcName: "increment_tier_quantity_sold",
      exception:
        tierException instanceof Error
          ? tierException.message
          : String(tierException),
    });
    await logOrderError(
      orderId,
      "inventory_compensation_exception",
      `Exception during tier compensation (${reason})`,
      {
        tierId,
        quantity: -quantity,
        rpcName: "increment_tier_quantity_sold",
        exception:
          tierException instanceof Error
            ? tierException.message
            : String(tierException),
      },
    );
  }

  // Stage compensation if applicable
  if (stageId) {
    try {
      const { error: stageError } = await supabaseAdmin.rpc(
        "increment_stage_sold_quantity",
        {
          p_stage_id: stageId,
          p_increment: -quantity,
        },
      );

      if (stageError) {
        console.error(`Failed to compensate stage inventory (${reason}):`, {
          orderId,
          stageId,
          quantity: -quantity,
          rpcName: "increment_stage_sold_quantity",
          rpcParams: { p_stage_id: stageId, p_increment: -quantity },
          error: stageError,
        });
        await logOrderError(
          orderId,
          "stage_inventory_compensation_failed",
          `Failed to compensate stage inventory (${reason})`,
          {
            stageId,
            quantity: -quantity,
            rpcName: "increment_stage_sold_quantity",
            rpcParams: { p_stage_id: stageId, p_increment: -quantity },
            error: stageError.message || String(stageError),
          },
        );
      }
    } catch (stageException) {
      console.error(`Exception during stage compensation (${reason}):`, {
        orderId,
        stageId,
        quantity: -quantity,
        rpcName: "increment_stage_sold_quantity",
        exception:
          stageException instanceof Error
            ? stageException.message
            : String(stageException),
      });
      await logOrderError(
        orderId,
        "stage_inventory_compensation_exception",
        `Exception during stage compensation (${reason})`,
        {
          stageId,
          quantity: -quantity,
          rpcName: "increment_stage_sold_quantity",
          exception:
            stageException instanceof Error
              ? stageException.message
              : String(stageException),
        },
      );
    }
  }
}

// Interface for createOrder parameters using options object pattern
export interface CreateOrderParams {
  userId: string;
  eventId: string;
  orgId: string;
  tierId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  paymentInfo: OrderPaymentInfo;
  source: string;
  stageId?: string | null;
  tierName?: string;
  eventName?: string;
  fallbackFeePercent?: number;
}

/**
 * Create an order and generate tickets
 *
 * Supports both options object and legacy positional arguments for backward compatibility
 *
 * @param paramsOrUserId - Either CreateOrderParams object or userId string (legacy)
 * @param eventId - Required if first param is string (legacy)
 * @param orgId - Required if first param is string (legacy)
 * @param tierId - Required if first param is string (legacy)
 * @param quantity - Required if first param is string (legacy)
 * @param unitPrice - Required if first param is string (legacy)
 * @param subtotal - Required if first param is string (legacy)
 * @param paymentInfo - Required if first param is string (legacy)
 * @param source - Required if first param is string (legacy)
 * @param stageId - Optional (legacy)
 * @param tierName - Optional (legacy)
 * @param eventName - Optional (legacy)
 * @param fallbackFeePercent - Optional (legacy)
 * @returns true if order and tickets were created successfully, false otherwise
 */
export async function createOrder(
  paramsOrUserId: CreateOrderParams | string,
  eventIdParam?: string,
  orgIdParam?: string,
  tierIdParam?: string,
  quantityParam?: number,
  unitPriceParam?: number,
  subtotalParam?: number,
  paymentInfoParam?: OrderPaymentInfo,
  sourceParam?: string,
  stageIdParam?: string | null,
  tierNameParam?: string,
  eventNameParam?: string,
  fallbackFeePercentParam?: number,
): Promise<boolean> {
  // Handle both old positional arguments and new options object
  let params: CreateOrderParams;
  if (typeof paramsOrUserId === "string") {
    // Runtime validation for required legacy arguments
    if (
      !eventIdParam ||
      !orgIdParam ||
      !tierIdParam ||
      quantityParam === undefined ||
      unitPriceParam === undefined ||
      subtotalParam === undefined ||
      !paymentInfoParam ||
      !sourceParam
    ) {
      console.error("Missing required arguments for createOrder legacy call:", {
        userId: paramsOrUserId,
        eventId: eventIdParam,
        orgId: orgIdParam,
        tierId: tierIdParam,
        quantity: quantityParam,
        unitPrice: unitPriceParam,
        subtotal: subtotalParam,
        paymentInfo: !!paymentInfoParam,
        source: sourceParam,
      });
      return false;
    }

    // Legacy positional arguments - use parameter values
    params = {
      userId: paramsOrUserId,
      eventId: eventIdParam,
      orgId: orgIdParam,
      tierId: tierIdParam,
      quantity: quantityParam,
      unitPrice: unitPriceParam,
      subtotal: subtotalParam,
      paymentInfo: paymentInfoParam,
      source: sourceParam,
      stageId: stageIdParam,
      tierName: tierNameParam,
      eventName: eventNameParam,
      fallbackFeePercent: fallbackFeePercentParam,
    };
  } else {
    // New options object
    params = paramsOrUserId;
  }

  // Destructure params to get final values
  // All required fields are guaranteed to be present since CreateOrderParams requires them
  const {
    userId,
    eventId,
    orgId,
    tierId,
    quantity,
    unitPrice,
    subtotal,
    paymentInfo,
    source,
    stageId,
    tierName,
    eventName,
    fallbackFeePercent,
  }: CreateOrderParams = params;

  if (!supabaseAdmin) {
    console.error("Database connection error in createOrder");
    return false;
  }

  // Use optional chaining for metadata access
  // paymentInfo is guaranteed to be defined from CreateOrderParams
  const {
    feePercent,
    platformFeeCents,
    markupPercent,
    markupFixedCents,
    basePriceCents,
    promoCode,
    promotionalCodeId: metadataPromotionalCodeId,
    promoterCode,
    discountAmountCents,
  } = paymentInfo.metadata || {};

  // Calculate platform fee using metadata OR fallback logic
  let feeCents = 0;
  if (platformFeeCents !== undefined && platformFeeCents !== null) {
    // 1. Prefer explicit fee amount from metadata
    const parsedFee = parseInt(platformFeeCents, 10);
    if (Number.isFinite(parsedFee)) {
      feeCents = parsedFee;
    }
  } else {
    // 2. Calculate from fallback percent if available
    // Check metadata percent first, then fallback
    const percent =
      feePercent !== undefined
        ? parseFloat(feePercent)
        : fallbackFeePercent || 0;

    if (Number.isFinite(percent) && percent > 0) {
      // Fee-on-top calculation: subtotal * percent / 100
      feeCents = Math.round((subtotal * percent) / 100);
    }
  }

  const totalCents = paymentInfo.amount;
  // Validation: totalCents should roughly equal subtotal + feeCents
  // We don't block order creation on this check, but it's good to know

  // Create Order
  // Use PaymentIntent ID as idempotency_key to prevent duplicate orders on webhook retries

  // Safe parsing for Guaranteed Net fields
  // Use explicit null/undefined checks to allow zero values
  let safeBasePrice = subtotal;
  if (basePriceCents !== undefined && basePriceCents !== null) {
    const parsed = parseInt(basePriceCents, 10);
    if (Number.isFinite(parsed)) {
      safeBasePrice = parsed;
    }
  }

  let safeMarkupPercent: number | undefined;
  if (markupPercent !== undefined && markupPercent !== null) {
    const parsed = parseFloat(markupPercent);
    if (Number.isFinite(parsed)) {
      safeMarkupPercent = parsed;
    }
  }

  let safeMarkupFixed: number | undefined;
  if (markupFixedCents !== undefined && markupFixedCents !== null) {
    const parsed = parseInt(markupFixedCents, 10);
    if (Number.isFinite(parsed)) {
      safeMarkupFixed = parsed;
    }
  }

  // Lookup promotional code ID if promo code is present
  let promotionalCodeId: string | null = null;
  let promotionalCodeUsageCount: number | null = null;
  let promotionalCodeUsageLimit: number | null = null;

  // Prefer ID from metadata if available (e.g. passed from RSVP flow)
  if (metadataPromotionalCodeId) {
    const { data: promoData } = await supabaseAdmin
      .from("promotional_codes")
      .select("id, usage_count, usage_limit")
      .eq("id", metadataPromotionalCodeId)
      .maybeSingle();

    if (promoData) {
      promotionalCodeId = promoData.id;
      promotionalCodeUsageCount = promoData.usage_count;
      promotionalCodeUsageLimit = promoData.usage_limit;
    }
  } else if (promoCode) {
    const { data: promoData } = await supabaseAdmin
      .from("promotional_codes")
      .select("id, usage_count, usage_limit")
      .eq("code", promoCode)
      .eq("event_id", eventId)
      .maybeSingle();

    if (promoData) {
      promotionalCodeId = promoData.id;
      promotionalCodeUsageCount = promoData.usage_count;
      promotionalCodeUsageLimit = promoData.usage_limit;
    }
  }

  let safeDiscountAmount = 0;
  if (discountAmountCents !== undefined && discountAmountCents !== null) {
    const parsed = parseInt(discountAmountCents, 10);
    if (Number.isFinite(parsed)) {
      safeDiscountAmount = parsed;
    }
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: userId,
      organization_id: orgId,
      event_id: eventId,
      ticket_tier_id: tierId,
      quantity: quantity,
      unit_price_cents: unitPrice,
      subtotal_cents: subtotal,
      fees_cents: 0, // Processing fee handled by Stripe
      total_cents: totalCents,
      total_amount_cents: totalCents, // Note: Kept for backward compatibility with existing queries/reports
      platform_fee_cents: feeCents,
      // Guaranteed Net Fields
      base_price_cents: safeBasePrice,
      markup_percent: safeMarkupPercent,
      markup_fixed_cents: safeMarkupFixed,
      total_paid_cents: totalCents,

      stripe_payment_intent_id: paymentInfo.id.startsWith("free_")
        ? null
        : paymentInfo.id,
      status: "paid", // or completed
      payment_method: paymentInfo.payment_method,
      payment_provider: paymentInfo.payment_provider,
      source: source, // Track order source (e.g., "rsvp", "hold", "direct")
      idempotency_key: paymentInfo.id, // Deterministic key prevents duplicates on retries
      created_at: new Date().toISOString(),
      promoter_code: promoterCode || null, // Store promoter code (tracking)
      promotional_code_id: promotionalCodeId, // Store promotional code ID (discount)
      discount_amount_cents: safeDiscountAmount, // Store discount amount
    })
    .select()
    .single();

  if (orderError || !order) {
    console.error("Failed to create order:", orderError);
    return false;
  }

  // Increment Inventory (Sold) with error handling
  try {
    const { error: tierRpcError } = await supabaseAdmin.rpc(
      "increment_tier_quantity_sold",
      {
        p_tier_id: tierId,
        p_increment: quantity,
      },
    );
    if (tierRpcError) {
      console.error(
        "Failed to increment tier quantity sold - rolling back order:",
        {
          tierId,
          quantity,
          eventId,
          orderId: order.id,
          error: tierRpcError,
        },
      );
      // Roll back the order since inventory wasn't properly updated
      await supabaseAdmin
        .from("orders")
        .update({ status: "requires_manual_review" })
        .eq("id", order.id);
      await supabaseAdmin.from("order_errors").insert({
        order_id: order.id,
        error_type: "inventory_update_failed",
        error_message: "Failed to increment tier quantity sold",
        error_details: { tierId, quantity, eventId, rpcError: tierRpcError },
        severity: "critical",
      });
      return false;
    }

    // Increment Promotional Code Usage (if applicable)
    if (promotionalCodeId && promotionalCodeUsageCount !== null) {
      try {
        // Attempt atomic increment with optimistic locking
        // We try up to 3 times to handle race conditions
        let incremented = false;
        let currentUsageCount = promotionalCodeUsageCount;

        for (let i = 0; i < 3; i++) {
          // Check limit before attempting increment
          if (
            promotionalCodeUsageLimit != null &&
            currentUsageCount >= promotionalCodeUsageLimit
          ) {
            console.warn(
              "Promo limit reached during increment retry, stopping:",
              promotionalCodeId,
            );
            break;
          }

          const { data: updatedPromo, error: updateError } = await supabaseAdmin
            .from("promotional_codes")
            .update({ usage_count: currentUsageCount + 1 })
            .eq("id", promotionalCodeId)
            .eq("usage_count", currentUsageCount)
            .select("usage_count")
            .maybeSingle();

          if (updatedPromo && !updateError) {
            incremented = true;
            break;
          }

          // If update failed, fetch latest count and retry
          const { data: latestPromo } = await supabaseAdmin
            .from("promotional_codes")
            .select("usage_count, usage_limit")
            .eq("id", promotionalCodeId)
            .single();

          if (latestPromo) {
            currentUsageCount = latestPromo.usage_count;
            promotionalCodeUsageLimit = latestPromo.usage_limit;
          } else {
            break; // Promo code might have been deleted
          }
        }

        if (!incremented) {
          console.error(
            "Failed to increment promotional code usage count after retries:",
            {
              orderId: order.id,
              promotionalCodeId,
            },
          );
          // We don't fail the order for this, but we log it
          await logOrderError(
            order.id,
            "promo_usage_increment_failed",
            "Failed to increment promotional code usage count",
            { promotionalCodeId, attempts: 3 },
            "medium",
          );
        }
      } catch (promoError) {
        console.error(
          "Exception incrementing promotional code usage:",
          promoError,
        );
        await logOrderError(
          order.id,
          "promo_usage_increment_exception",
          "Exception incrementing promotional code usage count",
          {
            promotionalCodeId,
            error:
              promoError instanceof Error
                ? promoError.message
                : String(promoError),
          },
          "medium",
        );
      }
    }
  } catch (tierErr) {
    console.error(
      "Exception incrementing tier quantity - rolling back order:",
      {
        tierId,
        quantity,
        eventId,
        orderId: order.id,
        error: tierErr instanceof Error ? tierErr.message : String(tierErr),
      },
    );
    // Roll back the order since inventory wasn't properly updated
    try {
      await supabaseAdmin
        .from("orders")
        .update({ status: "requires_manual_review" })
        .eq("id", order.id);
      await supabaseAdmin.from("order_errors").insert({
        order_id: order.id,
        error_type: "inventory_update_exception",
        error_message: "Exception incrementing tier quantity sold",
        error_details: {
          tierId,
          quantity,
          eventId,
          exception:
            tierErr instanceof Error ? tierErr.message : String(tierErr),
        },
        severity: "critical",
      });
    } catch (rollbackErr) {
      console.error("CRITICAL: Failed to mark order for review:", rollbackErr);
    }
    return false;
  }

  if (stageId) {
    try {
      const { error: stageRpcError } = await supabaseAdmin.rpc(
        "increment_stage_sold_quantity",
        {
          p_stage_id: stageId,
          p_increment: quantity,
        },
      );
      if (stageRpcError) {
        console.error(
          "Failed to increment stage sold quantity - rolling back:",
          {
            stageId,
            quantity,
            eventId,
            orderId: order.id,
            error: stageRpcError,
          },
        );
        // Roll back tier increment and mark order for review
        try {
          const { error: rollbackError } = await supabaseAdmin.rpc(
            "increment_tier_quantity_sold",
            {
              p_tier_id: tierId,
              p_increment: -quantity,
            },
          );

          if (rollbackError) {
            throw rollbackError;
          }
        } catch (tierRollbackErr) {
          console.error("Failed to rollback tier inventory:", tierRollbackErr);
          await logOrderError(
            order.id,
            "inventory_rollback_failed",
            "Failed to rollback tier quantity after stage update failure",
            {
              tierId,
              quantity: -quantity,
              error:
                tierRollbackErr instanceof Error
                  ? tierRollbackErr.message
                  : String(tierRollbackErr),
            },
          );
          // Rethrow or ensure we still mark order for review (which happens below)
        }
        await supabaseAdmin
          .from("orders")
          .update({ status: "requires_manual_review" })
          .eq("id", order.id);
        await supabaseAdmin.from("order_errors").insert({
          order_id: order.id,
          error_type: "stage_inventory_update_failed",
          error_message: "Failed to increment stage sold quantity",
          error_details: {
            stageId,
            tierId,
            quantity,
            eventId,
            rpcError: stageRpcError,
          },
          severity: "critical",
        });
        return false;
      }
    } catch (stageErr) {
      console.error("Exception incrementing stage quantity - rolling back:", {
        stageId,
        quantity,
        eventId,
        orderId: order.id,
        error: stageErr instanceof Error ? stageErr.message : String(stageErr),
      });
      // Roll back tier increment and mark order for review
      try {
        const { error: rollbackError } = await supabaseAdmin.rpc(
          "increment_tier_quantity_sold",
          {
            p_tier_id: tierId,
            p_increment: -quantity,
          },
        );

        if (rollbackError) {
          console.error(
            "Failed to rollback tier inventory in stage exception block:",
            rollbackError,
          );
          await logOrderError(
            order.id,
            "inventory_rollback_failed",
            "Failed to rollback tier quantity after stage update exception",
            {
              tierId,
              quantity: -quantity,
              stageId,
              eventId,
              error: rollbackError.message || String(rollbackError),
            },
          );
        }

        await supabaseAdmin
          .from("orders")
          .update({ status: "requires_manual_review" })
          .eq("id", order.id);
        await supabaseAdmin.from("order_errors").insert({
          order_id: order.id,
          error_type: "stage_inventory_update_exception",
          error_message: "Exception incrementing stage sold quantity",
          error_details: {
            stageId,
            tierId,
            quantity,
            eventId,
            exception:
              stageErr instanceof Error ? stageErr.message : String(stageErr),
          },
          severity: "critical",
        });
      } catch (rollbackErr) {
        console.error(
          "CRITICAL: Failed to rollback tier increment:",
          rollbackErr,
        );
      }
      return false;
    }
  }

  // Fetch user for email and name before generating tickets
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("email, first_name, last_name")
    .eq("id", userId)
    .single();

  if (userError) {
    console.error("Failed to fetch user for ticket generation:", {
      userId,
      orderId: order.id,
      error: userError,
    });
    // Fail-fast: Without user contact info, we cannot properly issue tickets
    console.error(
      "MARKING ORDER FOR MANUAL REVIEW: User data fetch failed after payment",
    );

    try {
      // Update order status to requires_manual_review (NOT delete - payment was captured!)
      await supabaseAdmin
        .from("orders")
        .update({
          status: "requires_manual_review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      // Log to order_errors table for ops reconciliation
      await supabaseAdmin.from("order_errors").insert({
        order_id: order.id,
        error_type: "user_fetch_failed",
        error_message:
          "Failed to fetch user data for ticket generation after payment capture",
        error_details: {
          userId,
          tierId,
          quantity,
          stageId,
          paymentIntentId: paymentInfo.id,
          userError: userError.message || String(userError),
        },
        severity: "critical",
      });

      // Decrement inventory since tickets won't be issued
      await compensateInventory(
        order.id,
        tierId,
        stageId,
        quantity,
        "user fetch failure",
      );
    } catch (compensateErr) {
      console.error("CRITICAL: Failed to mark order for manual review:", {
        orderId: order.id,
        compensateErr,
      });
    }
    return false;
  }

  // Generate Tickets using shared utility
  let tickets: GeneratedTicket[];
  try {
    tickets = await generateTickets({
      orderId: order.id,
      userId: userId,
      eventId: eventId,
      ticketTierId: tierId,
      quantity: quantity,
      attendeeEmail: user.email,
      attendeeFirstName: user.first_name,
      attendeeLastName: user.last_name,
      tierName: tierName || "Ticket",
      eventName: eventName || "Event",
      stageId: stageId,
    });
  } catch (qrError) {
    console.error("Failed to generate tickets in createOrder:", qrError);

    // Log error to order_errors table for reconciliation
    try {
      await supabaseAdmin.from("order_errors").insert({
        order_id: order.id,
        error_type: "qr_generation",
        error_message:
          qrError instanceof Error ? qrError.message : String(qrError),
        error_details: {
          tierId,
          stageId,
          quantity,
          stack: qrError instanceof Error ? qrError.stack : undefined,
        },
        severity: "critical",
      });
    } catch (logError) {
      console.error("Failed to log QR generation error:", logError);
      // Continue with compensation even if logging fails
    }

    // Compensate inventory
    await compensateInventory(
      order.id,
      tierId,
      stageId,
      quantity,
      "QR code generation failure",
    );

    // Mark order for review
    try {
      await supabaseAdmin
        .from("orders")
        .update({ status: "requires_manual_review" })
        .eq("id", order.id);
    } catch (markError) {
      console.error(
        "Failed to mark order for review after QR generation error:",
        {
          orderId: order.id,
          error: markError,
        },
      );
      // Still log to order_errors even if update fails
      try {
        await supabaseAdmin.from("order_errors").insert({
          order_id: order.id,
          error_type: "status_update_failed",
          error_message:
            "Failed to set requires_manual_review status after QR error",
          error_details: {
            originalError: String(qrError),
            updateError: String(markError),
          },
          severity: "critical",
        });
      } catch (_) {
        /* Best effort logging */
      }
    }

    return false;
  }

  // Insert tickets with error handling and compensation
  if (tickets.length > 0) {
    const { data: insertedTickets, error: ticketInsertError } =
      await supabaseAdmin
        .from("tickets")
        .insert(tickets)
        .select("id, qr_code, attendee_name");

    if (ticketInsertError) {
      console.error(
        "Failed to insert tickets - marking order for manual review:",
        ticketInsertError,
      );
      // Mark order for manual review instead of deleting
      try {
        await supabaseAdmin
          .from("orders")
          .update({
            status: "requires_manual_review",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        // Compensate inventory since tickets weren't created
        await compensateInventory(
          order.id,
          tierId,
          stageId,
          quantity,
          "ticket insertion failure",
        );
      } catch (compensateErr) {
        console.error(
          "CRITICAL: Compensation failed after ticket insertion error:",
          compensateErr,
        );
      }
      return false;
    } else if (user.email && insertedTickets) {
      // Fetch event and tier details for email
      try {
        const { data: eventData, error: eventError } = await supabaseAdmin
          .from("events")
          .select("name, starts_at, venue, timezone, organization_id, currency")
          .eq("id", eventId)
          .single();

        if (eventError) {
          console.error("Failed to fetch event data for email:", {
            eventId,
            error: eventError,
          });
        }

        const { data: tierData, error: tierError } = await supabaseAdmin
          .from("ticket_tiers")
          .select("name")
          .eq("id", tierId)
          .single();

        if (tierError) {
          console.error("Failed to fetch tier data for email:", {
            tierId,
            error: tierError,
          });
        }

        if (eventData && tierData) {
          try {
            const emailTickets = insertedTickets.map(t => ({
              id: t.id,
              qrCode: t.qr_code || "",
              attendeeName: t.attendee_name || user.first_name || "Guest",
            }));

            await sendTicketConfirmationEmail({
              userEmail: user.email,
              userName:
                `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
                "Customer",
              eventName: eventData.name,
              eventDate: eventData.starts_at,
              eventTimezone: eventData.timezone || "America/Guayaquil",
              eventVenue: eventData.venue || "",
              ticketTierName: tierData.name,
              quantity: quantity,
              totalAmount: totalCents,
              orderId: order.id,
              currency: eventData.currency ?? "USD",
              tickets: emailTickets,
              promoCode: promoCode,
              discountAmount:
                safeDiscountAmount > 0 ? safeDiscountAmount : undefined,
              subtotalAmount: subtotal, // Original subtotal (unitPrice * quantity)
              explicitFeeBreakdown: basePriceCents
                ? {
                    basePriceCents: safeBasePrice,
                    serviceFeeCents: feeCents, // In Guaranteed Net, feeCents is the total markup
                    ivaCents: 0, // In Guaranteed Net, we treat markup as a single service fee line item
                  }
                : undefined,
              isRsvpApproval: source === "rsvp", // Use RSVP-specific messaging for RSVP approvals
            });
          } catch (emailErr) {
            console.error(
              "Failed to send ticket confirmation email:",
              emailErr,
            );
          }

          if (eventData.organization_id) {
            sendPushToOrgMembersByRole(
              eventData.organization_id,
              "ticket_sold",
              "Ticket Sold!",
              `${quantity}x ${tierData.name} ticket(s) sold for ${eventData.name}`,
              ["owner", "admin"],
              // eventId + orgId let the app open that event's Purchases (v2) instead of the v1 list.
              { data: { deepLink: `/(tabs)/events-management`, eventId, orgId: eventData.organization_id } },
            ).catch(err => console.error("[push] ticket_sold failed:", err));
          }
        }
      } catch (fetchErr) {
        console.error("Failed to fetch event/tier data for email:", fetchErr);
      }
    }
  }

  return true;
}
