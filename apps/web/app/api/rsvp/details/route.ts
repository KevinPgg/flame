import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      console.error("Supabase admin client not initialized");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const rsvpId = searchParams.get("token"); // Legacy: param named 'token' but is actually the RSVP ID

    if (!rsvpId) {
      return NextResponse.json(
        { error: "RSVP ID is required" },
        { status: 400 }
      );
    }

    // Get the user's Supabase ID
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, email, first_name, last_name")
      .eq("clerk_id", userId)
      .single();

    if (userError) {
      console.error("Failed to fetch user in rsvp/details:", userError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch RSVP details
    const { data: rsvp, error: rsvpError } = await supabaseAdmin
      .from("rsvps")
      .select(
        `
        *,
        events!inner (
          id,
          name,
          slug,
          starts_at,
          venue,
          city,
          image_url,
          organizations!inner (
            name
          )
        ),
        ticket_tiers!inner (
          id,
          name,
          price_cents,
          is_hidden,
          secret_code
        )
      `
      )
      .eq("id", rsvpId)
      .single();

    if (rsvpError) {
      // PGRST116 is PostgREST's "no rows found" error code
      // This should be treated as 404, not 500
      if (rsvpError.code === "PGRST116") {
        return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
      }
      
      // All other errors are server errors
      console.error("Error fetching RSVP:", rsvpError);
      return NextResponse.json(
        { error: "Error fetching RSVP" },
        { status: 500 }
      );
    }

    if (!rsvp) {
      return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
    }

    // Verify RSVP belongs to user
    if (rsvp.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized access to RSVP" },
        { status: 403 }
      );
    }

    // Check RSVP status
    if (rsvp.status !== "pending") {
      return NextResponse.json(
        { error: "RSVP is not in pending status" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      mode: "rsvp",
      event: {
        ...rsvp.events,
        organization_name: rsvp.events.organizations.name,
      },
      // Strip secret_code/is_hidden from the joined tier — server-only fields.
      ticket_tier: {
        id: rsvp.ticket_tiers.id,
        name: rsvp.ticket_tiers.name,
        price_cents: rsvp.ticket_tiers.price_cents,
      },
      quantity: rsvp.requested_quantity,
      stage_id: rsvp.stage_id,
      stage_name: rsvp.stage_name,
      stage_price_cents: rsvp.stage_price_cents,
      promoter_code: rsvp.promoter_code,
      // W4-C3 (Jun 2026): echo the tier's access code so the web RSVP
      // checkout can render the green "applied" indicator. Only echoed when
      // the tier is hidden — the `rsvps` table has no secret_code column, so
      // we read from the tier join. The buyer demonstrated they knew the
      // code by getting this RSVP created (server validated in /api/rsvp).
      secret_code: rsvp.ticket_tiers.is_hidden
        ? rsvp.ticket_tiers.secret_code
        : null,
      user: {
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    });
  } catch (error) {
    console.error("RSVP Details Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
