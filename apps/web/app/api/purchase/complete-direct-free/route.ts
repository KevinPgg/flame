import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import {
  validatePurchaseToken,
  markTokenAsUsed,
} from "../../../lib/purchase-tokens";
import { sendTicketConfirmationEmail } from "../../../lib/email/ticket-notifications";
import { rollbackPromoCodeUsage } from "../../../lib/utils/promo-code-rollback";
import { validateAndNormalizePromoterCode } from "../../../lib/utils/promoter-code";
import QRCode from "qrcode";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

/**
 * Complete a free RSVP purchase (no payment required)
 * This endpoint is used when the total amount is $0 after discounts
 */
export async function POST(req: NextRequest) {
  try {
    const { token, promotional_code_id, promoter_code } = await req.json();

    if (!token) {
      return NextResponse.json(
        { error: "Purchase token is required" },
        { status: 400 }
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

    // Validate and normalize promoter_code if provided in request or RSVP
    let finalPromoterCode = promoter_code;
    
    // If we have an RSVP with a promoter code, that takes precedence (source of truth)
    if (rsvpDetails.promoter_code) {
      finalPromoterCode = rsvpDetails.promoter_code;
    }

    const promoterValidation = validateAndNormalizePromoterCode(finalPromoterCode);
    if (!promoterValidation.valid) {
      return NextResponse.json(
        { error: promoterValidation.error },
        { status: 400 }
      );
    }
    const normalizedPromoterCode = promoterValidation.code;

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

    // Get the current user's Supabase record and verify they own this RSVP
    const { data: currentUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!currentUser || currentUser.id !== rsvpDetails.user_id) {
      return NextResponse.json(
        { error: "You are not authorized to complete this purchase" },
        { status: 403 }
      );
    }

    // Calculate total amount
    const unitPrice =
      rsvpDetails.stage_price_cents ?? rsvpDetails.ticket_tiers.price_cents;
    const quantity = rsvpDetails.requested_quantity;
    const subtotalCents = unitPrice * quantity;

    // Handle promotional code discount with atomic update
    let discountAmountCents = 0;
    let promoCodeApplied = false;
    let promoCodeString: string | undefined = undefined;
    if (promotional_code_id) {
      // First fetch promo code to verify event and get discount percentage
      const { data: promoCode, error: fetchError } = await supabaseAdmin
        .from("promotional_codes")
        .select("code, discount_percentage, usage_count, usage_limit, event_id")
        .eq("id", promotional_code_id)
        .single();

      // Validate promo code exists and is valid for this event
      if (!promoCode || fetchError) {
        return NextResponse.json(
          { error: "Invalid promotional code. Please verify and try again." },
          { status: 400 }
        );
      }

      if (promoCode.event_id !== rsvpDetails.event_id) {
        return NextResponse.json(
          { error: "This promotional code is not valid for this event." },
          { status: 400 }
        );
      }

      if (promoCode.usage_count >= promoCode.usage_limit) {
        return NextResponse.json(
          {
            error:
              "This promotional code has reached its usage limit. Please try another code.",
          },
          { status: 400 }
        );
      }

      // Atomic increment with WHERE clause to prevent race conditions
      const { data: updatedPromo } = await supabaseAdmin
        .from("promotional_codes")
        .update({ usage_count: promoCode.usage_count + 1 })
        .eq("id", promotional_code_id)
        .eq("usage_count", promoCode.usage_count)
        .select()
        .single();

      // Check if update succeeded - if not, there was a race condition
      if (!updatedPromo) {
        return NextResponse.json(
          {
            error:
              "This promotional code was just used by another customer. Please try again to apply your discount.",
            retry: true,
          },
          { status: 409 }
        );
      }

      // Update succeeded - apply the discount
      promoCodeApplied = true;
      promoCodeString = promoCode.code;
      discountAmountCents = Math.round(
        (subtotalCents * promoCode.discount_percentage) / 100
      );
    }

    const processingFee = 0;
    const totalCents = Math.max(0, subtotalCents - discountAmountCents);

    // Verify this is actually a free order
    if (totalCents !== 0) {
      return NextResponse.json(
        {
          error:
            "This endpoint is only for free tickets. Please use the payment flow for paid tickets.",
        },
        { status: 400 }
      );
    }

    // Create order record for free ticket
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: rsvpDetails.user_id,
        organization_id: rsvpDetails.events.organization_id,
        event_id: rsvpDetails.event_id,
        ticket_tier_id: rsvpDetails.ticket_tier_id,
        quantity: quantity,
        unit_price_cents: unitPrice,
        subtotal_cents: subtotalCents,
        fees_cents: processingFee,
        total_cents: totalCents,
        total_amount_cents: totalCents,
        processing_fee_cents: processingFee,
        promotional_code_id: promoCodeApplied ? promotional_code_id : null,
        discount_amount_cents: discountAmountCents || 0,
        promoter_code: normalizedPromoterCode,
        status: "completed",
        payment_method: "free",
        payment_provider: "free",
        idempotency_key: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Error creating order:", orderError);

      // Rollback promo code usage increment if order creation failed
      if (promoCodeApplied && promotional_code_id) {
        try {
          await rollbackPromoCodeUsage(promotional_code_id);
        } catch (promoError) {
          console.error("CRITICAL: Failed to rollback promo code:", promoError);
        }
      }

      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Update ticket tier quantity_sold to mark tickets as sold
    console.log("Updating ticket tier inventory...");
    const { error: tierUpdateError } = await supabaseAdmin.rpc(
      "increment_tier_quantity_sold",
      {
        p_tier_id: rsvpDetails.ticket_tier_id,
        p_increment: quantity,
      }
    );

    if (tierUpdateError) {
      console.error("Error updating ticket tier inventory:", tierUpdateError);

      // Rollback order creation
      try {
        const { error: orderDeleteError } = await supabaseAdmin
          .from("orders")
          .delete()
          .eq("id", order.id);

        if (orderDeleteError) {
          console.error(
            "CRITICAL: Failed to rollback order:",
            orderDeleteError
          );
        }
      } catch (orderError) {
        console.error("CRITICAL: Exception during order rollback:", orderError);
      }

      // Rollback promo code usage increment
      if (promoCodeApplied && promotional_code_id) {
        try {
          await rollbackPromoCodeUsage(promotional_code_id);
        } catch (promoError) {
          console.error("CRITICAL: Failed to rollback promo code:", promoError);
        }
      }

      return NextResponse.json(
        { error: "Failed to update ticket inventory" },
        { status: 500 }
      );
    }

    // Update stage sold_quantity if this RSVP was for a specific stage
    if (rsvpDetails.stage_id) {
      console.log(
        `Updating stage inventory for stage: ${rsvpDetails.stage_id}...`
      );
      const { error: stageUpdateError } = await supabaseAdmin.rpc(
        "increment_stage_sold_quantity",
        {
          p_stage_id: rsvpDetails.stage_id,
          p_increment: quantity,
        }
      );

      if (stageUpdateError) {
        console.error("Error updating stage inventory:", stageUpdateError);

        // Rollback tier update
        try {
          const { error: tierRollbackError } = await supabaseAdmin.rpc(
            "increment_tier_quantity_sold",
            {
              p_tier_id: rsvpDetails.ticket_tier_id,
              p_increment: -quantity, // Negative to rollback
            }
          );

          if (tierRollbackError) {
            console.error(
              "CRITICAL: Failed to rollback tier inventory:",
              tierRollbackError
            );
          }
        } catch (tierError) {
          console.error("CRITICAL: Exception during tier rollback:", tierError);
        }

        // Rollback order creation
        try {
          const { error: orderDeleteError } = await supabaseAdmin
            .from("orders")
            .delete()
            .eq("id", order.id);

          if (orderDeleteError) {
            console.error(
              "CRITICAL: Failed to rollback order:",
              orderDeleteError
            );
          }
        } catch (orderError) {
          console.error(
            "CRITICAL: Exception during order rollback:",
            orderError
          );
        }

        // Rollback promo code usage increment
        if (promoCodeApplied && promotional_code_id) {
          try {
            await rollbackPromoCodeUsage(promotional_code_id);
          } catch (promoError) {
            console.error(
              "CRITICAL: Failed to rollback promo code:",
              promoError
            );
          }
        }

        return NextResponse.json(
          { error: "Failed to update stage inventory" },
          { status: 500 }
        );
      }
    }

    console.log("✅ Ticket and stage inventory updated successfully");

    // Generate tickets for each quantity
    const tickets = [];
    const ticketInserts = [];

    for (let i = 0; i < quantity; i++) {
      // Generate unique QR token for each ticket
      const qrToken = crypto.randomUUID();

      // Generate QR code data
      const qrData = {
        orderId: order.id,
        eventId: rsvpDetails.event_id,
        userId: rsvpDetails.user_id,
        tierName: rsvpDetails.ticket_tiers.name,
        eventName: rsvpDetails.events.name,
        ticketNumber: i + 1,
        qrToken: qrToken,
        timestamp: new Date().toISOString(),
      };

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        errorCorrectionLevel: "M",
        type: "image/png",
      });

      ticketInserts.push({
        order_id: order.id,
        user_id: rsvpDetails.user_id,
        event_id: rsvpDetails.event_id,
        ticket_tier_id: rsvpDetails.ticket_tier_id,
        attendee_name:
          `${rsvpDetails.users.first_name || ""} ${
            rsvpDetails.users.last_name || ""
          }`.trim() || "Guest",
        attendee_email: rsvpDetails.users.email,
        qr_token: qrToken,
        qr_code: qrCodeDataUrl,
        status: "issued",
      });
    }

    // Insert all tickets atomically
    const { data: createdTickets, error: ticketsError } = await supabaseAdmin
      .from("tickets")
      .insert(ticketInserts)
      .select();

    if (ticketsError || !createdTickets || createdTickets.length !== quantity) {
      console.error("Error creating tickets:", ticketsError);

      // Rollback stage inventory update if applicable
      if (rsvpDetails.stage_id) {
        try {
          const { error: stageRollbackError } = await supabaseAdmin.rpc(
            "increment_stage_sold_quantity",
            {
              p_stage_id: rsvpDetails.stage_id,
              p_increment: -quantity, // Negative to rollback
            }
          );

          if (stageRollbackError) {
            console.error(
              "CRITICAL: Failed to rollback stage inventory:",
              stageRollbackError
            );
          }
        } catch (stageError) {
          console.error(
            "CRITICAL: Exception during stage rollback:",
            stageError
          );
        }
      }

      // Rollback tier inventory update
      try {
        const { error: tierRollbackError } = await supabaseAdmin.rpc(
          "increment_tier_quantity_sold",
          {
            p_tier_id: rsvpDetails.ticket_tier_id,
            p_increment: -quantity, // Negative to rollback
          }
        );

        if (tierRollbackError) {
          console.error(
            "CRITICAL: Failed to rollback tier inventory:",
            tierRollbackError
          );
        }
      } catch (tierError) {
        console.error("CRITICAL: Exception during tier rollback:", tierError);
      }

      // Clean up the order since ticket creation failed
      try {
        const { error: orderDeleteError } = await supabaseAdmin
          .from("orders")
          .delete()
          .eq("id", order.id);

        if (orderDeleteError) {
          console.error(
            "CRITICAL: Failed to rollback order:",
            orderDeleteError
          );
        }
      } catch (orderError) {
        console.error("CRITICAL: Exception during order rollback:", orderError);
      }

      // Rollback promo code usage increment
      if (promoCodeApplied && promotional_code_id) {
        try {
          await rollbackPromoCodeUsage(promotional_code_id);
        } catch (promoError) {
          console.error("CRITICAL: Failed to rollback promo code:", promoError);
        }
      }

      return NextResponse.json(
        { error: "Failed to generate all tickets. Purchase cancelled." },
        { status: 500 }
      );
    }

    tickets.push(...createdTickets);

    // Update RSVP status to purchased
    try {
      const { error: rsvpUpdateError } = await supabaseAdmin
        .from("rsvps")
        .update({
          status: "purchased",
          updated_at: new Date().toISOString(),
        })
        .eq("id", rsvpDetails.id);

      if (rsvpUpdateError) {
        console.error("Error updating RSVP status:", rsvpUpdateError);
        throw rsvpUpdateError;
      }

      // Mark the purchase token as used
      await markTokenAsUsed(token);
    } catch (updateError) {
      console.error("Error finalizing purchase:", updateError);

      // Rollback stage inventory update if applicable
      if (rsvpDetails.stage_id) {
        try {
          const { error: stageRollbackError } = await supabaseAdmin.rpc(
            "increment_stage_sold_quantity",
            {
              p_stage_id: rsvpDetails.stage_id,
              p_increment: -quantity, // Negative to rollback
            }
          );

          if (stageRollbackError) {
            console.error(
              "CRITICAL: Failed to rollback stage inventory:",
              stageRollbackError
            );
          }
        } catch (stageError) {
          console.error(
            "CRITICAL: Exception during stage rollback:",
            stageError
          );
        }
      }

      // Rollback tier inventory update
      try {
        const { error: tierRollbackError } = await supabaseAdmin.rpc(
          "increment_tier_quantity_sold",
          {
            p_tier_id: rsvpDetails.ticket_tier_id,
            p_increment: -quantity, // Negative to rollback
          }
        );

        if (tierRollbackError) {
          console.error(
            "CRITICAL: Failed to rollback tier inventory:",
            tierRollbackError
          );
        }
      } catch (tierError) {
        console.error("CRITICAL: Exception during tier rollback:", tierError);
      }

      // Clean up tickets and order if finalization fails
      try {
        const { error: ticketsDeleteError } = await supabaseAdmin
          .from("tickets")
          .delete()
          .eq("order_id", order.id);

        if (ticketsDeleteError) {
          console.error(
            "CRITICAL: Failed to delete tickets:",
            ticketsDeleteError
          );
        }
      } catch (ticketsError) {
        console.error(
          "CRITICAL: Exception during tickets rollback:",
          ticketsError
        );
      }

      try {
        const { error: orderDeleteError } = await supabaseAdmin
          .from("orders")
          .delete()
          .eq("id", order.id);

        if (orderDeleteError) {
          console.error(
            "CRITICAL: Failed to rollback order:",
            orderDeleteError
          );
        }
      } catch (orderError) {
        console.error("CRITICAL: Exception during order rollback:", orderError);
      }

      // Rollback promo code usage increment
      if (promoCodeApplied && promotional_code_id) {
        try {
          await rollbackPromoCodeUsage(promotional_code_id);
        } catch (promoError) {
          console.error("CRITICAL: Failed to rollback promo code:", promoError);
        }
      }

      return NextResponse.json(
        { error: "Failed to finalize purchase. Please try again." },
        { status: 500 }
      );
    }

    // Send email confirmation with tickets
    if (tickets.length > 0) {
      try {
        await sendTicketConfirmationEmail({
          userEmail: rsvpDetails.users.email,
          userName:
            `${rsvpDetails.users.first_name || ""} ${
              rsvpDetails.users.last_name || ""
            }`.trim() || "Guest",
          eventName: rsvpDetails.events.name,
          eventDate: rsvpDetails.events.starts_at,
          eventVenue: rsvpDetails.events.venue,
          ticketTierName: rsvpDetails.ticket_tiers.name,
          quantity: quantity,
          totalAmount: totalCents,
          orderId: order.id,
          currency: rsvpDetails.events.currency ?? "USD",
          promoCode: promoCodeApplied ? promoCodeString : undefined,
          discountAmount: promoCodeApplied ? discountAmountCents : undefined,
          subtotalAmount: promoCodeApplied ? subtotalCents : undefined,
          orderCreatedAt: new Date(), // Order is being created now, use current timestamp
          tickets: tickets.map((ticket, index) => ({
            id: ticket.id,
            qrCode: ticket.qr_code,
            attendeeName: ticket.attendee_name,
          })),
        });
      } catch (emailError) {
        console.error("Error sending ticket confirmation email:", emailError);
        // Don't fail the purchase if email fails
      }
    }

    // Revalidate caches
    try {
      revalidatePath("/organizer");
      revalidatePath("/account");
    } catch (revalidateError) {
      console.error("⚠️ Cache revalidation failed:", revalidateError);
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      tickets_generated: tickets.length,
      redirect_url: `/purchase/success?order_id=${order.id}`,
    });
  } catch (error) {
    console.error("Free purchase completion API error:", error);
    return NextResponse.json(
      { error: "Failed to complete purchase" },
      { status: 500 }
    );
  }
}
