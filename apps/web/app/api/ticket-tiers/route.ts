import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabase/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  normalizeTicketTierSecretCode,
  MAX_TICKET_TIERS_PER_EVENT,
} from "@project-flame/lib";
import { createTierSchema, updateTierSchema } from "./schemas";
import { requireEventAccess } from "@/app/lib/utils/event-access";

// Type definitions for nested query results
type TierWithEvent = {
  id: string;
  quantity_total: number;
  quantity_sold: number;
  sales_start: string;
  sales_end: string;
  events: {
    id: string;
    organization_id: string;
    starts_at: string;
    ends_at: string;
  };
};

type TierWithEventForDelete = {
  id: string;
  quantity_sold: number;
  events: {
    id: string;
    organization_id: string;
  };
};

// Zod schemas extracted to ./schemas so they can be unit-tested without
// instantiating the Next.js request pipeline.

// Get ticket tiers for an event
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");

    if (!eventId) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

    // Verify user owns the event
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify the user belongs to the event's organization using nested query
    const { data: eventCheck } = await supabaseAdmin
      .from("events")
      .select("id, organization_id")
      .eq("id", eventId)
      .single();

    if (!eventCheck) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", supabaseUser.id)
      .eq("organization_id", eventCheck.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, supabaseUser.id, eventId, eventCheck.organization_id);
    if (denied) return denied;

    // Fetch ticket tiers
    const { data: tiers, error: tiersError } = await supabaseAdmin
      .from("ticket_tiers")
      .select("*")
      .eq("event_id", eventId)
      .order("order_index", { ascending: true });

    if (tiersError) {
      console.error("Error fetching ticket tiers:", tiersError);
      return NextResponse.json(
        { error: "Failed to fetch ticket tiers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tiers: tiers || [] });
  } catch (error) {
    console.error("Error in GET /api/ticket-tiers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Create new ticket tier
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const validatedData = createTierSchema.parse(body);

    // Verify user owns the event
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // First, get the event and its organization_id
    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, starts_at, ends_at, organization_id")
      .eq("id", validatedData.event_id)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Now verify the user belongs to the event's organization
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", supabaseUser.id)
      .eq("organization_id", event.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, supabaseUser.id, event.id, event.organization_id);
    if (denied) return denied;

    const { count: tierCount, error: tierCountError } = await supabaseAdmin
      .from("ticket_tiers")
      .select("id", { count: "exact", head: true })
      .eq("event_id", validatedData.event_id);

    if (tierCountError) {
      console.error("Error counting ticket tiers:", tierCountError);
      return NextResponse.json(
        { error: "Failed to validate tier limit" },
        { status: 500 }
      );
    }

    if ((tierCount ?? 0) >= MAX_TICKET_TIERS_PER_EVENT) {
      return NextResponse.json(
        {
          error: `Maximum ${MAX_TICKET_TIERS_PER_EVENT} tiers allowed per event`,
        },
        { status: 400 }
      );
    }

    // Validate dates — sales_start defaults to now if not provided
    const effectiveSalesStart = validatedData.sales_start ?? new Date().toISOString();
    const salesStart = new Date(effectiveSalesStart);
    const salesEnd = new Date(validatedData.sales_end);

    if (salesEnd <= salesStart) {
      return NextResponse.json(
        { error: "Sales end date must be after start date" },
        { status: 400 }
      );
    }

    // Validate that tier sales end no later than when the event ends
    if (salesEnd > new Date(event.ends_at)) {
      return NextResponse.json(
        {
          error: "Ticket sales must end before the event ends",
        },
        { status: 400 }
      );
    }

    // Get the next order index
    const { data: existingTiers } = await supabaseAdmin
      .from("ticket_tiers")
      .select("order_index")
      .eq("event_id", validatedData.event_id)
      .order("order_index", { ascending: false })
      .limit(1);

    const nextOrderIndex =
      existingTiers && existingTiers.length > 0
        ? (existingTiers[0].order_index || 0) + 1
        : 0;

    // Extract stages, secret_code, registration_form_fields, W4-C1 toggles, and
    // W4-C2 description from validated data. The RPC `create_ticket_tier_with_stages`
    // doesn't accept any of these as parameters, so we persist them with a single
    // follow-up UPDATE below. (Per-stage descriptions DO flow through the RPC's
    // stages JSON — only the tier-level description needs the post-RPC step.)
    const {
      useStages,
      stages,
      secret_code,
      registration_form_fields,
      is_manually_sold_out,
      is_hidden,
      description,
      ...tierData
    } = validatedData;

    // Use atomic RPC function to create tier and stages in a single transaction
    // This prevents orphaned tiers if stage creation fails
    const { data: result, error: rpcError } = await supabaseAdmin.rpc(
      "create_ticket_tier_with_stages",
      {
        p_event_id: validatedData.event_id,
        p_name: validatedData.name,
        p_price_cents: validatedData.price_cents,
        p_quantity_total: validatedData.quantity_total,
        p_per_user_limit: validatedData.per_user_limit,
        p_sales_start: effectiveSalesStart,
        p_sales_end: validatedData.sales_end,
        p_order_index: nextOrderIndex,
        p_use_stages: useStages || false,
        p_stages: useStages && stages ? stages : null,
        p_fee_percentage: DEFAULT_PLATFORM_FEE_PERCENT,
      }
    );

    if (rpcError) {
      console.error("Error creating ticket tier with stages:", rpcError);

      // Handle validation errors
      if (
        rpcError.code === "23514" ||
        rpcError.code === "P0001" ||
        rpcError.message?.includes("check_violation")
      ) {
        return NextResponse.json(
          {
            error: rpcError.message || "Validation failed",
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create ticket tier" },
        { status: 500 }
      );
    }

    // Set fields the RPC doesn't accept (secret_code, registration_form_fields,
    // is_manually_sold_out, is_hidden, description). Combined into one UPDATE
    // to minimize round-trips.
    if (
      secret_code !== undefined ||
      registration_form_fields !== undefined ||
      is_manually_sold_out !== undefined ||
      is_hidden !== undefined ||
      description !== undefined
    ) {
      const postRpcUpdate: Record<string, unknown> = {};
      if (secret_code !== undefined) {
        postRpcUpdate.secret_code =
          secret_code === null
            ? null
            : normalizeTicketTierSecretCode(secret_code);
      }
      if (registration_form_fields !== undefined) {
        postRpcUpdate.registration_form_fields = registration_form_fields;
      }
      if (is_manually_sold_out !== undefined) {
        postRpcUpdate.is_manually_sold_out = is_manually_sold_out;
      }
      if (is_hidden !== undefined) {
        postRpcUpdate.is_hidden = is_hidden;
      }
      if (description !== undefined) {
        postRpcUpdate.description = description;
      }
      const { error: postRpcError } = await supabaseAdmin
        .from("ticket_tiers")
        .update(postRpcUpdate)
        .eq("id", result.tier_id);
      if (postRpcError) {
        console.error("Error setting post-RPC tier fields:", postRpcError);
        return NextResponse.json(
          { error: "Tier created but additional settings could not be saved. Please edit the tier to retry." },
          { status: 500 },
        );
      }
    }

    // Fetch the created tier to return full data
    const { data: tier, error: fetchError } = await supabaseAdmin
      .from("ticket_tiers")
      .select("*")
      .eq("id", result.tier_id)
      .single();

    if (fetchError || !tier) {
      console.error("Error fetching created tier:", fetchError);
      // Tier was created successfully, but we couldn't fetch it
      // Return success with minimal info
      return NextResponse.json(
        { tier: { id: result.tier_id } },
        { status: 201 }
      );
    }

    // ⚡ INSTANT UPDATE: Revalidate cache after creating ticket tier
    revalidatePath("/organizer");
    revalidatePath("/events");

    return NextResponse.json({ tier }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/ticket-tiers:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Update existing ticket tier
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const validatedData = updateTierSchema.parse(body);

    // Verify user owns the ticket tier through event ownership
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // First, get the tier and its event's organization_id.
    // quantity_reserved is NOT a real column on ticket_tiers — it is a computed
    // value (active holds + pending/approved RSVPs) produced by the
    // get_event_with_tiers RPC. We compute it here via two parallel queries.
    const [tierCheckResult, holdsResult, rsvpResult] = await Promise.all([
      supabaseAdmin
        .from("ticket_tiers")
        .select(
          `
          id,
          quantity_total,
          quantity_sold,
          sales_start,
          sales_end,
          events!inner (
            id,
            organization_id,
            starts_at,
            ends_at
          )
        `
        )
        .eq("id", validatedData.id)
        .single<TierWithEvent>(),
      supabaseAdmin
        .from("holds")
        .select("quantity")
        .eq("tier_id", validatedData.id)
        .gt("expires_at", new Date().toISOString())
        .is("order_id", null),
      supabaseAdmin
        .from("rsvps")
        .select("requested_quantity")
        .eq("ticket_tier_id", validatedData.id)
        .in("status", ["pending", "approved"]),
    ]);

    if (tierCheckResult.error || !tierCheckResult.data) {
      if (tierCheckResult.error?.code === "PGRST116") {
        return NextResponse.json(
          { error: "Ticket tier not found" },
          { status: 404 }
        );
      }
      console.error("Error fetching tier for update:", tierCheckResult.error, {
        tierId: validatedData.id,
        userId,
      });
      return NextResponse.json(
        { error: "Failed to fetch ticket tier" },
        { status: 500 }
      );
    }
    if (holdsResult.error) {
      console.error("Error fetching holds for reserved check:", holdsResult.error, {
        tierId: validatedData.id,
        userId,
      });
      return NextResponse.json(
        { error: "Failed to validate tier capacity" },
        { status: 500 }
      );
    }
    if (rsvpResult.error) {
      console.error("Error fetching RSVPs for reserved check:", rsvpResult.error, {
        tierId: validatedData.id,
        userId,
      });
      return NextResponse.json(
        { error: "Failed to validate tier capacity" },
        { status: 500 }
      );
    }

    const tierCheck = tierCheckResult.data;
    const holdsRows = holdsResult.data;
    const rsvpRows = rsvpResult.data;

    // Now verify the user belongs to the event's organization
    const eventOrgId = tierCheck.events.organization_id;
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", supabaseUser.id)
      .eq("organization_id", eventOrgId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, supabaseUser.id, tierCheck.events.id, eventOrgId);
    if (denied) return denied;

    // CRITICAL: Prevent reducing quantity below sold + pending (reserved) amount.
    // Sold is enforced at the DB level by CHECK constraint `quantity_total_gte_quantity_sold`;
    // Pending (quantity_reserved) is not enforced by that constraint, but if we allowed
    // quantity_total to be reduced below sold+reserved, then when those pending RSVPs approve
    // and convert reserved -> sold they would fail the DB constraint — so we block here
    // as an early UX + correctness guard. Mirrors the mobile EditTiersTab client-side check.
    const quantityReserved =
      (holdsRows?.reduce((s, h) => s + (h.quantity || 0), 0) ?? 0) +
      (rsvpRows?.reduce((s, r) => s + (r.requested_quantity || 0), 0) ?? 0);
    const minAllowedQty = tierCheck.quantity_sold + quantityReserved;
    if (
      validatedData.quantity_total !== undefined &&
      minAllowedQty > 0 &&
      validatedData.quantity_total < minAllowedQty
    ) {
      const parts: string[] = [];
      if (tierCheck.quantity_sold > 0) {
        parts.push(
          `${tierCheck.quantity_sold} ticket${tierCheck.quantity_sold !== 1 ? "s" : ""} sold`
        );
      }
      if (quantityReserved > 0) {
        parts.push(
          `${quantityReserved} Pending RSVP${quantityReserved !== 1 ? "s" : ""}`
        );
      }
      return NextResponse.json(
        {
          error: `Cannot reduce tier quantity to ${validatedData.quantity_total}. ${parts.join(" and ")} — minimum is ${minAllowedQty}.`,
          // W4-C1 (May 2026): structured error code so the organizer UI can
          // surface a force-reduce confirmation modal that bulk-cancels holds
          // and rejects pending RSVPs in one operation.
          code: "QUANTITY_BELOW_RESERVED",
          details: {
            tier_id: validatedData.id,
            requested_quantity: validatedData.quantity_total,
            quantity_sold: tierCheck.quantity_sold,
            quantity_reserved: quantityReserved,
            min_allowed_quantity: minAllowedQty,
          },
        },
        { status: 400 }
      );
    }

    // Validate dates if either is provided
    if (validatedData.sales_start || validatedData.sales_end) {
      const salesStart = new Date(
        validatedData.sales_start || tierCheck.sales_start
      );
      const salesEnd = new Date(validatedData.sales_end || tierCheck.sales_end);
      const eventEnd = new Date(tierCheck.events.ends_at);

      if (salesEnd <= salesStart) {
        return NextResponse.json(
          { error: "Sales end date must be after start date" },
          { status: 400 }
        );
      }

      // Validate that tier sales end no later than when the event ends
      if (salesEnd > eventEnd) {
        return NextResponse.json(
          {
            error: "Ticket sales must end before the event ends",
          },
          { status: 400 }
        );
      }
    }

    // Update the ticket tier
    // Remove tentative_event_start, useStages, and stages as they're handled separately
    let {
      tentative_event_start: _tentativeEventStart,
      id,
      useStages,
      stages,
      ...updateData
    } = validatedData;
    if (updateData.secret_code !== undefined) {
      updateData = {
        ...updateData,
        secret_code:
          updateData.secret_code === null
            ? null
            : normalizeTicketTierSecretCode(updateData.secret_code),
      };
    }

    // Build the update query with optimistic concurrency control
    let updateQuery = supabaseAdmin
      .from("ticket_tiers")
      .update({
        ...Object.fromEntries(
          Object.entries(updateData).filter(([_, value]) => value !== undefined)
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", validatedData.id);

    // If updating quantity_total, add optimistic lock to ensure it's >= current sold quantity
    if (validatedData.quantity_total !== undefined) {
      updateQuery = updateQuery.lte(
        "quantity_sold",
        validatedData.quantity_total
      );
    }

    const { data: tier, error: tierError } = await updateQuery
      .select()
      .single();

    if (tierError) {
      console.error("Error updating ticket tier:", tierError);

      // Handle database constraint violation (race condition)
      if (tierError.message?.includes("quantity_total_gte_quantity_sold")) {
        return NextResponse.json(
          {
            error:
              "Cannot update ticket tier: more tickets were sold during the update. Please refresh and try again with the updated sold quantity.",
          },
          { status: 409 } // 409 Conflict
        );
      }

      // Handle optimistic lock failure - when .single() finds 0 rows due to .lte() condition
      // Supabase returns error code 'PGRST116' when single() expects 1 row but finds 0
      if (
        tierError.code === "PGRST116" &&
        validatedData.quantity_total !== undefined
      ) {
        return NextResponse.json(
          {
            error: `Cannot update ticket tier: tickets were sold during the update, and the new quantity (${validatedData.quantity_total}) is now below the sold quantity. Please refresh and try again.`,
          },
          { status: 409 } // 409 Conflict - concurrent modification
        );
      }

      return NextResponse.json(
        { error: "Failed to update ticket tier", details: tierError.message },
        { status: 500 }
      );
    }

    // Handle ticket stages if provided
    // All stage operations are performed atomically in a database transaction via RPC
    if (stages) {
      const { data, error: rpcError } = await supabaseAdmin.rpc(
        "update_ticket_stages",
        {
          p_ticket_tier_id: validatedData.id,
          p_stages: stages,
        }
      );

      if (rpcError) {
        console.error("Error updating ticket stages:", rpcError);

        // Handle validation and constraint errors
        // Includes check violations (23514), raised exceptions (P0001), and quantity validations
        if (
          rpcError.code === "23514" ||
          rpcError.code === "P0001" ||
          rpcError.message?.includes("check_violation") ||
          rpcError.message?.includes("quantity")
        ) {
          return NextResponse.json(
            {
              error:
                rpcError.message || "Cannot update stages: validation failed",
            },
            { status: 400 }
          );
        }

        // Generic error
        return NextResponse.json(
          {
            error: "Failed to update ticket stages",
            details: rpcError.message,
          },
          { status: 500 }
        );
      }

      // CRITICAL FIX: Refetch the tier after RPC to get the synced quantity_total
      // The RPC may have updated quantity_total to match the sum of stage quantities
      const { data: updatedTier, error: refetchError } = await supabaseAdmin
        .from("ticket_tiers")
        .select("*")
        .eq("id", validatedData.id)
        .single();

      if (refetchError || !updatedTier) {
        console.error(
          "Error refetching tier after stage update:",
          refetchError
        );
        // Return the pre-RPC tier as fallback (better than failing completely)
        return NextResponse.json({ tier });
      }

      // Return the refetched tier with synced quantity_total
      revalidatePath("/organizer");
      revalidatePath("/events");
      return NextResponse.json({ tier: updatedTier });
    }

    // ⚡ INSTANT UPDATE: Revalidate cache after updating ticket tier
    revalidatePath("/organizer");
    revalidatePath("/events");

    return NextResponse.json({ tier });
  } catch (error) {
    console.error("Error in PATCH /api/ticket-tiers:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Delete ticket tier
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const tierId = searchParams.get("id");

    if (!tierId) {
      return NextResponse.json(
        { error: "Ticket tier ID is required" },
        { status: 400 }
      );
    }

    // Verify user owns the ticket tier
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // First, get the tier and its event's organization_id
    const { data: tierCheck } = await supabaseAdmin
      .from("ticket_tiers")
      .select(
        `
        id,
        quantity_sold,
        events!inner (
          id,
          organization_id
        )
      `
      )
      .eq("id", tierId)
      .single<TierWithEventForDelete>();

    if (!tierCheck) {
      return NextResponse.json(
        { error: "Ticket tier not found" },
        { status: 404 }
      );
    }

    // Now verify the user belongs to the event's organization
    const eventOrgId = tierCheck.events.organization_id;
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", supabaseUser.id)
      .eq("organization_id", eventOrgId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, supabaseUser.id, tierCheck.events.id, eventOrgId);
    if (denied) return denied;

    // Prevent deletion if tickets have been sold
    if (tierCheck.quantity_sold && tierCheck.quantity_sold > 0) {
      return NextResponse.json(
        { error: "Cannot delete ticket tier with sold tickets" },
        { status: 400 }
      );
    }

    // Check if any stages exist and validate they have no sold tickets
    // Stages must be deleted explicitly before tier deletion
    const { data: stages, error: stagesError } = await supabaseAdmin
      .from("ticket_stages")
      .select("id, sold_quantity")
      .eq("ticket_tier_id", tierId);

    if (stagesError) {
      console.error("Error checking ticket stages:", stagesError);
      return NextResponse.json(
        { error: "Failed to validate tier deletability" },
        { status: 500 }
      );
    }

    // Check if any stage has sold tickets
    if (stages && stages.some(stage => stage.sold_quantity > 0)) {
      return NextResponse.json(
        {
          error: "Cannot delete ticket tier with sold tickets in stages.",
        },
        { status: 400 }
      );
    }

    // Delete all stages for this tier (if any)
    if (stages && stages.length > 0) {
      const { error: deleteStagesError } = await supabaseAdmin
        .from("ticket_stages")
        .delete()
        .eq("ticket_tier_id", tierId);

      if (deleteStagesError) {
        console.error("Error deleting ticket stages:", deleteStagesError);
        return NextResponse.json(
          { error: "Failed to delete ticket stages" },
          { status: 500 }
        );
      }
    }

    // Check if this is the last tier for the event
    const { data: allTiers } = await supabaseAdmin
      .from("ticket_tiers")
      .select("id")
      .eq("event_id", tierCheck.events.id);

    if (allTiers && allTiers.length <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last ticket tier for an event" },
        { status: 400 }
      );
    }

    // Delete the ticket tier
    const { error: deleteError } = await supabaseAdmin
      .from("ticket_tiers")
      .delete()
      .eq("id", tierId);

    if (deleteError) {
      console.error("Error deleting ticket tier:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete ticket tier" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/ticket-tiers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
