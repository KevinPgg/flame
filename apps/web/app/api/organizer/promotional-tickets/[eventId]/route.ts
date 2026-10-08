import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";

interface RouteParams {
  params: Promise<{
    eventId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
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

    const { eventId } = await params;

    // Get user from database
    const { data: user } = await supabaseAdmin!
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify organizer has access to this event
    const { data: event, error: eventError } = await supabaseAdmin!
      .from("events")
      .select(
        `
        id,
        organization_id,
        organizations!inner (
          id,
          organization_members!inner (
            user_id
          )
        )
      `
      )
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if user is a member of the organization
    const orgData = event.organizations as any;
    const members = orgData?.organization_members;
    const isMember = Array.isArray(members)
      ? members.some((member: any) => member.user_id === user.id)
      : false;

    if (!isMember) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to view promotional tickets for this event",
        },
        { status: 403 }
      );
    }

    // Get promotional tickets for this event
    const { data: promotionalTickets, error: ticketsError } =
      await supabaseAdmin!
        .from("promotional_tickets")
        .select(
          `
          id,
          email,
          customer_name,
          status,
          created_at,
          checked_in_at,
          qr_token,
          ticket_tiers (
            id,
            name,
            price_cents
          )
        `
        )
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

    if (ticketsError) {
      console.error("Error fetching promotional tickets:", ticketsError);
      return NextResponse.json(
        { error: "Failed to fetch promotional tickets" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      promotional_tickets: promotionalTickets || [],
    });
  } catch (error) {
    console.error("❌ Promotional tickets fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
