import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import {
  captureCheckoutError,
  CheckoutErrorCategory,
  hashUserId,
} from "../../../lib/utils/sentry-checkout";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    const searchParams = req.nextUrl.searchParams;
    const holdSessionId = searchParams.get("session");

    console.log(
      "[HOLD-VALIDATE] Request - Session:",
      holdSessionId ? holdSessionId.substring(0, 8) + "..." : "none",
      "User logged in:",
      !!userId
    );

    if (!userId || !supabaseAdmin) {
      console.log("[HOLD-VALIDATE] ❌ Unauthorized - user not logged in");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate holdSessionId: must exist, not be the string "null", and be a valid UUID format
    if (
      !holdSessionId ||
      holdSessionId === "null" ||
      holdSessionId.trim() === ""
    ) {
      console.log(
        "[HOLD-VALIDATE] ❌ No session ID provided or invalid (null string)"
      );

      // Track this - often indicates frontend bug or stale bookmark
      captureCheckoutError("Hold session ID missing or null", {
        category: CheckoutErrorCategory.HOLD_INVALID,
        userIdHash: userId ? hashUserId(userId) : undefined,
        extra: { rawSessionId: holdSessionId },
      });

      return NextResponse.json(
        { error: "Hold session ID is required" },
        { status: 400 }
      );
    }

    // Validate UUID format to prevent PostgreSQL errors
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(holdSessionId)) {
      console.log(
        "[HOLD-VALIDATE] ❌ Invalid session ID format:",
        holdSessionId
      );
      return NextResponse.json(
        { error: "Invalid hold session ID format" },
        { status: 400 }
      );
    }

    // Get the user's Supabase ID
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("id, email, first_name, last_name")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // First check if the hold exists at all (without joins)
    // Try with promoter_code first, fallback if column doesn't exist (rolling deployment safety)
    let holdExistsQuery = await supabaseAdmin
      .from("holds")
      .select("id, expires_at, order_id, event_id, tier_id, promoter_code")
      .eq("id", holdSessionId)
      .eq("user_id", supabaseUser.id)
      .single();

    // Deployment safety: If promoter_code column doesn't exist yet, retry without it
    // Only check for actual column-not-found errors, not "no rows found" (PGRST116)
    // PGRST116 is returned by .single() when 0 rows are found, which is normal for invalid/expired holds
    const errorCode = holdExistsQuery.error?.code;
    const errorMessage = holdExistsQuery.error?.message?.toLowerCase() || "";
    const isColumnNotFoundError =
      holdExistsQuery.error &&
      (errorCode === "42703" || // PostgreSQL undefined_column
        (errorMessage.includes("promoter_code") &&
          (errorMessage.includes("column") ||
            errorMessage.includes("does not exist") ||
            errorMessage.includes("undefined"))));

    if (isColumnNotFoundError) {
      console.warn(
        "[HOLD-VALIDATE] promoter_code column not found (migration pending), retrying without it",
        { error_code: errorCode }
      );
      holdExistsQuery = await supabaseAdmin
        .from("holds")
        .select("id, expires_at, order_id, event_id, tier_id")
        .eq("id", holdSessionId)
        .eq("user_id", supabaseUser.id)
        .single();
    }

    const { data: holdExists } = holdExistsQuery;

    // If hold doesn't exist, it was never created or CASCADE deleted (legacy data)
    if (!holdExists) {
      const userHash = hashUserId(userId);
      console.error(
        "[HOLD-VALIDATE] ❌ Hold not found - Session:",
        holdSessionId.substring(0, 8) + "...",
        "User:",
        userHash
      );

      captureCheckoutError("Hold not found", {
        category: CheckoutErrorCategory.HOLD_INVALID,
        userIdHash: userHash,
        holdId: holdSessionId,
        errorMessage: "Hold not found in database",
        extra: {
          hold_session_prefix: holdSessionId.substring(0, 8),
        },
      });

      return NextResponse.json(
        {
          error:
            "This ticket reservation is no longer available. The event or ticket type may have been removed.",
          expired: true,
        },
        { status: 404 }
      );
    }

    // Check if event or tier was deleted (NULL foreign keys after migration)
    if (!holdExists.event_id || !holdExists.tier_id) {
      const userHash = hashUserId(userId);
      console.error(
        "[HOLD-VALIDATE] ❌ Hold orphaned (event/tier deleted) - Session:",
        holdSessionId.substring(0, 8) + "...",
        "User:",
        userHash,
        "Event ID:",
        holdExists.event_id,
        "Tier ID:",
        holdExists.tier_id
      );

      captureCheckoutError("Hold orphaned - event or tier deleted", {
        category: CheckoutErrorCategory.HOLD_INVALID,
        userIdHash: userHash,
        holdId: holdSessionId,
        errorMessage: "Event or tier was deleted after hold creation",
        extra: {
          hold_session_prefix: holdSessionId.substring(0, 8),
          event_id: holdExists.event_id,
          tier_id: holdExists.tier_id,
        },
      });

      // Clean up orphaned hold
      await supabaseAdmin.from("holds").delete().eq("id", holdSessionId);

      return NextResponse.json(
        {
          error:
            "This ticket reservation is no longer available. The event or ticket type has been removed.",
          expired: true,
        },
        { status: 404 }
      );
    }

    // Now fetch with joins to get full details
    const { data: hold, error: holdError } = await supabaseAdmin
      .from("holds")
      .select(
        `
        *,
        events!inner (
          id,
          slug,
          name,
          starts_at,
          venue,
          city,
          image_url
        ),
        ticket_tiers!holds_tier_id_fkey (
          id,
          name,
          price_cents,
          ticket_stages (
            id,
            name,
            price_cents
          )
        )
      `
      )
      .eq("id", holdSessionId)
      .eq("user_id", supabaseUser.id)
      .single();

    if (holdError || !hold) {
      // This should not happen now, but keep defensive check
      const userHash = hashUserId(userId);
      console.error(
        "[HOLD-VALIDATE] ❌ Hold found but join failed - Session:",
        holdSessionId.substring(0, 8) + "...",
        "User:",
        userHash,
        "Error:",
        holdError?.message || "No hold returned from join query"
      );

      captureCheckoutError("Hold join query failed", {
        category: CheckoutErrorCategory.HOLD_INVALID,
        userIdHash: userHash,
        holdId: holdSessionId,
        errorMessage: holdError?.message || "Join query failed",
        extra: {
          hold_session_prefix: holdSessionId.substring(0, 8),
          event_id: holdExists.event_id,
          tier_id: holdExists.tier_id,
        },
      });

      return NextResponse.json(
        {
          error:
            "Unable to load ticket details. The event or ticket type may have been modified.",
          expired: true,
        },
        { status: 404 }
      );
    }

    // Check if hold has expired
    const now = new Date();
    const nowTime = now.getTime();
    const expiresAt = new Date(hold.expires_at);

    if (expiresAt.getTime() <= nowTime) {
      console.error(
        "[HOLD-VALIDATE] ❌ Hold EXPIRED - Session:",
        holdSessionId,
        "Expired at:",
        expiresAt.toISOString(),
        "Now:",
        now.toISOString()
      );

      // Track expired holds for monitoring
      captureCheckoutError("Hold session expired", {
        category: CheckoutErrorCategory.HOLD_EXPIRED,
        holdId: holdSessionId,
        userIdHash: hashUserId(userId),
        eventName: hold.events?.name,
        extra: {
          expired_at: expiresAt.toISOString(),
          now: now.toISOString(),
        },
      });

      // Delete expired hold
      await supabaseAdmin.from("holds").delete().eq("id", holdSessionId);

      return NextResponse.json(
        { error: "Hold session has expired", expired: true },
        { status: 410 }
      );
    }

    // Check if hold is already used (has order_id)
    if (hold.order_id) {
      console.log(
        "[HOLD-VALIDATE] ❌ Hold already used - Session:",
        holdSessionId,
        "Order:",
        hold.order_id
      );
      return NextResponse.json(
        { error: "Hold session already used", expired: true },
        { status: 410 }
      );
    }

    // Calculate remaining time in seconds
    const remainingSeconds = Math.floor((expiresAt.getTime() - nowTime) / 1000);

    // If this hold is for a stage tier, find the correct stage price
    let actualPrice = hold.ticket_tiers.price_cents;
    let stagePriceCents: number | null = null;
    if (hold.stage_id && hold.ticket_tiers.ticket_stages) {
      const matchingStage = hold.ticket_tiers.ticket_stages.find(
        (stage: any) => stage.id === hold.stage_id
      );
      if (matchingStage) {
        actualPrice = matchingStage.price_cents;
        stagePriceCents = matchingStage.price_cents;
      } else {
        // Stage was deleted after hold creation, use stored stage_price_cents
        // to maintain consistency between actualPrice and stage_price_cents
        if (hold.stage_price_cents != null) {
          actualPrice = hold.stage_price_cents;
          stagePriceCents = hold.stage_price_cents;
        }
      }
    }

    console.log(
      "[HOLD-VALIDATE] ✅ Valid hold - Session:",
      holdSessionId.substring(0, 8) + "...",
      "Event:",
      hold.events.name,
      "Remaining:",
      remainingSeconds,
      "s",
      "Promoter:",
      hold.promoter_code || "none"
    );

    // Log promoter tracking if code exists
    if (hold.promoter_code) {
      console.log("[PROMOTER-TRACKING] Read from hold:", hold.promoter_code);
    }

    return NextResponse.json({
      valid: true,
      hold_id: hold.id,
      expires_at: hold.expires_at,
      remaining_seconds: remainingSeconds,
      event: hold.events,
      ticket_tier: {
        id: hold.ticket_tiers.id,
        name: hold.ticket_tiers.name,
        price_cents: actualPrice,
      },
      quantity: hold.quantity,
      // Include stage pricing explicitly for calculation consistency
      stage_id: hold.stage_id || null,
      stage_name: hold.stage_name || null,
      stage_price_cents: stagePriceCents ?? hold.stage_price_cents ?? null,
      // Include promoter_code from hold record (server-side source of truth)
      promoter_code: hold.promoter_code || null,
      user: {
        email: supabaseUser.email,
        first_name: supabaseUser.first_name,
        last_name: supabaseUser.last_name,
      },
    });
  } catch (error) {
    console.error("[HOLD-VALIDATE] ❌ Internal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
