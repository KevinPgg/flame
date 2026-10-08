import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";
import {
  createPurchaseToken,
  generatePurchaseUrl,
} from "../../../lib/purchase-tokens";

import { retrySupabaseOperation } from "../../../lib/utils/supabase-retry";

// Helper function to mask sensitive IDs in logs
function maskId(id: string): string {
  return id.substring(0, 8) + "...";
}

// Helper function to get or create a purchase URL for a user's RSVP
async function getPurchaseUrlForRsvp(userId: string, rsvpId: string) {
  if (!supabaseAdmin) {
    throw new Error("Database connection error");
  }

  // Get the user from Supabase (using centralized helper with retry and JIT sync)
  // This ensures that if the user just signed up but webhook failed, they are synced now
  let supabaseUser;
  try {
    supabaseUser = await resolveDbUserFromClerkId(userId);
  } catch (error) {
    console.error("[PURCHASE-REDIRECT] ❌ Failed to resolve user:", error);
    throw new Error("User not found");
  }

  // Verify the RSVP belongs to this user and is approved
  const { data: rsvp, error: rsvpError } = await retrySupabaseOperation(
    async () =>
      await supabaseAdmin!
        .from("rsvps")
        .select("id, status, user_id")
        .eq("id", rsvpId)
        .eq("user_id", supabaseUser.id)
        .eq("status", "approved")
        .single()
  );

  if (rsvpError || !rsvp) {
    // Debugging logic to find out why it failed
    console.error("[PURCHASE-REDIRECT] ❌ Failed for RSVP:", rsvpId);

    // Check if RSVP exists at all
    const { data: debugRsvp } = await retrySupabaseOperation<{
      user_id: string;
      status: string;
    }>(
      async () =>
        await supabaseAdmin!
          .from("rsvps")
          .select("user_id, status")
          .eq("id", rsvpId)
          .single()
    );

    if (!debugRsvp) {
      console.error(
        `[PURCHASE-REDIRECT] ❌ RSVP ${rsvpId} does not exist in database`
      );
    } else {
      if (debugRsvp.user_id !== supabaseUser.id) {
        console.error(
          `[PURCHASE-REDIRECT] ❌ User mismatch. Logged in: ${supabaseUser.id}, RSVP owner: ${debugRsvp.user_id}`
        );
      }
      if (debugRsvp.status !== "approved") {
        console.error(
          `[PURCHASE-REDIRECT] ❌ RSVP status is '${debugRsvp.status}', expected 'approved'`
        );
      }
    }

    throw new Error("RSVP not found or not approved");
  }

  // Check if there's already a valid (unused) purchase token for this RSVP
  // Note: Expiration check removed - tokens are now valid until RSVP is used/cancelled
  const { data: existingToken } = await retrySupabaseOperation<{
    token: string;
  }>(
    async () =>
      await supabaseAdmin!
        .from("purchase_tokens")
        .select("token")
        .eq("rsvp_id", rsvpId)
        .is("used_at", null)
        .single()
  );

  let token: string;

  if (existingToken) {
    // Use existing valid token
    token = existingToken.token;
    console.log(
      "[PURCHASE-REDIRECT] ✅ Using existing token for RSVP:",
      maskId(rsvpId)
    );
  } else {
    // Create new purchase token
    const newToken = await createPurchaseToken(rsvpId);
    if (!newToken) {
      console.error(
        "[PURCHASE-REDIRECT] ❌ Failed to create token for RSVP:",
        maskId(rsvpId)
      );
      throw new Error("Failed to create purchase token");
    }
    token = newToken;
    console.log(
      "[PURCHASE-REDIRECT] ✅ Created new token for RSVP:",
      maskId(rsvpId)
    );
  }

  // Generate the purchase URL
  return {
    url: generatePurchaseUrl(token),
    token,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rsvpId } = await req.json();

    if (!rsvpId) {
      return NextResponse.json(
        { error: "RSVP ID is required" },
        { status: 400 }
      );
    }

    try {
      const { url, token } = await getPurchaseUrlForRsvp(userId, rsvpId);
      return NextResponse.json({
        purchaseUrl: url,
        token,
      });
    } catch (err: any) {
      // Handle expected errors
      if (err.message === "RSVP not found or not approved") {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      throw err; // Re-throw unexpected errors
    }
  } catch (error) {
    console.error("Purchase redirect API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    const { searchParams } = new URL(req.url);
    const rsvpId = searchParams.get("rsvpId");

    console.log(
      "[PURCHASE-REDIRECT] GET request - RSVP:",
      rsvpId ? rsvpId.substring(0, 8) + "..." : "none",
      "User logged in:",
      !!userId
    );

    if (!rsvpId) {
      console.log("[PURCHASE-REDIRECT] ❌ No rsvpId provided");
      const accountUrl = new URL("/account", req.url);
      accountUrl.searchParams.set("error", "purchase_link_invalid");
      return NextResponse.redirect(accountUrl);
    }

    // If not logged in, redirect to sign-in page
    if (!userId) {
      console.log(
        "[PURCHASE-REDIRECT] 🔄 User not logged in, redirecting to sign-in"
      );
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }

    try {
      const { url } = await getPurchaseUrlForRsvp(userId, rsvpId);
      console.log("[PURCHASE-REDIRECT] ✅ Redirecting to purchase page");
      return NextResponse.redirect(url);
    } catch (err: any) {
      console.error("[PURCHASE-REDIRECT] ❌ Error:", err.message);
      // If error, redirect to account page with error parameter
      const accountUrl = new URL("/account", req.url);
      accountUrl.searchParams.set("error", "purchase_link_failed");
      return NextResponse.redirect(accountUrl);
    }
  } catch (error) {
    console.error("[PURCHASE-REDIRECT] ❌ API error:", error);
    const accountUrl = new URL("/account", req.url);
    accountUrl.searchParams.set("error", "internal_error");
    return NextResponse.redirect(accountUrl);
  }
}
