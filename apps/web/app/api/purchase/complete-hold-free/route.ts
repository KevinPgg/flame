import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";
import { sendTicketReadyEmail } from "../../../lib/email/ticket-notifications";
import { validateAndNormalizePromoterCode } from "../../../lib/utils/promoter-code";
import QRCode from "qrcode";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  console.log("=== START: Complete Free Hold Purchase ===");
  try {
    const {
      holdSessionId,
      promotional_code_id,
      promoter_code: clientPromoterCode,
    } = await req.json();
    console.log("Hold Session ID:", holdSessionId);

    if (!holdSessionId) {
      return NextResponse.json(
        { error: "Hold session ID is required" },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const { userId } = await auth();
    if (!userId || !supabaseAdmin) {
      return NextResponse.json(
        { error: "You must be logged in to complete a purchase" },
        { status: 401 }
      );
    }

    // Get the current user's Supabase record
    let currentUser;
    try {
      currentUser = await resolveDbUserFromClerkId(userId);
    } catch (error) {
      const status =
        error instanceof Error && error.message === "User not found"
          ? 404
          : 500;
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "User not found" },
        { status }
      );
    }

    // Get hold with all related details
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

    if (holdError || !hold) {
      return NextResponse.json(
        { error: "Hold session not found", expired: true },
        { status: 404 }
      );
    }

    // Verify hold hasn't expired
    const now = new Date();
    const expiresAt = new Date(hold.expires_at);
    if (expiresAt <= now) {
      await supabaseAdmin.from("holds").delete().eq("id", holdSessionId);
      return NextResponse.json(
        { error: "Hold session has expired", expired: true },
        { status: 410 }
      );
    }

    // Verify hold hasn't already been used
    if (hold.order_id) {
      return NextResponse.json(
        { error: "Hold session already used", expired: true },
        { status: 410 }
      );
    }

    // Promoter code logic
    const promoterCodeFromHold = hold.promoter_code;
    const effectivePromoterCode = promoterCodeFromHold || clientPromoterCode;
    let normalizedPromoterCode = null;

    if (effectivePromoterCode) {
      const promoterValidation = validateAndNormalizePromoterCode(
        effectivePromoterCode
      );
      if (!promoterValidation.valid) {
        return NextResponse.json(
          { error: "Invalid promoter code" },
          { status: 400 }
        );
      }
      normalizedPromoterCode = promoterValidation.code;
    }

    // Calculate total amount
    const unitPrice = hold.stage_price_cents ?? hold.ticket_tiers.price_cents;
    const quantity = hold.quantity;
    const subtotalCents = unitPrice * quantity;

    // Handle promotional code discount
    let discountAmountCents = 0;
    let promoCodeApplied = false;
    let promoCodeString: string | undefined = undefined;

    if (promotional_code_id) {
      const { data: promoCode, error: fetchError } = await supabaseAdmin
        .from("promotional_codes")
        .select("code, discount_percentage, event_id")
        .eq("id", promotional_code_id)
        .single();

      if (promoCode && !fetchError && promoCode.event_id === hold.event_id) {
        discountAmountCents = Math.round(
          (subtotalCents * promoCode.discount_percentage) / 100
        );
        promoCodeApplied = true;
        promoCodeString = promoCode.code;
      }
    }

    const totalCents = Math.max(0, subtotalCents - discountAmountCents);

    // Verify this is actually a free order
    if (totalCents !== 0) {
      return NextResponse.json(
        {
          error: "This endpoint is only for free tickets. Please use the payment flow for paid tickets.",
        },
        { status: 400 }
      );
    }

    // Prepare ticket data for atomic function
    const attendeeName =
      `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim() ||
      currentUser.email;

    const ticketData = [];
    const qrTokenMap: Map<string, number> = new Map();

    for (let i = 0; i < quantity; i++) {
      const qrToken = crypto.randomUUID();
      qrTokenMap.set(qrToken, i + 1);

      const placeholderQrData = JSON.stringify({
        orderId: "PLACEHOLDER",
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

    // Execute atomic purchase completion using RPC function
    const { data: result, error: purchaseError } = await supabaseAdmin.rpc(
      "complete_hold_purchase",
      {
        p_hold_id: holdSessionId,
        p_user_id: currentUser.id,
        p_quantity: quantity,
        p_unit_price_cents: unitPrice,
        p_subtotal_cents: subtotalCents,
        p_processing_fee_cents: 0,
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

    if (purchaseError || !result?.success) {
      console.error("Purchase failed:", purchaseError, result);
      return NextResponse.json(
        { error: "Failed to complete purchase" },
        { status: 500 }
      );
    }

    const orderId = result.order_id;

    // Regenerate QR codes
    const { data: createdTicketsForQrUpdate, error: ticketsForQrError } =
      await supabaseAdmin
        .from("tickets")
        .select("id, qr_token")
        .eq("order_id", orderId);

    if (ticketsForQrError || !createdTicketsForQrUpdate) {
      console.error("Failed to fetch tickets for QR update:", ticketsForQrError);
      return NextResponse.json(
        { error: "Failed to generate ticket QR codes" },
        { status: 500 }
      );
    }

    // Regenerate QR codes in parallel
    const qrUpdatePromises = createdTicketsForQrUpdate.map(async (ticket) => {
      const qrToken = ticket.qr_token;
      const ticketNumber = qrTokenMap.get(qrToken);

      if (!ticketNumber) {
        throw new Error(`Missing QR token mapping for ticket: ${ticket.id}`);
      }

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

      const { error: qrUpdateError } = await supabaseAdmin!
        .from("tickets")
        .update({ qr_code: qrCodeDataUrl })
        .eq("id", ticket.id);

      if (qrUpdateError) {
        throw new Error(`Failed to update ticket QR code: ${qrUpdateError.message}`);
      }
    });

    try {
      await Promise.all(qrUpdatePromises);
    } catch (qrError) {
      // Log error but don't fail the request since the order is already completed
      // Users will receive tickets with placeholder QR codes which is better than a failed transaction
      console.error("QR Code generation failed (non-fatal):", qrError);
    }

    // Update order with free payment method
    const { data: orderData, error: orderUpdateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_method: "free",
        payment_provider: "free",
        status: "completed",
      })
      .eq("id", orderId)
      .select(); // Ensure we get back the result to verify

    if (orderUpdateError || !orderData || orderData.length === 0) {
      console.error("Failed to update order status:", orderUpdateError);
      return NextResponse.json(
        { error: "Failed to finalize order status" },
        { status: 500 }
      );
    }

    // Fetch created tickets for email
    const { data: createdTickets, error: fetchTicketsError } = await supabaseAdmin
      .from("tickets")
      .select("id, qr_code, attendee_name")
      .eq("order_id", orderId);

    if (fetchTicketsError) {
      console.error("Failed to fetch tickets for email:", fetchTicketsError);
    }

    // Send ticket-ready notification (simple email, no PDF)
    if (createdTickets && createdTickets.length > 0) {
      try {
        await sendTicketReadyEmail({
          userEmail: currentUser.email,
          userName: attendeeName,
          eventName: hold.events.name,
          eventDate: hold.events.starts_at,
          eventVenue: hold.events.venue,
          ticketTierName: hold.ticket_tiers.name,
          quantity: quantity,
          orderId: orderId,
          paymentMethod: "free",
        });
      } catch (emailError) {
        console.error("Error sending ticket-ready email:", emailError);
      }
    }

    // Revalidate caches
    try {
      if (hold?.events?.slug) {
        revalidatePath(`/events/${hold.events.slug}`);
      }
      revalidatePath("/organizer");
      revalidatePath("/account");
    } catch (revalidationError) {
      console.error("Warning: Cache revalidation failed:", revalidationError);
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      redirect_url: `/purchase/success?order_id=${orderId}`,
    });
  } catch (error) {
    console.error("Free hold purchase error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
