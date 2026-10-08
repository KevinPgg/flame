import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/server";
import { retrySupabaseOperation } from "../../../../lib/utils/supabase-retry";

/**
 * Type definition for cleanup_expired_holds RPC return value
 */
interface CleanupResult {
  deleted_count: number;
  affected_tier_ids: string[];
}

/**
 * Type definition for get_tier_stage_availability RPC return value
 */
interface StageAvailability {
  stage_id: string;
  stage_name: string;
  price_cents: number;
  quantity: number;
  sold_quantity: number;
  held_quantity: number;
  available_quantity: number;
  is_current_stage: boolean;
  order_index: number;
}

/**
 * GET /api/ticket-tiers/[tierId]/availability
 *
 * Returns real-time availability for all stages in a ticket tier
 * including sold tickets, active holds, and available quantity.
 *
 * This endpoint should be called when:
 * - User views event page (to show current availability)
 * - Periodically to refresh availability (every 10 seconds)
 * - Before creating a hold (to validate stage selection)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tierId: string }> }
) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      );
    }

    const { tierId } = await params;

    if (!tierId) {
      return NextResponse.json(
        { error: "Tier ID is required" },
        { status: 400 }
      );
    }

    // First, cleanup any expired holds to ensure data is fresh
    // This ensures availability calculations use current data, not stale holds
    const { data: cleanupResult, error: cleanupError } =
      await retrySupabaseOperation<CleanupResult | CleanupResult[]>(
        async () => await supabaseAdmin!.rpc("cleanup_expired_holds")
      );

    if (cleanupError) {
      console.error(
        "[AVAILABILITY] Failed to cleanup expired holds:",
        cleanupError
      );
      // Log but don't fail - we can still return availability data
      // The data may be slightly stale but better than returning an error
      // This is a non-critical operation for read-only availability checks
    } else if (cleanupResult) {
      // Handle both array and single object return types
      const result = Array.isArray(cleanupResult)
        ? cleanupResult[0]
        : cleanupResult;

      if (result && result.deleted_count > 0) {
        console.log(
          `[AVAILABILITY] Cleaned up ${result.deleted_count} expired holds`
        );

        // Check if this tier was affected
        if (result.affected_tier_ids.includes(tierId)) {
          console.log(
            `[AVAILABILITY] Tier ${tierId} had expired holds freed up`
          );
        }
      }
    }

    // Get real-time stage availability using the database function
    const { data: stageAvailability, error: availabilityError } =
      await retrySupabaseOperation<StageAvailability[]>(
        async () =>
          await supabaseAdmin!.rpc("get_tier_stage_availability", {
            p_tier_id: tierId,
          })
      );

    if (availabilityError) {
      console.error("Error fetching stage availability:", availabilityError);
      return NextResponse.json(
        { error: "Failed to fetch stage availability" },
        { status: 500 }
      );
    }

    // Also get the tier details
    const { data: tier, error: tierError } = await retrySupabaseOperation<{
      id: string;
      name: string;
      price_cents: number;
      quantity_total: number;
      quantity_sold: number;
      per_user_limit: number | null;
      sales_start: string | null;
      sales_end: string | null;
    }>(
      async () =>
        await supabaseAdmin!
          .from("ticket_tiers")
          .select(
            `
        id,
        name,
        price_cents,
        quantity_total,
        quantity_sold,
        per_user_limit,
        sales_start,
        sales_end
      `
          )
          .eq("id", tierId)
          .single()
    );

    if (tierError || !tier) {
      return NextResponse.json({ error: "Tier not found" }, { status: 404 });
    }

    // Determine if tier has stages
    const hasStages = stageAvailability && stageAvailability.length > 0;

    let totalHeldAtTierLevel: number;
    let totalAvailableAtTierLevel: number;

    if (hasStages) {
      // For tiers WITH stages: Calculate from stage data to ensure consistency
      // This matches the database function which only counts holds with stage_id IS NOT NULL
      // This ensures tier.available matches sum(stages.available_quantity) exactly
      totalHeldAtTierLevel = stageAvailability.reduce(
        (sum: number, stage: any) => sum + (stage.held_quantity || 0),
        0
      );

      totalAvailableAtTierLevel = stageAvailability.reduce(
        (sum: number, stage: any) => sum + (stage.available_quantity || 0),
        0
      );
    } else {
      // For tiers WITHOUT stages: Count all holds (with or without stage_id)
      // This is the standard tier-level calculation
      const { data: allHolds, error: holdsError } =
        await retrySupabaseOperation(
          async () =>
            await supabaseAdmin!
              .from("holds")
              .select("quantity")
              .eq("tier_id", tierId)
              .gt("expires_at", new Date().toISOString())
              .is("order_id", null)
        );

      if (holdsError) {
        console.error("Error fetching tier holds:", holdsError);
        return NextResponse.json(
          { error: "Failed to fetch tier availability" },
          { status: 500 }
        );
      }

      totalHeldAtTierLevel =
        allHolds?.reduce(
          (sum: number, h: { quantity: number }) => sum + (h.quantity || 0),
          0
        ) || 0;

      // Also subtract pending/approved RSVPs — they reserve capacity via
      // create_rsvp_atomic but don't bump quantity_sold until approval issues
      // the ticket. Without this the endpoint over-reports availability for
      // RSVP events and the public UI keeps showing "available" when the
      // tier is effectively sold out. Matches get_event_with_tiers RPC
      // semantics. Staged tiers remain unchanged (deferred to W4-C1).
      const { data: rsvpRows, error: rsvpError } = await retrySupabaseOperation(
        async () =>
          await supabaseAdmin!
            .from("rsvps")
            .select("requested_quantity")
            .eq("ticket_tier_id", tierId)
            .in("status", ["pending", "approved"])
      );

      if (rsvpError) {
        console.error("Error fetching tier RSVPs:", rsvpError);
        return NextResponse.json(
          { error: "Failed to fetch tier availability" },
          { status: 500 }
        );
      }

      const totalReservedByRsvps =
        rsvpRows?.reduce(
          (sum: number, r: { requested_quantity: number | null }) =>
            sum + (r.requested_quantity || 0),
          0
        ) || 0;

      totalAvailableAtTierLevel = Math.max(
        0,
        tier.quantity_total -
          tier.quantity_sold -
          totalHeldAtTierLevel -
          totalReservedByRsvps
      );
    }

    // Find the current active stage
    const currentStage = stageAvailability?.find(
      (stage: any) => stage.is_current_stage
    );

    return NextResponse.json({
      tier: {
        ...tier,
        // Use calculated availability from stages to ensure consistency
        // This matches the sum of stage availabilities exactly
        available: totalAvailableAtTierLevel,
        held: totalHeldAtTierLevel,
      },
      stages: stageAvailability || [],
      currentStage: currentStage || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in availability endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
