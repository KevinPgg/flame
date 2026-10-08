import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "You must be logged in to view order details" },
        { status: 401 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      );
    }

    const { id: orderId } = await params;

    // Get the current user's Supabase record
    const { data: currentUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build the query
    let query = supabaseAdmin
      .from("orders")
      .select(
        `
        *,
        event:events(
          id,
          name,
          slug,
          starts_at,
          ends_at,
          venue,
          city,
          image_url,
          organization:organizations(name)
        ),
        ticket_tier:ticket_tiers(
          id,
          name,
          price_cents
        ),
        promotional_code:promotional_codes(
          id,
          code,
          discount_percentage
        ),
        tickets(
          id,
          attendee_name,
          attendee_email,
          qr_code,
          qr_token,
          status,
          checked_in_at,
          created_at
        )
      `
      )
      .eq("user_id", currentUser.id);

    // Check if looking up by Stripe Payment Intent ID or internal Order ID
    if (orderId.startsWith("pi_")) {
      query = query.eq("stripe_payment_intent_id", orderId);
    } else {
      query = query.eq("id", orderId);
    }

    const { data: order, error: orderError } = await query.single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json(
      { error: "Failed to fetch order details" },
      { status: 500 }
    );
  }
}
