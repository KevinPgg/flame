import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const holdSessionId = searchParams.get("session");

    if (!holdSessionId) {
      return NextResponse.json(
        { error: "Hold session ID is required" },
        { status: 400 }
      );
    }

    // Get the user's Supabase ID
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, email, first_name, last_name")
      .eq("clerk_id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch hold details
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
          city,
          image_url,
          timezone,
          currency,
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
      .eq("id", holdSessionId)
      .single();

    if (holdError || !hold) {
      return NextResponse.json({ error: "Hold not found" }, { status: 404 });
    }

    // Verify hold belongs to user
    if (hold.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized access to hold" },
        { status: 403 }
      );
    }

    // Check if hold has expired
    if (new Date(hold.expires_at) < new Date()) {
      return NextResponse.json({ error: "Hold has expired" }, { status: 400 });
    }

    return NextResponse.json({
      mode: "hold",
      event: {
        ...hold.events,
        organization_name: hold.events.organizations.name,
      },
      // Strip secret_code/is_hidden from the joined tier before sending it
      // back as `ticket_tier` — those are server-side fields. We surface the
      // code separately below only when the tier is hidden.
      ticket_tier: {
        id: hold.ticket_tiers.id,
        name: hold.ticket_tiers.name,
        price_cents: hold.ticket_tiers.price_cents,
      },
      quantity: hold.quantity,
      // B7 (brought forward 10-28): the payment screen shows the reservation countdown.
      expires_at: hold.expires_at,
      stage_id: hold.stage_id,
      stage_name: hold.stage_name,
      stage_price_cents: hold.stage_price_cents,
      promoter_code: hold.promoter_code,
      // W4-C3 (Jun 2026): Echo the tier's access code back so the web checkout
      // can render the green "Access Code applied" indicator (parity with promo
      // + promoter). The buyer demonstrated they knew the code by getting this
      // hold created (server validated it in /api/holds/create), so it's safe
      // to return to the same user (endpoint is already gated by user_id ===
      // owner). Only echoed when the tier is hidden — legacy tiers with a code
      // set but is_hidden=false are publicly visible after W4-C3, so there's
      // no access code to "remember".
      // NB: The `holds` table itself has no secret_code column (the create
      // endpoint validates but doesn't persist), so we read from the tier join.
      secret_code: hold.ticket_tiers.is_hidden
        ? hold.ticket_tiers.secret_code
        : null,
      user: {
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    });
  } catch (error) {
    console.error("Hold Details Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
