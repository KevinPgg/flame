import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { getUserRole } from "@/app/lib/roles";
import { resolveDbUserFromClerkId } from "@/app/lib/auth";

interface QRData {
  orderId: string;
  eventId: string;
  userId: string;
  tierName: string;
  eventName: string;
  ticketNumber: number;
  timestamp: string;
}

// Normalized ticket type that works for both regular and promotional tickets
type NormalizedTicket = {
  id: string;
  attendee_name: string;
  attendee_email: string;
  status: string;
  checked_in_at: string | null;
  qr_token: string;
  metadata?: {
    stage_id?: string;
    stage_name?: string;
    stage_price_cents?: number;
  } | null;
  ticket_tier: {
    name: string;
    price_cents: number;
  };
  events: {
    id: string;
    name: string;
    starts_at: string;
    venue: string;
    organization_id: string;
    qr_scanner_code?: string;
  };
  order?: {
    id?: string | null; // Optional: promotional tickets don't have order IDs
    quantity: number;
  };
};

export async function POST(req: NextRequest) {
  try {
    const { qrData, deviceId, accessCode, orgId } = await req.json();

    if (orgId !== undefined && (typeof orgId !== "string" || orgId === "")) {
      return NextResponse.json(
        { error: "Invalid orgId: must be a non-empty string when provided" },
        { status: 400 }
      );
    }

    if (!qrData || !deviceId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection not available" },
        { status: 500 }
      );
    }

    // Authentication Logic
    let isAuthorized = false;
    let userRole = null;
    let userId = null;

    // 1. If access code is provided, validate it matches the event code
    if (accessCode) {
      const { data: event, error: eventError } = await supabaseAdmin
        .from("events")
        .select("id, qr_scanner_code, organization_id")
        .eq("id", qrData.eventId)
        .single();

      if (eventError || !event) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }

      if (event.qr_scanner_code === accessCode) {
        isAuthorized = true;
        // When orgId is provided (multi-org context), ensure event belongs to selected org
        if (orgId && typeof orgId === "string" && event.organization_id !== orgId) {
          return NextResponse.json(
            { error: "Event does not belong to the selected organization" },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Invalid access code for this event" },
          { status: 403 }
        );
      }
    }
    // 2. If no access code, fall back to user authentication
    else {
      const authResult = await auth();
      userId = authResult.userId;

      if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Check if user has permission to scan QR codes
      userRole = await getUserRole(userId);
      if (!userRole || userRole === "user") {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { orderId, eventId, ticketNumber, qrToken } = qrData as QRData & {
      qrToken?: string;
    };

    let ticket: NormalizedTicket | null = null;
    let isPromotionalTicket = false;

    // First, try to find regular ticket by order ID and ticket number
    if (orderId && ticketNumber) {
      const { data: tickets, error: ticketsError } = await supabaseAdmin!
        .from("tickets")
        .select(
          `
          id,
          attendee_name,
          attendee_email,
          status,
          checked_in_at,
          qr_token,
          metadata,
          ticket_tier:ticket_tiers (
            name,
            price_cents
          ),
          events!inner (
            id,
            name,
            starts_at,
            venue,
            organization_id,
            qr_scanner_code
          ),
          order:orders (
            id,
            quantity
          )
        `
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (ticketsError) {
        console.error("Database error fetching regular tickets:", ticketsError);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      // Find the specific ticket by number (tickets are 1-indexed)
      if (
        tickets &&
        tickets.length > 0 &&
        ticketNumber > 0 &&
        ticketNumber <= tickets.length
      ) {
        const rawTicket = tickets[ticketNumber - 1];
        ticket = {
          ...rawTicket,
          ticket_tier: Array.isArray(rawTicket.ticket_tier)
            ? rawTicket.ticket_tier[0]
            : rawTicket.ticket_tier,
          events: Array.isArray(rawTicket.events)
            ? rawTicket.events[0]
            : rawTicket.events,
          order: Array.isArray(rawTicket.order)
            ? rawTicket.order[0]
            : rawTicket.order,
        };
      }
    }

    // If not found as regular ticket, try promotional ticket by qr_token
    if (!ticket && qrToken) {
      const { data: promoTicket, error: promoError } = await supabaseAdmin!
        .from("promotional_tickets")
        .select(
          `
          id,
          customer_name,
          email,
          status,
          checked_in_at,
          qr_token,
          metadata,
          ticket_tier:ticket_tiers (
            name,
            price_cents
          ),
          events!inner (
            id,
            name,
            starts_at,
            venue,
            organization_id,
            qr_scanner_code
          )
        `
        )
        .eq("qr_token", qrToken)
        .single();

      if (promoError && promoError.code !== "PGRST116") {
        // PGRST116 = not found
        console.error(
          "Database error fetching promotional ticket:",
          promoError
        );
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      if (promoTicket) {
        ticket = {
          ...promoTicket,
          attendee_name: promoTicket.customer_name,
          attendee_email: promoTicket.email,
          ticket_tier: Array.isArray(promoTicket.ticket_tier)
            ? promoTicket.ticket_tier[0]
            : promoTicket.ticket_tier,
          events: Array.isArray(promoTicket.events)
            ? promoTicket.events[0]
            : promoTicket.events,
          order: {
            quantity: 1, // Promotional tickets are always single tickets
          },
        };
        isPromotionalTicket = true;
      }
    }

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // When orgId is provided (multi-org context), ensure ticket's event belongs to selected org
    if (orgId && typeof orgId === "string" && ticket.events.organization_id !== orgId) {
      return NextResponse.json(
        { error: "Event does not belong to the selected organization" },
        { status: 403 }
      );
    }

    // Verify event ID matches
    if (ticket.events.id !== eventId) {
      return NextResponse.json({ error: "Event mismatch" }, { status: 400 });
    }

    // If authenticated via user, check organization permissions
    if (!accessCode && userId && userRole === "organizer") {
      let dbUser;
      try {
        dbUser = await resolveDbUserFromClerkId(userId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        const status = message === "User not found" ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
      }

      const { data: userOrgs, error: orgMemberError } = await supabaseAdmin!
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", dbUser.id);

      if (orgMemberError) {
        console.error(
          "Error fetching organization memberships:",
          orgMemberError
        );
        return NextResponse.json(
          { error: "Failed to verify permissions" },
          { status: 500 }
        );
      }

      const organizationIds = userOrgs?.map(org => org.organization_id) || [];

      if (!organizationIds.includes(ticket.events.organization_id)) {
        return NextResponse.json(
          {
            error: "You can only scan tickets for your own events",
          },
          { status: 403 }
        );
      }
    }

    // Allow verification of all valid tickets (issued and checked_in)
    // The check-in endpoint will handle preventing double check-ins
    if (ticket.status === "void" || ticket.status === "refunded") {
      return NextResponse.json(
        {
          error: `Ticket is ${ticket.status} and cannot be used`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      ticket: {
        ...ticket,
        sequence_number: ticketNumber || 1, // Return the requested ticket number as sequence_number
      },
      isPromotionalTicket: isPromotionalTicket,
    });
  } catch (error) {
    console.error("QR verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
