import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { maskEmail } from "../../../lib/utils/email-mask";
import { sendPromotionalTicketEmail } from "../../../lib/email/promotional-ticket-notifications";
import { sendPushNotification } from "../../../lib/push-notifications";

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

    // Get user from database
    const { data: user, error: userLookupError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userLookupError && userLookupError.code !== "PGRST116") {
      console.error("Error looking up user:", userLookupError);
      return NextResponse.json(
        { error: "Failed to look up user" },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      event_id,
      ticket_tier_id,
      user_id,
      recipient_email,
      recipient_name,
      quantity = 1,
    }: {
      event_id: string;
      ticket_tier_id: string;
      // W7-H2 (3a): exactly one of `user_id` (existing Flame account) or
      // `recipient_email` (send to a non-Flame email — comp is email-keyed) is
      // required.
      user_id?: string;
      recipient_email?: string;
      recipient_name?: string;
      quantity?: number | string;
    } = body;

    // Validate required fields
    if (!event_id || !ticket_tier_id || (!user_id && !recipient_email)) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: event_id, ticket_tier_id, and either user_id or recipient_email are required",
        },
        { status: 400 }
      );
    }

    // Coerce quantity to number and validate
    const quantityNum = parseInt(String(quantity), 10);

    // Validate quantity - must be an integer between 1 and 10
    if (isNaN(quantityNum) || quantityNum < 1 || quantityNum > 10) {
      return NextResponse.json(
        { error: "Quantity must be an integer between 1 and 10" },
        { status: 400 }
      );
    }

    // Resolve the recipient. Two paths:
    //   • user_id  → existing Flame account (look up email/name; push-eligible)
    //   • recipient_email → no account (email-keyed comp; no push)
    let targetEmail: string;
    let targetCustomerName: string;
    let recipientUserId: string | null = null;

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

      recipientUserId = existingUser.id;
      targetEmail = existingUser.email.toLowerCase();
      targetCustomerName =
        `${existingUser.first_name || ""} ${
          existingUser.last_name || ""
        }`.trim() || targetEmail;
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
      targetEmail = normalizedEmail;
      targetCustomerName =
        (recipient_name || "").trim() || normalizedEmail.split("@")[0];
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

    // Define structure for event organization data
    interface OrganizationMember {
      user_id: string;
    }

    interface Organization {
      id: string;
      name: string;
      organization_members: OrganizationMember[];
    }

    interface EventWithOrg {
      organizations: Organization;
    }

    // Check if user is a member of the organization
    const eventData = event as unknown as EventWithOrg;
    const isMember = eventData.organizations.organization_members.some(
      member => member.user_id === user.id
    );

    if (!isMember) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to create promotional tickets for this event",
        },
        { status: 403 }
      );
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

    // For free promotional tickets, metadata should always be null
    // Stage metadata is only used for bank transfer orders to track pricing
    // Free tickets should not have stage_price_cents in metadata

    // Note: We removed the check for existing tickets to allow multiple tickets per email.
    // The database unique constraint on (event_id, email) should have been dropped or modified.

    // Prepare tickets for insertion
    const ticketsToInsert = Array.from({ length: quantityNum }).map(() => ({
      event_id,
      ticket_tier_id,
      email: targetEmail,
      customer_name: targetCustomerName.trim(),
      status: "issued",
      created_by: user.id,
      metadata: null, // Free promotional tickets have no stage metadata
    }));

    // Create promotional tickets
    const { data: promotionalTickets, error: createError } = await supabaseAdmin
      .from("promotional_tickets")
      .insert(ticketsToInsert)
      .select(
        `
        id,
        qr_token,
        email,
        customer_name,
        created_at,
        ticket_tiers (
          name,
          price_cents
        )
      `
      );

    if (createError || !promotionalTickets) {
      console.error("Error creating promotional tickets:", createError);
      if ((createError as any).code === "23505") {
        console.error(
          "Unique constraint violation - ensure migration 20251229000000_modify_promotional_index.sql was applied"
        );
        return NextResponse.json(
          {
            error:
              "Unable to create tickets due to a database constraint. Please contact support if the issue persists.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Failed to create promotional tickets" },
        { status: 500 }
      );
    }

    // Log for audit trail (PII protection)
    const maskedEmail = maskEmail(targetEmail);
    console.log(
      `✅ ${quantityNum} Promotional ticket(s) created for: ${maskedEmail} (Event: ${event.name})`
    );

    // Send complimentary-ticket email WITH the PDF attached (W7-H2 Part A).
    // One email, one N-page PDF (a QR per ticket). Replaces the old link-only
    // `sendTicketReadyEmail`.
    const correlationId = crypto.randomUUID();
    const opaqueOrderId = promotionalTickets[0]?.id ?? correlationId;
    try {
      const emailSent = await sendPromotionalTicketEmail({
        recipientEmail: targetEmail,
        recipientName: targetCustomerName,
        eventId: event.id,
        eventName: event.name,
        eventDate: event.starts_at,
        eventVenue: event.venue || "TBD",
        eventCity: event.city || "",
        ticketTierName: ticketTier.name,
        organizationName: eventData.organizations.name,
        eventSlug: event.slug,
        tickets: promotionalTickets.map(t => ({
          qrToken: t.qr_token,
          ticketId: t.id,
          attendeeName: t.customer_name ?? targetCustomerName,
        })),
      });
      if (emailSent) {
        console.log(
          `✅ Complimentary-ticket email (PDF) sent for ${quantityNum} ticket(s) to ${maskedEmail}`
        );
      } else {
        console.error(
          "Complimentary-ticket email delivery failed (sendPromotionalTicketEmail returned false)",
          {
            correlationId,
            opaqueOrderId,
            maskedEmail,
            eventId: event.id,
            eventName: event.name,
            ticketTierName: ticketTier.name,
            quantity: quantityNum,
            action: "sendPromotionalTicketEmail",
          }
        );
      }
    } catch (emailError) {
      console.error("Error sending promotional ticket email:", emailError);
    }

    // Send push + in-app notification ONLY when the recipient has a Flame
    // account. No-account recipients (3a) have no `users` row to notify — they
    // get the PDF email and can scan it at the door.
    if (recipientUserId) {
      sendPushNotification({
        userId: recipientUserId,
        type: "ticket_received",
        title: "You Received a Ticket!",
        body: `You received ${quantityNum} ticket(s) for ${event.name}`,
        data: { deepLink: "/(tabs)/my-tickets", eventId: event.id },
      }).catch((err) => console.error("[push] ticket_received (complementary) failed:", err));
    }

    return NextResponse.json({
      message: `${quantityNum} promotional ticket(s) created successfully`,
      tickets: promotionalTickets,
      // Return the first one as representative if needed by old clients,
      // but new clients should handle the array if they support it.
      // We'll keep 'ticket' for backward compatibility if it was used singular.
      ticket: promotionalTickets[0] || null,
    });
  } catch (error) {
    console.error("❌ Promotional ticket creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
