import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { canManageEventRsvps } from "../../../lib/utils/event-rsvp-authz";
import { selectAllPages } from "../../../lib/utils/supabase-pagination";

/**
 * GET /api/organizer/rsvps?event_id={eventId}
 * Fetch RSVPs for a specific event
 * Used for real-time updates
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId || !supabaseAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get event_id from query params
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("event_id");

    if (!eventId) {
      return NextResponse.json(
        { error: "event_id is required" },
        { status: 400 }
      );
    }

    // Get the user's organization
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // First, get the event to know which organization it belongs to and get registration_form_config
    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, organization_id, registration_form_config")
      .eq("id", eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Authorize: primary-org member, OR cohost org owner/admin (W3-B1)
    const authorized = await canManageEventRsvps(
      supabaseAdmin,
      supabaseUser.id,
      event.organization_id,
      event.id,
    );

    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized - not a member of this event's organization" },
        { status: 403 }
      );
    }

    // Fetch RSVPs for this event with all necessary joins. Paged: PostgREST cuts
    // every response at 1000 rows, so a popular event used to lose requests silently.
    let rsvps: any[] | null = null;
    let rsvpsError: unknown = null;
    try {
      rsvps = await selectAllPages<any>((from, to) =>
        supabaseAdmin!
          .from("rsvps")
          .select(
        `
        id,
        user_id,
        event_id,
        ticket_tier_id,
        requested_quantity,
        status,
        requested_at,
        approved_at,
        approved_by,
        rejected_at,
        rejected_by,
        stage_id,
        stage_name,
        stage_price_cents,
        base_price_cents,
        fee_percentage,
        registration_data,
        users!rsvps_user_id_fkey (
          first_name,
          last_name,
          email,
          document_id,
          date_of_birth
        ),
        ticket_tiers (
          name,
          price_cents
        )
      `
      )
          .eq("event_id", eventId)
          .order("requested_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
      );
    } catch (error) {
      rsvpsError = error;
    }

    if (rsvpsError) {
      console.error("Error fetching RSVPs:", rsvpsError);
      return NextResponse.json(
        { error: "Failed to fetch RSVPs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      rsvps: rsvps || [],
      count: rsvps?.length || 0,
      registration_form_config: event.registration_form_config || null,
    });
  } catch (error) {
    console.error("Error in GET /api/organizer/rsvps:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
