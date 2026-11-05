import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { validateAndNormalizePromoterCode } from "../../../lib/utils/promoter-code";
import { resolveDbUserFromClerkId } from "../../../lib/auth";

// Validation schema for hold creation
const createHoldSchema = z.object({
  event_id: z.string().uuid(),
  ticket_tier_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  stage_id: z.string().uuid().optional(), // Optional stage_id for staged tiers
  secret_code: z
    .union([
      z.string().trim().min(3, "Secret code must be at least 3 characters"),
      z.literal(""),
    ])
    .optional(), // Optional: if provided, must be at least 3 chars after trimming (empty string treated as undefined)
  promoter_code: z.string().optional(), // Optional promoter code for tracking
  // Fase 3 pruebas (Kevin 2026-10-29): the new screens ask before replacing a reservation.
  // `check_existing` → 409 HOLD_EXISTS when the buyer already holds this tier (any device);
  // `replace_existing` → they confirmed, replace it as before. Old clients send neither and keep
  // the old behavior (the RPC replaces it silently).
  check_existing: z.boolean().optional(),
  replace_existing: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId || !supabaseAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      event_id,
      ticket_tier_id,
      quantity,
      stage_id,
      secret_code,
      promoter_code,
      check_existing,
      replace_existing,
    } = createHoldSchema.parse(body);

    // Get the user's Supabase ID (JIT sync: creates user if missing)
    let supabaseUser: { id: string };
    try {
      supabaseUser = await resolveDbUserFromClerkId(userId);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("[HOLD_CREATE] resolveDbUserFromClerkId failed", {
        userId,
        errorMessage: e.message,
        errorName: e.name,
      });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get event details to verify it doesn't require RSVP
    // Include slug for on-demand revalidation
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select("id, name, slug, requires_rsvp")
      .eq("id", event_id)
      .eq("status", "published")
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Verify event doesn't require RSVP
    // Treat undefined/null as true (requires RSVP) for safety
    const requiresRsvp = event.requires_rsvp ?? true;
    if (requiresRsvp === true) {
      return NextResponse.json(
        { error: "This event requires RSVP approval" },
        { status: 400 }
      );
    }

    // Check if ticket tier exists and belongs to this event
    // Include ticket_stages to validate stage-based availability if stage_id is provided
    // Include secret_code + is_hidden to gate hidden-tier purchases (W4-C3, Jun 2026)
    // Include is_manually_sold_out to reject organizer-closed tiers (Oct 2026)
    const { data: ticketTier, error: tierError } = await supabaseAdmin
      .from("ticket_tiers")
      .select(
        `id, name, price_cents, quantity_total, quantity_sold, per_user_limit, sales_start, sales_end, secret_code, is_hidden, is_manually_sold_out,
         ticket_stages (
           id,
           name,
           price_cents,
           quantity,
           sold_quantity,
           order_index
         )`
      )
      .eq("id", ticket_tier_id)
      .eq("event_id", event_id)
      .single();

    if (tierError || !ticketTier) {
      return NextResponse.json(
        { error: "Ticket tier not found" },
        { status: 404 }
      );
    }

    // Normalize empty string to undefined
    const normalizedSecretCode = secret_code === "" ? undefined : secret_code;

    // Validate secret code if tier is HIDDEN and has a code (W4-C3, Jun 2026).
    // Tiers with a secret_code but is_hidden=false no longer gate purchases —
    // the access-code input on the event page is the only path that uses codes,
    // and it only unlocks hidden tiers.
    if (ticketTier.is_hidden && ticketTier.secret_code) {
      if (!normalizedSecretCode) {
        return NextResponse.json(
          {
            error: "Access code is required for this ticket tier",
            code: "MISSING_SECRET_CODE",
          },
          { status: 403 }
        );
      }
      // Case-insensitive comparison
      if (
        ticketTier.secret_code.trim().toUpperCase() !==
        normalizedSecretCode.trim().toUpperCase()
      ) {
        return NextResponse.json(
          {
            error: "Invalid access code",
            code: "INVALID_SECRET_CODE",
          },
          { status: 403 }
        );
      }
    }

    // Organizer manual sold-out override (Oct 2026). Fast, explicit rejection;
    // atomic_create_hold_with_stage_validation re-checks it under the tier row
    // lock, which is what closes the race with a concurrent toggle. Holds that
    // already exist are intentionally honored until they expire (≤30 min).
    if (ticketTier.is_manually_sold_out) {
      return NextResponse.json(
        { error: "This ticket tier is sold out", code: "SOLD_OUT" },
        { status: 400 }
      );
    }

    // Validate and normalize promoter code if provided
    // Log validation errors but don't fail the hold creation (consistent with completion endpoints)
    // Attribution issues should not block checkout
    const promoterValidation = validateAndNormalizePromoterCode(promoter_code);
    if (!promoterValidation.valid && promoter_code) {
      console.error(
        "[PROMOTER-TRACKING] Invalid promoter code in hold creation:",
        promoter_code,
        "Error:",
        promoterValidation.error
      );
    }
    // Use null for invalid/missing codes (not undefined)
    const normalizedPromoterCode = promoterValidation.valid
      ? promoterValidation.code
      : null;

    // Check if tier is available
    const now = new Date();
    const nowTime = now.getTime();
    const salesStart = ticketTier.sales_start
      ? new Date(ticketTier.sales_start)
      : null;
    const salesEnd = ticketTier.sales_end
      ? new Date(ticketTier.sales_end)
      : null;

    if (salesStart && nowTime < salesStart.getTime()) {
      return NextResponse.json(
        { error: "Ticket sales have not started yet" },
        { status: 400 }
      );
    }

    if (salesEnd && nowTime > salesEnd.getTime()) {
      return NextResponse.json(
        { error: "Ticket sales have ended" },
        { status: 400 }
      );
    }

    // Check per-user limit (null means unlimited — skip the check entirely)
    if (
      ticketTier.per_user_limit !== null &&
      quantity > ticketTier.per_user_limit
    ) {
      return NextResponse.json(
        {
          error: `Maximum ${ticketTier.per_user_limit} ticket${ticketTier.per_user_limit === 1 ? "" : "s"} per user for this tier`,
        },
        { status: 400 }
      );
    }

    // B4 (fase 3.1): the hold RPC deletes this user's other active holds of the same tier (so
    // someone who closed the app mid-checkout isn't locked out). That must not happen to a hold
    // whose payment is already running (marked by /api/holds/start-payment, B3): paying it would
    // then find no hold → charge + automatic refund, no tickets. Abandoned holds are still
    // replaced as before; the mark is cleared after 20 min by cleanup_abandoned_payments.
    const { data: paying, error: payingError } = await supabaseAdmin
      .from("holds")
      .select("id")
      .eq("user_id", supabaseUser.id)
      .eq("tier_id", ticket_tier_id)
      .is("order_id", null)
      .eq("payment_in_progress", true)
      .gt("payment_started_at", new Date(Date.now() - 20 * 60_000).toISOString())
      .limit(1);
    if (payingError) {
      // Don't block buying on a failed lookup: behave as before (the RPC replaces the hold).
      console.error("[HOLD_CREATE] payment-in-progress lookup failed:", payingError);
    } else if (paying && paying.length > 0) {
      return NextResponse.json(
        {
          error: "You already have a payment in progress for this ticket. Wait a few minutes or finish it.",
          code: "PAYMENT_IN_PROGRESS",
        },
        { status: 409 }
      );
    }

    if (check_existing && !replace_existing) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("holds")
        .select("id, quantity, expires_at, stage_name")
        .eq("user_id", supabaseUser.id)
        .eq("tier_id", ticket_tier_id)
        .is("order_id", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (existingError) {
        console.error("[HOLD_CREATE] existing-hold lookup failed:", existingError);
      } else if (existing && existing.length > 0) {
        const h = existing[0];
        const info = { id: h.id, quantity: h.quantity, expires_at: h.expires_at, stage_name: h.stage_name ?? null };
        return NextResponse.json(
          { error: "You already have a reservation for this ticket.", code: "HOLD_EXISTS", hold: info, details: info },
          { status: 409 }
        );
      }
    }

    // Cleanup expired holds BEFORE creating a new one
    // This ensures we have the most accurate availability data
    console.log("[HOLD_CREATE] Cleaning up expired holds before validation");
    const { data: cleanupResult, error: cleanupError } =
      await supabaseAdmin.rpc("cleanup_expired_holds");

    if (cleanupError) {
      console.error(
        "[HOLD_CREATE] Failed to cleanup expired holds:",
        cleanupError
      );
      return NextResponse.json(
        { error: "Failed to validate ticket availability" },
        { status: 500 }
      );
    }

    if (cleanupResult && cleanupResult.length > 0) {
      const { deleted_count, affected_tier_ids } = cleanupResult[0];
      console.log(`[HOLD_CREATE] Cleaned up ${deleted_count} expired holds`);

      // Check if our tier was affected by the cleanup
      if (affected_tier_ids && affected_tier_ids.includes(ticket_tier_id)) {
        console.log(
          `[HOLD_CREATE] Tier ${ticket_tier_id} had expired holds freed up`
        );
      }
    }

    // Log the hold creation attempt
    console.log("[HOLD_CREATE] Attempting to create hold:", {
      user_id: supabaseUser.id,
      event_id,
      tier_id: ticket_tier_id,
      stage_id: stage_id || "no_stage",
      quantity,
      promoter_code: normalizedPromoterCode || "none",
      timestamp: new Date().toISOString(),
    });

    // Use atomic DB function to validate inventory and create hold
    // This prevents race conditions and overbooking by locking stage/tier records
    const rpcParams = {
      p_user_id: supabaseUser.id,
      p_event_id: event_id,
      p_tier_id: ticket_tier_id,
      p_quantity: quantity,
      p_stage_id: stage_id || null,
      p_expires_minutes: 30, // 30 minutes - standard hold duration to prevent inventory lockup
      p_promoter_code: normalizedPromoterCode,
    };

    let { data: result, error: holdError } = await supabaseAdmin.rpc(
      "atomic_create_hold_with_stage_validation",
      rpcParams
    );

    // Deployment safety: If the migration hasn't run yet, the new parameter might cause a signature mismatch.
    // In that case, retry without the promoter code to ensure the purchase flow doesn't break.
    // PostgREST can return various error codes for function signature mismatches:
    // - PGRST202: "Could not find the function ... in the schema cache"
    // - PGRST204: "Could not find a function matching the argument types"
    // - 42883: PostgreSQL undefined_function
    const errorCode = holdError?.code;
    const errorMessage = holdError?.message?.toLowerCase() || "";
    const isSignatureMismatchError =
      holdError &&
      (errorCode === "42883" || // PostgreSQL undefined_function
        errorCode === "PGRST202" || // PostgREST: Function not found in schema cache
        errorCode === "PGRST204" || // PostgREST: Function signature mismatch
        (errorCode?.startsWith("PGRST") &&
          (errorMessage.includes("function") ||
            errorMessage.includes("schema cache"))) ||
        (errorMessage.includes("function") &&
          (errorMessage.includes("does not exist") ||
            errorMessage.includes("could not find") ||
            errorMessage.includes("not found"))));

    if (isSignatureMismatchError) {
      console.warn(
        "[HOLD_CREATE] RPC signature mismatch (likely pending migration), retrying without promoter_code",
        {
          error_code: errorCode,
          error_message: holdError?.message,
        }
      );
      const { p_promoter_code, ...legacyParams } = rpcParams;
      const retryResult = await supabaseAdmin.rpc(
        "atomic_create_hold_with_stage_validation",
        legacyParams
      );
      result = retryResult.data;
      holdError = retryResult.error;

      if (!retryResult.error && retryResult.data?.success) {
        console.log(
          "[HOLD_CREATE] Retry succeeded without promoter_code (tracking skipped during migration)"
        );
      } else if (retryResult.error) {
        console.error("[HOLD_CREATE] Retry also failed:", retryResult.error);
      }
    }

    if (holdError) {
      console.error("[HOLD_CREATE] Database error:", holdError);
      return NextResponse.json(
        { error: "Failed to create reservation" },
        { status: 500 }
      );
    }

    // Check if the function returned an error
    if (!result || !result.success) {
      const errorMessage = result?.error || "Failed to create reservation";

      // Log the failure with details
      console.warn("[HOLD_CREATE] Hold creation failed:", {
        user_id: supabaseUser.id,
        tier_id: ticket_tier_id,
        stage_id: stage_id || "no_stage",
        quantity,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      // Determine error code with prioritized exact matches using word boundaries
      const lowerError = errorMessage.toLowerCase();
      let errorCode = "AVAILABILITY_ERROR"; // Default fallback

      // Check for exact "sold out" phrase first (highest priority)
      if (/\bsold out\b/.test(lowerError)) {
        errorCode = "SOLD_OUT";
      }
      // Then check for availability-related terms (second priority)
      // Use word boundaries to avoid false positives like "not available"
      else if (
        /\b\d+\s+tickets?\s+available\b/.test(lowerError) ||
        /\bonly\b.*\bavailable\b/.test(lowerError)
      ) {
        errorCode = "INSUFFICIENT_QUANTITY";
      }
      // Check if stage not found (might indicate stale data)
      else if (
        /not found/i.test(lowerError) ||
        /no longer available/i.test(lowerError)
      ) {
        errorCode = "STAGE_NOT_AVAILABLE";
      }
      // Otherwise keep the default AVAILABILITY_ERROR

      return NextResponse.json(
        {
          error: errorMessage,
          code: errorCode,
        },
        { status: 400 }
      );
    }

    // Log successful hold creation
    console.log("[HOLD_CREATE] Hold created successfully:", {
      hold_id: result.hold_id,
      user_id: supabaseUser.id,
      tier_id: ticket_tier_id,
      stage_id: stage_id || "no_stage",
      stage_name: result.stage_name || "no_stage",
      quantity,
      promoter_code: result.promoter_code || "none",
      expires_at: result.expires_at,
      available_in_stage: result.available_in_stage,
      timestamp: new Date().toISOString(),
    });

    // Log promoter tracking if code was provided
    if (normalizedPromoterCode && result.promoter_code) {
      console.log("[PROMOTER-TRACKING] Stored in hold:", result.promoter_code);
    }

    // ⚡ ON-DEMAND REVALIDATION: Clear event page cache when hold is created
    // This ensures availability updates immediately for other users
    try {
      if (event?.slug) {
        revalidatePath(`/events/${event.slug}`);
        console.log(
          `[HOLD_CREATE] Revalidated event page: /events/${event.slug}`
        );
      }
    } catch (revalidationError) {
      console.error(
        "[HOLD_CREATE] Warning: Cache revalidation failed:",
        revalidationError
      );
      // Don't fail the hold creation if cache revalidation fails
    }

    // Use stage price if available, otherwise fall back to tier price
    // Use nullish coalescing to handle free tickets (stage_price_cents = 0)
    const actualPrice = result.stage_price_cents ?? ticketTier.price_cents;

    return NextResponse.json({
      hold_session_id: result.hold_id,
      expires_at: result.expires_at,
      ticket_tier: {
        id: ticketTier.id,
        name: ticketTier.name,
        price_cents: actualPrice,
      },
      quantity: quantity,
      stage_name: result.stage_name,
      stage_price_cents: result.stage_price_cents,
      promoter_code: result.promoter_code,
    });
  } catch (error) {
    console.error("Error in POST /api/holds/create:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
