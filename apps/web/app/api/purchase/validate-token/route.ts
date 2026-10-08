import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { validatePurchaseToken } from "../../../lib/purchase-tokens";
import { supabaseAdmin } from "../../../lib/supabase/server";
import crypto from "crypto";
import {
  captureCheckoutError,
  CheckoutErrorCategory,
  hashUserId,
} from "../../../lib/utils/sentry-checkout";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Purchase token is required" },
        { status: 400 }
      );
    }

    // Get the current user
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          error: "You must be logged in to access this purchase link",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    // Validate the token and get RSVP details
    const rsvpDetails = await validatePurchaseToken(token);

    if (!rsvpDetails) {
      const tokenPrefix = token.substring(0, 8);
      console.log("[PURCHASE-TOKEN] ❌ Invalid or used token:", tokenPrefix + "...");

      // Track in Sentry for monitoring
      captureCheckoutError("Invalid or used purchase token", {
        category: CheckoutErrorCategory.TOKEN_INVALID,
        tokenPrefix,
        userIdHash: userId ? hashUserId(userId) : undefined,
      });

      return NextResponse.json(
        {
          error: "Invalid or used purchase token",
          invalid: true,
        },
        { status: 404 }
      );
    }

    // Get the current user's Supabase record
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      );
    }

    const { data: currentUser } = await supabaseAdmin!
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify the logged-in user matches the RSVP owner
    if (currentUser.id !== rsvpDetails.user_id) {
      console.log(
        "[PURCHASE-TOKEN] ❌ User mismatch - logged in user doesn't own this RSVP"
      );

      // Track user mismatch - potential account sharing or confusion
      captureCheckoutError("Purchase token user mismatch", {
        category: CheckoutErrorCategory.TOKEN_USER_MISMATCH,
        tokenPrefix: token.substring(0, 8),
        userIdHash: hashUserId(userId),
        rsvpId: rsvpDetails.id,
        eventName: rsvpDetails.events?.name,
      });

      return NextResponse.json(
        {
          error:
            "This purchase link belongs to a different user. Please log in with the correct account or contact support.",
          userMismatch: true,
        },
        { status: 403 }
      );
    }

    // Log hashed email for PII compliance (GDPR/CCPA safe - no identifiable info)
    const emailHash = crypto
      .createHash("sha256")
      .update(rsvpDetails.users.email.toLowerCase())
      .digest("hex")
      .substring(0, 8);
    console.log(
      "[PURCHASE-TOKEN] ✅ Valid token for user:",
      emailHash,
      "- Event:",
      rsvpDetails.events.name
    );

    // Return the RSVP details for the purchase page
    // Include stage pricing information for staged tiers
    return NextResponse.json({
      valid: true,
      rsvp: {
        id: rsvpDetails.id,
        event: {
          id: rsvpDetails.events.id,
          name: rsvpDetails.events.name,
          slug: rsvpDetails.events.slug,
          starts_at: rsvpDetails.events.starts_at,
          venue: rsvpDetails.events.venue,
          organization_name: rsvpDetails.events.organizations.name,
          image_url: rsvpDetails.events.image_url,
        },
        ticket_tier: {
          id: rsvpDetails.ticket_tiers.id,
          name: rsvpDetails.ticket_tiers.name,
          price_cents: rsvpDetails.ticket_tiers.price_cents,
        },
        // Include stage pricing if the RSVP was for a staged tier
        stage_id: rsvpDetails.stage_id || null,
        stage_name: rsvpDetails.stage_name || null,
        stage_price_cents: rsvpDetails.stage_price_cents ?? null,
        user: {
          email: rsvpDetails.users.email,
          first_name: rsvpDetails.users.first_name,
          last_name: rsvpDetails.users.last_name,
        },
        requested_quantity: rsvpDetails.requested_quantity,
      },
    });
  } catch (error) {
    console.error("Token validation API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
