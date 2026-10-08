import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { getUserRole } from "@/app/lib/roles";
import { resolveDbUserFromClerkId } from "@/app/lib/auth";
import { z } from "zod";

// Define typed interface for ticket with event data
interface TicketWithEvent {
  id: string;
  status: string;
  checked_in_at: string | null;
  events: {
    id: string;
    organization_id: string;
    qr_scanner_code: string | null;
  };
}

const TicketWithEventSchema = z.object({
  id: z.string(),
  status: z.string(),
  checked_in_at: z.string().nullable(),
  events: z.object({
    id: z.string(),
    organization_id: z.string(),
    qr_scanner_code: z.string().nullable(),
  }),
});

async function authorizeViaAccessCode(
  accessCode: string,
  eventCode: string | null
): Promise<{ authorized: boolean; error?: string; status?: number }> {
  if (eventCode && eventCode === accessCode) {
    return { authorized: true };
  }
  return {
    authorized: false,
    error: "Invalid access code for this event",
    status: 403,
  };
}

async function authorizeViaUserAuth(
  ticket: TicketWithEvent
): Promise<{ authorized: boolean; error?: string; status?: number }> {
  const authResult = await auth();
  const userId = authResult.userId;

  if (!userId) {
    return { authorized: false, error: "Unauthorized", status: 401 };
  }

  // Check if user has permission to check in tickets
  const userRole = await getUserRole(userId);
  if (!userRole || userRole === "user") {
    return {
      authorized: false,
      error: "Insufficient permissions",
      status: 403,
    };
  }

  // Check if user has access to this event
  if (userRole === "organizer") {
    let dbUser;
    try {
      dbUser = await resolveDbUserFromClerkId(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = message === "User not found" ? 404 : 500;
      return { authorized: false, error: message, status };
    }

    if (!supabaseAdmin) {
      return {
        authorized: false,
        error: "Database not configured",
        status: 500,
      };
    }

    const { data: userOrgs, error: orgMemberError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", dbUser.id);

    if (orgMemberError) {
      console.error("Error fetching organization memberships:", orgMemberError);
      return {
        authorized: false,
        error: "Failed to verify permissions",
        status: 500,
      };
    }

    const organizationIds = userOrgs?.map(org => org.organization_id) || [];

    if (!organizationIds.includes(ticket.events.organization_id)) {
      return {
        authorized: false,
        error: "You can only check in tickets for your own events",
        status: 403,
      };
    }
  }

  return { authorized: true };
}

export async function POST(req: NextRequest) {
  try {
    const { ticketId, deviceId, isPromotionalTicket, accessCode, orgId } =
      await req.json();

    if (orgId !== undefined && (typeof orgId !== "string" || orgId === "")) {
      return NextResponse.json(
        { error: "Invalid orgId: must be a non-empty string when provided" },
        { status: 400 }
      );
    }

    if (!ticketId || !deviceId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (typeof isPromotionalTicket !== "boolean") {
      return NextResponse.json(
        { error: "Invalid ticket type parameter" },
        { status: 400 }
      );
    }

    if (
      accessCode &&
      (typeof accessCode !== "string" || !/^[A-Z0-9]{4,8}$/.test(accessCode))
    ) {
      return NextResponse.json(
        { error: "Invalid access code format" },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection not available" },
        { status: 500 }
      );
    }

    let ticket: TicketWithEvent | null = null;
    let ticketError: any = null;

    // Check if it's a promotional ticket or regular ticket
    if (isPromotionalTicket) {
      const { data, error } = await supabaseAdmin
        .from("promotional_tickets")
        .select(
          `
          id,
          status,
          checked_in_at,
          events!inner (
            id,
            organization_id,
            qr_scanner_code
          )
        `
        )
        .eq("id", ticketId)
        .single();

      if (data) {
        const parsed = TicketWithEventSchema.safeParse(data);
        if (!parsed.success) {
          console.error("Invalid ticket data shape:", parsed.error);
          return NextResponse.json(
            { error: "Invalid ticket data received from database" },
            { status: 500 }
          );
        }
        ticket = parsed.data;
      }
      ticketError = error;
    } else {
      const { data, error } = await supabaseAdmin
        .from("tickets")
        .select(
          `
          id,
          status,
          checked_in_at,
          events!inner (
            id,
            organization_id,
            qr_scanner_code
          )
        `
        )
        .eq("id", ticketId)
        .single();

      if (data) {
        const parsed = TicketWithEventSchema.safeParse(data);
        if (!parsed.success) {
          console.error("Invalid ticket data shape:", parsed.error);
          return NextResponse.json(
            { error: "Invalid ticket data received from database" },
            { status: 500 }
          );
        }
        ticket = parsed.data;
      }
      ticketError = error;
    }

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Authentication Logic
    let isAuthorized = false;
    let authError = "Unauthorized";
    let authStatus = 403;

    if (accessCode) {
      const result = await authorizeViaAccessCode(
        accessCode,
        ticket.events.qr_scanner_code
      );
      isAuthorized = result.authorized;
      if (!isAuthorized && result.error) {
        authError = result.error;
        authStatus = result.status || 403;
      }
    } else {
      const result = await authorizeViaUserAuth(ticket);
      isAuthorized = result.authorized;
      if (!isAuthorized && result.error) {
        authError = result.error;
        authStatus = result.status || 403;
      }
    }

    // Enforce authorization
    if (!isAuthorized) {
      return NextResponse.json({ error: authError }, { status: authStatus });
    }

    // When orgId is provided (multi-org context), ensure ticket's event belongs to selected org
    if (orgId && typeof orgId === "string" && ticket.events.organization_id !== orgId) {
      return NextResponse.json(
        { error: "Event does not belong to the selected organization" },
        { status: 403 }
      );
    }

    // Check if ticket is already checked in
    if (ticket.checked_in_at) {
      return NextResponse.json(
        {
          error: "Ticket already checked in",
          checked_in_at: ticket.checked_in_at,
        },
        { status: 400 }
      );
    }

    // Check if ticket is valid for check-in
    if (ticket.status !== "issued") {
      return NextResponse.json(
        {
          error: `Ticket is ${ticket.status}, cannot check in`,
        },
        { status: 400 }
      );
    }

    // Update ticket with check-in information
    const checkedInAt = new Date().toISOString();

    let updatedTicket: any = null;
    let updateError: any = null;

    // Update the appropriate table based on ticket type
    // Use atomic update with WHERE predicates to prevent double check-ins
    if (isPromotionalTicket) {
      const { data, error } = await supabaseAdmin
        .from("promotional_tickets")
        .update({
          checked_in_at: checkedInAt,
          checked_in_device_id: deviceId,
          status: "checked_in",
          // updated_at: checkedInAt, // Column does not exist
        })
        .eq("id", ticketId)
        .eq("status", "issued")
        .is("checked_in_at", null)
        .select()
        .single();

      updatedTicket = data;
      updateError = error;
    } else {
      const { data, error } = await supabaseAdmin
        .from("tickets")
        .update({
          checked_in_at: checkedInAt,
          checked_in_device_id: deviceId,
          status: "checked_in",
          updated_at: checkedInAt,
        })
        .eq("id", ticketId)
        .eq("status", "issued")
        .is("checked_in_at", null)
        .select()
        .single();

      updatedTicket = data;
      updateError = error;
    }

    if (updateError) {
      console.error("Check-in update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update ticket" },
        { status: 500 }
      );
    }

    if (!updatedTicket) {
      return NextResponse.json(
        { error: "Already checked in or invalid status" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ticket checked in successfully",
      checked_in_at: checkedInAt,
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error("Check-in error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
