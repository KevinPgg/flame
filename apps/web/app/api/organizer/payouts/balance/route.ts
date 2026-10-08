import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { stripe } from "@/app/lib/stripe/stripe";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!supabaseAdmin) {
      console.error("Supabase admin client not initialized");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID required" },
        { status: 400 }
      );
    }

    // Verify membership
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userError || !user) {
      if (userError) console.error("Database error fetching user:", userError);
      return NextResponse.json(
        { error: userError ? "Database error" : "User not found" },
        { status: userError ? 500 : 404 }
      );
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (membershipError || !membership) {
      // Check if error is "no rows found" (PGRST116) which means unauthorized
      if (membershipError && membershipError.code !== "PGRST116") {
        console.error("Database error fetching membership:", membershipError);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Only allow admin or owner roles to view balance
    const allowedRoles = ["admin", "owner"];
    if (!allowedRoles.includes(membership.role?.toLowerCase())) {
      return NextResponse.json(
        { error: "Insufficient permissions. Admin or owner role required." },
        { status: 403 }
      );
    }

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("stripe_account_id")
      .eq("id", organizationId)
      .single();

    if (orgError) {
      console.error("Database error fetching organization:", orgError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!org || !org.stripe_account_id) {
      return NextResponse.json(
        { error: "Organization not connected to Stripe" },
        { status: 400 }
      );
    }

    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: org.stripe_account_id }
    );

    return NextResponse.json({ balance });
  } catch (error) {
    console.error("Balance Fetch Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
