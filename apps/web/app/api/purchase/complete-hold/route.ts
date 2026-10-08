import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";
import { sendTicketReadyEmail } from "../../../lib/email/ticket-notifications";
import { maskEmail } from "../../../lib/utils/email-mask";
import { validateAndNormalizePromoterCode } from "../../../lib/utils/promoter-code";
import QRCode from "qrcode";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  // DEPRECATED: Datafast route — superseded by Stripe webhooks. Paid purchases use
  // payment_intent.succeeded → createOrderAndTicketsFromHold(); free uses complete-hold-free.
  // No active flows call this route. Log to detect unexpected usage. See docs/todos/EDGE_CASES_TODOS.md #88.
  console.warn(
    "[DEPRECATED] POST /api/purchase/complete-hold hit — Datafast flow is legacy/dead. Paid→Stripe webhook, free→complete-hold-free."
  );

  console.log("=== START: Complete Hold Purchase ===");
  try {
    const {
      holdSessionId,
      datafastTransactionId,
      datafastData,
      promotional_code_id,
      promoter_code: clientPromoterCode, // Keep as optional for backward compatibility
    } = await req.json();
    console.log("Hold Session ID:", holdSessionId);
    console.log("Datafast Transaction ID:", datafastTransactionId);
    console.log("Promotional Code ID:", promotional_code_id);
    console.log(
      "Client Promoter Code (ignored, will use hold record):",
      clientPromoterCode
    );

    if (!holdSessionId) {
      console.error("ERROR: Hold session ID is missing");
      return NextResponse.json(
        { error: "Hold session ID is required" },
        { status: 400 }
      );
    }

    if (!datafastTransactionId) {
      console.error("ERROR: Payment verification required");
      return NextResponse.json(
        { error: "Payment verification required" },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const { userId } = await auth();
    console.log("User ID from Clerk:", userId);

    if (!userId || !supabaseAdmin) {
      console.error("ERROR: User not authenticated or Supabase not connected");
      return NextResponse.json(
        { error: "You must be logged in to complete a purchase" },
        { status: 401 }
      );
    }

    // Get the current user's Supabase record
    console.log("Fetching current user from Supabase...");
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
    console.log("Current user found:", currentUser.email);

    // Get hold with all related details
    console.log("Fetching hold details...");
    const { data: hold, error: holdError } = await supabaseAdmin
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
          price_cents,
          quantity_total,
          quantity_sold
        )
      `
      )
      .eq("id", holdSessionId)
      .eq("user_id", currentUser.id)
      .single();

    if (holdError) {
      console.error("ERROR fetching hold:", holdError);
      return NextResponse.json(
        { error: "Hold session not found", expired: true },
        { status: 404 }
      );
    }

    if (!hold) {
      console.error("ERROR: Hold not found");
      return NextResponse.json(
        { error: "Hold session not found", expired: true },
        { status: 404 }
      );
    }

    console.log("Hold found:", {
      id: hold.id,
      event: hold.events.name,
      quantity: hold.quantity,
      expires_at: hold.expires_at,
    });

    // Verify hold hasn't expired
    const now = new Date();
    const expiresAt = new Date(hold.expires_at);
    console.log("Checking hold expiration:", {
      now: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      is_expired: expiresAt <= now,
    });

    if (expiresAt <= now) {
      console.error("ERROR: Hold has expired");
      // Delete expired hold
      await supabaseAdmin.from("holds").delete().eq("id", holdSessionId);

      return NextResponse.json(
        { error: "Hold session has expired", expired: true },
        { status: 410 }
      );
    }

    // Verify hold hasn't already been used
    if (hold.order_id) {
      console.error("ERROR: Hold already used, order_id:", hold.order_id);
      return NextResponse.json(
        { error: "Hold session already used", expired: true },
        { status: 410 }
      );
    }

    console.log("Hold is valid and not expired");

    // Get promoter_code with fallback for backward compatibility
    // Priority: hold.promoter_code (server) > clientPromoterCode (client fallback) > null
    const promoterCodeFromHold = hold.promoter_code;
    const effectivePromoterCode = promoterCodeFromHold || clientPromoterCode;

    if (promoterCodeFromHold) {
      console.log(
        "[PROMOTER-TRACKING] Using code from hold record:",
        promoterCodeFromHold
      );
    } else if (clientPromoterCode) {
      console.log(
        "[PROMOTER-TRACKING] Using client code (backward compatibility):",
        clientPromoterCode
      );
    } else {
      console.log("[PROMOTER-TRACKING] No promoter code available");
    }

    // Validate and normalize the effective promoter_code
    const promoterValidation = validateAndNormalizePromoterCode(
      effectivePromoterCode
    );

    // Log validation errors but don't fail the purchase
    if (!promoterValidation.valid && effectivePromoterCode) {
      console.error(
        "[PROMOTER-TRACKING] Invalid promoter code:",
        effectivePromoterCode
      );
    }

    // Use null for invalid/missing codes (not undefined)
    const normalizedPromoterCode = promoterValidation.valid
      ? promoterValidation.code
      : null;

    // Calculate total amount
    const unitPrice = hold.stage_price_cents ?? hold.ticket_tiers.price_cents;
    const quantity = hold.quantity;
    const subtotalCents = unitPrice * quantity;

    // Handle promotional code discount - validation and increment handled by database function
    let discountAmountCents = 0;
    let promoCodeApplied = false;
    let promoCodeString: string | undefined = undefined;
    if (promotional_code_id) {
      console.log("Promotional code provided:", promotional_code_id);
      // Fetch promo code to calculate discount amount for email/display purposes
      // Note: Database function will validate and increment usage atomically
      const { data: promoCode, error: fetchError } = await supabaseAdmin
        .from("promotional_codes")
        .select("code, discount_percentage, event_id")
        .eq("id", promotional_code_id)
        .single();

      if (promoCode && !fetchError && promoCode.event_id === hold.event_id) {
        // Calculate discount for display purposes - database will validate and apply atomically
        // Use Math.round() to match database ROUND() logic
        discountAmountCents = Math.round(
          (subtotalCents * promoCode.discount_percentage) / 100
        );
        promoCodeApplied = true;
        promoCodeString = promoCode.code;
        console.log("✅ Promo code will be applied by database function");
        console.log("Discount amount:", discountAmountCents, "cents");
      } else {
        console.log(
          "⚠️ Promo code validation will be handled by database function"
        );
        // Database function will validate and reject if invalid
      }
    } else {
      console.log("No promotional code provided");
    }

    // No processing fees - Datafast handles fees separately
    const processingFee = 0;
    const totalCents = Math.max(0, subtotalCents - discountAmountCents);

    console.log("Purchase calculation:", {
      unitPrice,
      quantity,
      subtotalCents,
      discountAmountCents,
      processingFee: processingFee, // $0 (no fees)
      totalCents,
      promoCodeApplied,
      promoCodeString,
    });

    // Prepare ticket data for atomic function
    const attendeeName =
      `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim() ||
      currentUser.email;

    console.log("Preparing ticket data for", quantity, "tickets...");
    const ticketData = [];
    // Store qr_tokens with their intended ticket numbers for reliable ordering
    const qrTokenMap: Map<string, number> = new Map();

    for (let i = 0; i < quantity; i++) {
      const qrToken = crypto.randomUUID();
      qrTokenMap.set(qrToken, i + 1); // Map qr_token to ticket number

      // Generate placeholder QR code (will be regenerated after order creation with correct format)
      const placeholderQrData = JSON.stringify({
        orderId: "PLACEHOLDER", // Will be replaced after order creation
        eventId: hold.event_id,
        userId: currentUser.id,
        tierName: hold.ticket_tiers.name,
        eventName: hold.events.name,
        ticketNumber: i + 1,
        qrToken: qrToken,
        timestamp: new Date().toISOString(),
      });

      const placeholderQrCodeDataUrl = await QRCode.toDataURL(
        placeholderQrData,
        {
          errorCorrectionLevel: "H",
          width: 400,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        }
      );

      ticketData.push({
        qr_token: qrToken,
        qr_code: placeholderQrCodeDataUrl,
      });
    }
    console.log("Ticket data prepared successfully");

    // Execute atomic purchase completion using RPC function
    // This ensures order, hold update, inventory update, and ticket creation
    // all happen in a single transaction - preventing orphaned orders and inconsistent state
    console.log("Calling complete_hold_purchase RPC function...");
    const { data: result, error: purchaseError } = await supabaseAdmin.rpc(
      "complete_hold_purchase",
      {
        p_hold_id: holdSessionId,
        p_user_id: currentUser.id,
        p_quantity: quantity,
        p_unit_price_cents: unitPrice,
        p_subtotal_cents: subtotalCents,
        p_processing_fee_cents: processingFee,
        p_total_cents: totalCents,
        p_organization_id: hold.events.organization_id,
        p_event_id: hold.event_id,
        p_tier_id: hold.tier_id,
        p_attendee_name: attendeeName,
        p_attendee_email: currentUser.email,
        p_ticket_data: ticketData,
        p_promotional_code_id: promoCodeApplied ? promotional_code_id : null,
        p_discount_amount_cents: discountAmountCents || 0,
        p_promoter_code: normalizedPromoterCode,
      }
    );

    if (purchaseError) {
      console.error("ERROR from complete_hold_purchase RPC:", {
        message: purchaseError.message,
        details: purchaseError.details,
        hint: purchaseError.hint,
        code: purchaseError.code,
      });
    }

    if (!result) {
      console.error("ERROR: RPC returned no result");
    } else {
      console.log("RPC result:", result);
    }

    if (purchaseError || !result?.success) {
      console.error("Purchase failed");
      // Note: No need to rollback promo code usage - database function handles this atomically

      // Check for specific error types
      if (purchaseError?.message?.includes("Hold not found")) {
        return NextResponse.json(
          {
            error: "Hold session not found, expired, or already used",
            expired: true,
          },
          { status: 410 }
        );
      } else if (
        purchaseError?.message?.includes("Insufficient ticket inventory")
      ) {
        return NextResponse.json(
          {
            error: "Insufficient ticket inventory. Please try again.",
            expired: true,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to complete purchase" },
        { status: 500 }
      );
    }

    const orderId = result.order_id;
    console.log("Purchase completed successfully, Order ID:", orderId);

    // Regenerate QR codes with correct format now that we have the order ID
    // CRITICAL: This must succeed or tickets will be unusable
    console.log("Regenerating QR codes with correct format...");
    const { data: createdTicketsForQrUpdate, error: ticketsForQrError } =
      await supabaseAdmin
        .from("tickets")
        .select("id, qr_token")
        .eq("order_id", orderId);

    if (ticketsForQrError || !createdTicketsForQrUpdate) {
      console.error(
        "CRITICAL: Could not fetch tickets for QR regeneration:",
        ticketsForQrError
      );
      // Log error but don't fail the purchase - tickets exist but need manual fix
      // TODO: Implement retry mechanism or alert system
      return NextResponse.json(
        {
          error:
            "Purchase completed but QR code generation failed. Please contact support.",
          orderId: orderId,
        },
        { status: 500 }
      );
    }

    // Validate we got the expected number of tickets
    if (createdTicketsForQrUpdate.length !== quantity) {
      console.error(
        `CRITICAL: Expected ${quantity} tickets but got ${createdTicketsForQrUpdate.length}`
      );
      return NextResponse.json(
        {
          error:
            "Purchase completed but ticket count mismatch. Please contact support.",
          orderId: orderId,
        },
        { status: 500 }
      );
    }

    let qrUpdateFailures = 0;
    for (const ticket of createdTicketsForQrUpdate) {
      const qrToken = ticket.qr_token;
      // Use qr_token map for reliable ticket numbering instead of created_at ordering
      const ticketNumber = qrTokenMap.get(qrToken);

      if (!ticketNumber) {
        console.error(
          `CRITICAL: Could not find ticket number for qr_token ${qrToken}`
        );
        qrUpdateFailures++;
        continue;
      }

      // Generate QR code with correct format matching scanner expectations
      const qrData = {
        orderId: orderId,
        eventId: hold.event_id,
        userId: currentUser.id,
        tierName: hold.ticket_tiers.name,
        eventName: hold.events.name,
        ticketNumber: ticketNumber,
        qrToken: qrToken,
        timestamp: new Date().toISOString(),
      };

      const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: "H",
        width: 400,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      // Update ticket with correct QR code
      const { error: updateError } = await supabaseAdmin
        .from("tickets")
        .update({ qr_code: qrCodeDataUrl })
        .eq("id", ticket.id);

      if (updateError) {
        console.error(
          `CRITICAL: Failed to update QR code for ticket ${ticket.id}:`,
          updateError
        );
        qrUpdateFailures++;
      }
    }

    if (qrUpdateFailures > 0) {
      console.error(
        `CRITICAL: ${qrUpdateFailures} out of ${quantity} QR codes failed to update`
      );
      return NextResponse.json(
        {
          error: `Purchase completed but ${qrUpdateFailures} QR code(s) failed to generate. Please contact support.`,
          orderId: orderId,
        },
        { status: 500 }
      );
    }

    console.log("✅ QR codes regenerated with correct format");

    // Update order with Datafast payment information
    console.log("Updating order with Datafast payment information...");
    const { error: orderUpdateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_method: "datafast",
        payment_provider: "datafast",
        datafast_transaction_id: datafastTransactionId,
        datafast_auth_code: datafastData?.resultDetails?.AuthCode || null,
        datafast_reference_no: datafastData?.resultDetails?.ReferenceNo || null,
        merchant_transaction_id: datafastData?.merchantTransactionId || null,
      })
      .eq("id", orderId);

    if (orderUpdateError) {
      console.error(
        "Warning: Could not update order with Datafast info:",
        orderUpdateError
      );
      // Don't fail the purchase if this update fails
    } else {
      console.log("✅ Order updated with Datafast payment information");
    }

    // Fetch created tickets for email
    console.log("Fetching created tickets for email...");
    const { data: createdTickets, error: ticketsError } = await supabaseAdmin
      .from("tickets")
      .select("id, qr_code, attendee_name")
      .eq("order_id", orderId);

    if (ticketsError) {
      console.error("ERROR fetching tickets:", ticketsError);
    } else {
      console.log("Fetched", createdTickets?.length || 0, "tickets");
    }

    // Send ticket-ready notification (simple email, no PDF)
    if (createdTickets && createdTickets.length > 0) {
      try {
        console.log("Sending ticket-ready email...");
        const emailSent = await sendTicketReadyEmail({
          userEmail: currentUser.email,
          userName: attendeeName,
          eventName: hold.events.name,
          eventDate: hold.events.starts_at,
          eventVenue: hold.events.venue,
          ticketTierName: hold.ticket_tiers.name,
          quantity: quantity,
          orderId: orderId,
          paymentMethod: "datafast",
        });
        if (emailSent) {
          console.log("Ticket-ready email sent successfully");
        } else {
          console.error(
            "Ticket-ready email delivery failed (sendTicketReadyEmail returned false)",
            {
              currentUserId: currentUser.id,
              maskedEmail: maskEmail(currentUser.email),
              holdId: hold.id,
              eventId: hold.events?.id,
              orderId,
              action: "sendTicketReadyEmail",
            }
          );
        }
      } catch (emailError) {
        console.error("Error sending ticket-ready email:", emailError);
        // Don't fail the purchase if email fails
      }
    }

    // Mark Datafast transaction as processed (order completed successfully)
    console.log("🎉 Marking transaction as processed (order completed)...");
    try {
      const { error: txUpdateError } = await supabaseAdmin
        .from("datafast_transactions")
        .update({
          status: "processed",
          order_id: orderId,
          hold_id: holdSessionId,
          processed_at: new Date().toISOString(),
        })
        .eq("datafast_transaction_id", datafastTransactionId);

      if (txUpdateError) {
        console.error(
          "⚠️ Failed to mark transaction as processed:",
          txUpdateError
        );
        // Don't fail the order completion if this fails
      } else {
        console.log("✅ Transaction marked as processed");
      }
    } catch (txError) {
      console.error("⚠️ Error marking transaction as processed:", txError);
      // Don't fail the order completion if this fails
    }

    console.log("=== END: Complete Hold Purchase SUCCESS ===");

    // ⚡ ON-DEMAND REVALIDATION: Clear caches after successful purchase
    // This ensures availability updates immediately for other users
    try {
      // Revalidate event page to update availability
      if (hold?.events?.slug) {
        revalidatePath(`/events/${hold.events.slug}`);
        console.log(
          `[PURCHASE] Revalidated event page: /events/${hold.events.slug}`
        );
      }
      // Revalidate organizer dashboard for revenue & attendee counts
      revalidatePath("/organizer");
      // Revalidate user account page for ticket list
      revalidatePath("/account");
    } catch (revalidationError) {
      console.error("Warning: Cache revalidation failed:", revalidationError);
      // Don't fail the purchase if cache revalidation fails
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      redirect_url: `/purchase/success?order_id=${orderId}`,
    });
  } catch (error) {
    console.error("=== ERROR in POST /api/purchase/complete-hold ===");
    console.error("Error details:", error);
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
