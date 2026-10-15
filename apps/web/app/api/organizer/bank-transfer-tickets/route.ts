import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { maskEmail } from "@/app/lib/utils/email-mask";
import { sendTicketConfirmationEmail } from "@/app/lib/email/ticket-notifications";
import { sendPushNotification } from "@/app/lib/push-notifications";
import QRCode from "qrcode";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { requireEventAccess } from "@/app/lib/utils/event-access";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const {
      event_id,
      ticket_tier_id,
      quantity,
      user_id,
      stage_id,
      unit_price_cents,
      recipient_email,
      recipient_name,
    }: {
      event_id: string;
      ticket_tier_id: string;
      quantity: number;
      // W7-H2 (3b): exactly one of user_id (existing Flame account) or
      // recipient_email (send to a non-Flame email) identifies the recipient.
      user_id?: string;
      recipient_email?: string;
      recipient_name?: string;
      stage_id?: string;
      // W7-H3: optional organizer override of the per-ticket price. When set, it
      // replaces the tier/stage-derived price (server stays authoritative).
      unit_price_cents?: number;
    } = body;

    // Validate required fields
    if (!event_id || !ticket_tier_id || !quantity || (!user_id && !recipient_email)) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: event_id, ticket_tier_id, quantity, and either user_id or recipient_email are required",
        },
        { status: 400 }
      );
    }

    if (quantity < 1 || quantity > 10) {
      return NextResponse.json(
        { error: "Quantity must be between 1 and 10" },
        { status: 400 }
      );
    }

    // W7-H3: validate the custom price override when provided. Must be a
    // positive integer number of cents. $0 is intentionally rejected — use the
    // free/complimentary flow for zero-cost tickets. A generous upper bound
    // guards against fat-finger entries (e.g. cents typed as dollars).
    const hasCustomPrice = unit_price_cents !== undefined && unit_price_cents !== null;
    if (hasCustomPrice) {
      if (
        typeof unit_price_cents !== "number" ||
        !Number.isInteger(unit_price_cents) ||
        unit_price_cents <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "Custom price must be greater than $0. For free tickets, use the Send Free Tickets flow.",
          },
          { status: 400 }
        );
      }
      if (unit_price_cents > 10_000_00) {
        return NextResponse.json(
          { error: "Custom price exceeds the maximum of $10,000 per ticket" },
          { status: 400 }
        );
      }
    }

    // Get organizer from database
    const { data: organizer } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!organizer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify organizer has access to this event
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select(
        `
        id,
        name,
        slug,
        venue,
        city,
        starts_at,
        ends_at,
        organization_id,
        organizations!inner (
          id,
          name,
          organization_members!inner (
            user_id
          )
        )
      `
      )
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if user is a member of the organization
    const isMember = (event.organizations as any).organization_members.some(
      (member: any) => member.user_id === organizer.id
    );

    if (!isMember) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to create bank transfer orders for this event",
        },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, organizer.id, event.id, event.organization_id);
    if (denied) return denied;

    // Resolve the recipient. Two paths:
    //   • user_id        → existing Flame account (push-eligible)
    //   • recipient_email → no Flame account (W7-H2 3b; email-only, no push).
    //     customerEmail / customerName populate orders.customer_email /
    //     customer_name (added in migration 20260611162335). They stay null for
    //     account orders, which keep resolving name/email via the users FK.
    let targetUserId: string | null = null;
    let recipientUserId: string | null = null;
    let targetUserEmail: string;
    let attendeeName: string;
    let customerEmail: string | null = null;
    let customerName: string | null = null;

    if (user_id) {
      const { data: existingUser, error: userError } = await supabaseAdmin
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("id", user_id)
        .single();

      if (userError || !existingUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      // Validate email exists and normalize it once
      if (!existingUser.email) {
        return NextResponse.json(
          { error: "Target user does not have an email set" },
          { status: 400 }
        );
      }

      targetUserId = existingUser.id;
      recipientUserId = existingUser.id;
      targetUserEmail = existingUser.email.toLowerCase();
      attendeeName =
        `${existingUser.first_name || ""} ${existingUser.last_name || ""}`.trim() ||
        targetUserEmail;
    } else {
      // No-account send: validate the email and derive a display name.
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const normalizedEmail = (recipient_email || "").trim().toLowerCase();
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json(
          { error: "A valid recipient_email is required" },
          { status: 400 }
        );
      }
      targetUserEmail = normalizedEmail;
      attendeeName = (recipient_name || "").trim() || normalizedEmail.split("@")[0];
      customerEmail = normalizedEmail;
      customerName = (recipient_name || "").trim() || null;
    }

    // Verify ticket tier belongs to this event and get stage info
    const { data: ticketTier, error: tierError } = await supabaseAdmin
      .from("ticket_tiers")
      .select(
        `
        id,
        name,
        price_cents,
        event_id,
        quantity_total,
        quantity_sold,
        ticket_stages (
          id,
          name,
          price_cents,
          quantity,
          sold_quantity,
          order_index
        )
      `
      )
      .eq("id", ticket_tier_id)
      .eq("event_id", event_id)
      .single();

    if (tierError || !ticketTier) {
      return NextResponse.json(
        { error: "Ticket tier not found for this event" },
        { status: 404 }
      );
    }

    // Calculate current stage info and price
    let unitPriceCents = ticketTier.price_cents;
    let stageMetadata: {
      stage_id: string;
      stage_name: string;
      stage_price_cents: number;
    } | null = null;

    // If stage_id is provided, use that specific stage
    if (stage_id) {
      const stage = ticketTier.ticket_stages?.find(
        (s: any) => s.id === stage_id
      );

      if (!stage) {
        return NextResponse.json(
          { error: "Selected ticket stage not found" },
          { status: 404 }
        );
      }

      unitPriceCents = stage.price_cents;
      stageMetadata = {
        stage_id: stage.id,
        stage_name: stage.name,
        stage_price_cents: stage.price_cents,
      };
    } else if (
      ticketTier.ticket_stages &&
      ticketTier.ticket_stages.length > 0
    ) {
      // Sort stages by order_index
      const sortedStages = [...ticketTier.ticket_stages].sort(
        (a: any, b: any) => a.order_index - b.order_index
      );

      // Track cumulative quantity to determine which stage we're in
      let cumulativeQuantity = 0;
      const totalSold = ticketTier.quantity_sold || 0;

      for (const stage of sortedStages) {
        const stageEndQuantity = cumulativeQuantity + stage.quantity;

        // Check if we're still in this stage
        if (totalSold < stageEndQuantity) {
          unitPriceCents = stage.price_cents;
          stageMetadata = {
            stage_id: stage.id,
            stage_name: stage.name,
            stage_price_cents: stage.price_cents,
          };
          break;
        }

        // Move to next stage
        cumulativeQuantity = stageEndQuantity;
      }

      // If no stage found (all sold out), use last stage
      if (!stageMetadata && sortedStages.length > 0) {
        const lastStage = sortedStages[sortedStages.length - 1];
        unitPriceCents = lastStage.price_cents;
        stageMetadata = {
          stage_id: lastStage.id,
          stage_name: lastStage.name,
          stage_price_cents: lastStage.price_cents,
        };
      }
    }

    // W7-H3: apply the organizer's custom price override (if any). It replaces
    // the tier/stage-derived unit price for this send. The stage association is
    // still recorded in `stageMetadata` below; we only swap the amount charged.
    const stageDerivedPriceCents = unitPriceCents;
    if (hasCustomPrice) {
      unitPriceCents = unit_price_cents as number;
    }

    // Check availability - SKIPPED for bank transfer orders to allow organizer override
    // The organizer can choose to oversell if they wish (e.g. squeezing one more person in)
    /*
    const newQuantitySold = (ticketTier.quantity_sold || 0) + quantity;
    if (
      ticketTier.quantity_total &&
      newQuantitySold > ticketTier.quantity_total
    ) {
      return NextResponse.json(
        { error: "Not enough tickets available" },
        { status: 409 }
      );
    }
    */

    // Calculate amounts
    const subtotalCents = unitPriceCents * quantity;
    const feesCents = 0; // No processing fees for bank transfers
    const totalCents = subtotalCents;

    // Generate idempotency key
    const idempotencyKey = crypto.randomUUID();

    console.log(
      `Generating ${quantity} tickets for ${maskEmail(targetUserEmail)}...`
    );

    // Generate QR tokens (but not QR codes yet - we need orderId first)
    const ticketData: Array<{ qr_token: string; ticket_number: number }> = [];
    for (let i = 0; i < quantity; i++) {
      const qrToken = crypto.randomUUID();
      ticketData.push({
        qr_token: qrToken,
        ticket_number: i + 1,
      });
    }

    // Use atomic transaction via Postgres function for order + tickets + inventory
    // This ensures either all succeed or all fail
    // Note: We'll generate QR codes AFTER order creation so we can include orderId
    const ticketsToInsert = ticketData.map(ticket => ({
      ticket_tier_id: ticket_tier_id,
      user_id: targetUserId,
      event_id: event_id,
      attendee_name: attendeeName,
      attendee_email: targetUserEmail,
      status: "issued",
      qr_token: ticket.qr_token,
      qr_code: null, // Will be generated after order creation
      // W7-H3: when the organizer set a custom price, record it (plus the
      // catalog price it overrode) for auditing. `stage_*` keys preserve the
      // existing shape so the Sent list / reporting are unaffected.
      metadata:
        stageMetadata || hasCustomPrice
          ? {
              ...(stageMetadata
                ? {
                    stage_id: stageMetadata.stage_id,
                    stage_name: stageMetadata.stage_name,
                    stage_price_cents: stageMetadata.stage_price_cents,
                  }
                : {}),
              ...(hasCustomPrice
                ? {
                    custom_price: true,
                    custom_unit_price_cents: unitPriceCents,
                    catalog_unit_price_cents: stageDerivedPriceCents,
                  }
                : {}),
            }
          : null,
    }));

    // Call RPC function for atomic transaction
    const { data: transactionResult, error: transactionError } =
      await supabaseAdmin.rpc("create_bank_transfer_order_atomic", {
        p_user_id: targetUserId,
        p_organization_id: event.organization_id,
        p_event_id: event_id,
        p_ticket_tier_id: ticket_tier_id,
        p_quantity: quantity,
        p_unit_price_cents: unitPriceCents,
        p_subtotal_cents: subtotalCents,
        p_fees_cents: feesCents,
        p_total_cents: totalCents,
        p_idempotency_key: idempotencyKey,
        p_tickets: JSON.stringify(ticketsToInsert),
        p_stage_id: stageMetadata?.stage_id || null,
        // W7-H2 (3b): null for account orders; set for no-account recipients so
        // the order carries the recipient's email/name (no users FK to join).
        p_customer_email: customerEmail,
        p_customer_name: customerName,
      });

    if (transactionError || !transactionResult?.success) {
      console.error(
        "❌ Failed to create bank transfer order:",
        transactionError
      );
      return NextResponse.json(
        {
          error:
            transactionError?.message ||
            transactionResult?.error ||
            "Failed to create order",
        },
        { status: 500 }
      );
    }

    // Build order object with total_cents from local calculation
    // Note: totalCents is calculated above (line 221) and passed to the RPC function
    const order = {
      id: transactionResult.order_id,
      total_cents: totalCents, // Use locally calculated totalCents value
    };
    const tickets = transactionResult.tickets || [];

    console.log(
      `✅ Order and ${tickets.length} tickets created atomically: ${order.id}`
    );

    // Validate all tickets have qr_token before proceeding (fail fast)
    interface ValidatedTicket {
      ticket: { id: string; created_at?: string; [key: string]: unknown };
      qrToken: string;
      index: number;
    }

    const validatedTickets: ValidatedTicket[] = tickets.map(
      (ticket: any, index: number) => {
        // Simplified extraction: use optional chaining and fallback to ticketData once
        const qrToken = ticket?.qr_token || ticketData[index]?.qr_token;

        if (!qrToken) {
          console.error(`❌ Missing qr_token for ticket at index ${index}`);
          console.error("Ticket object:", JSON.stringify(ticket, null, 2));
          console.error("TicketData at index:", ticketData[index]);
          throw new Error(
            `Missing qr_token for ticket ${ticket?.id || `at index ${index}`}`
          );
        }

        return {
          ticket: ticket as {
            id: string;
            created_at?: string;
            [key: string]: unknown;
          },
          qrToken: String(qrToken), // Ensure qrToken is a string (UUID)
          index,
        };
      }
    );

    // Generate QR codes for all tickets
    let qrCodeUpdates: Array<{ ticket_id: string; qr_code: string }>;
    try {
      qrCodeUpdates = await Promise.all(
        validatedTickets.map(async ({ ticket, qrToken, index }) => {
          const qrData = {
            orderId: order.id, // Bank transfer orders have orderId
            eventId: event_id,
            userId: targetUserEmail, // Use email as identifier
            tierName: ticketTier.name,
            eventName: event.name,
            ticketNumber: index + 1,
            qrToken: qrToken,
            timestamp: ticket.created_at || new Date().toISOString(),
          };

          const qrDataString = JSON.stringify(qrData);
          const qrCodeDataUrl = await QRCode.toDataURL(qrDataString, {
            errorCorrectionLevel: "H",
            width: 400,
            margin: 2,
            color: {
              dark: "#000000",
              light: "#FFFFFF",
            },
          });

          return {
            ticket_id: ticket.id,
            qr_code: qrCodeDataUrl,
          };
        })
      );
    } catch (qrError) {
      // Recovery strategy: Log failed QR generation for retry
      console.error("❌ Failed to generate QR codes:", qrError);
      const failedTicketIds = validatedTickets.map(
        (vt: ValidatedTicket) => vt.ticket.id
      );
      console.error("Failed ticket IDs:", failedTicketIds);
      // Note: In a production system, you might want to enqueue these for retry
      // For now, we'll throw to prevent partial state
      throw new Error(
        `Failed to generate QR codes for tickets: ${failedTicketIds.join(", ")}`
      );
    }

    // Batch update all QR codes in a single query
    if (qrCodeUpdates.length > 0 && supabaseAdmin) {
      const ticketIds = qrCodeUpdates.map(update => update.ticket_id);

      // Use Supabase's ability to update multiple rows
      // Note: Supabase doesn't support bulk updates with different values per row
      // So we'll use Promise.all for parallel updates, but it's still more efficient than sequential
      const updatePromises = qrCodeUpdates.map(update =>
        supabaseAdmin!
          .from("tickets")
          .update({ qr_code: update.qr_code })
          .eq("id", update.ticket_id)
      );

      const updateResults = await Promise.all(updatePromises);

      // Check for any update errors - preserve index alignment
      const failedIds = updateResults
        .map((result, index) =>
          result.error ? qrCodeUpdates[index].ticket_id : null
        )
        .filter((id): id is string => !!id);

      if (failedIds.length > 0) {
        console.error("❌ Failed to update some QR codes:", updateResults);
        throw new Error(
          `Failed to update QR codes for tickets: ${failedIds.join(", ")}`
        );
      }
    }

    console.log(`✅ Generated and updated ${qrCodeUpdates.length} QR codes`);

    // Send the ticket email WITH the PDF attached (W7-H2 Part A). We reuse the
    // paid-order sender but pass an EXPLICIT flat fee breakdown: bank-transfer
    // orders carry no platform fee (`feesCents = 0`), so the whole amount is the
    // ticket price. This shows the actual (possibly custom, W7-H3) price without
    // the paid path's `calculateFeeBreakdownFromTotal` inventing a base/IVA split.
    try {
      const pdfTickets = qrCodeUpdates.map(update => ({
        id: update.ticket_id,
        qrCode: update.qr_code,
        attendeeName,
      }));
      await sendTicketConfirmationEmail({
        userEmail: targetUserEmail,
        userName: attendeeName,
        eventName: event.name,
        eventDate: event.starts_at,
        eventVenue: event.venue,
        ticketTierName: ticketTier.name,
        quantity: quantity,
        totalAmount: totalCents,
        orderId: order.id,
        explicitFeeBreakdown: {
          basePriceCents: totalCents,
          serviceFeeCents: 0,
          ivaCents: 0,
        },
        tickets: pdfTickets,
      });
      console.log(
        `✅ Bank-transfer ticket email (PDF) sent to ${maskEmail(targetUserEmail)}`
      );
    } catch (emailError) {
      console.error("Error sending bank transfer ticket email:", emailError);
    }

    // Send push + in-app notification ONLY when the recipient has a Flame
    // account. No-account recipients (3b) have no `users` row to notify — they
    // get the PDF email and scan it at the door.
    if (recipientUserId) {
      sendPushNotification({
        userId: recipientUserId,
        type: "ticket_received",
        title: "You Received a Ticket!",
        body: `You received ${quantity} ticket(s) for ${event.name}`,
        data: { deepLink: "/(tabs)/my-tickets", eventId: event.id },
      }).catch((err) => console.error("[push] ticket_received (bank_transfer) failed:", err));
    }

    // Revalidate cache
    revalidatePath(`/events/${event.slug}`);
    revalidatePath(`/events/${event.slug}/organizer`);
    revalidatePath("/account");

    console.log(
      `✅ Bank transfer order completed: ${
        tickets.length
      } tickets for ${maskEmail(targetUserEmail)}`
    );

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        total_cents: order.total_cents, // Returns the numeric value assigned above
      },
      tickets_created: tickets.length,
      user: {
        email: targetUserEmail,
        name: attendeeName,
      },
    });
  } catch (error) {
    console.error("❌ Bank transfer ticket creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
