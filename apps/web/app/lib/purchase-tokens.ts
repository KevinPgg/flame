import { supabaseAdmin } from "./supabase/server";
import { getBaseUrl } from "./utils/url";
import { TicketTierWithStage } from "./types/event";
import crypto from "crypto";

/**
 * Determines the current price for a ticket tier based on staged pricing
 * Returns the stage information and current price
 */
export function getCurrentStagePrice(ticketTier: {
  id: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  ticket_stages?: {
    id: string;
    name: string;
    price_cents: number;
    quantity: number;
    sold_quantity: number;
    order_index: number;
  }[];
}): { stage: any; currentPrice: number; remainingInStage: number } | null {
  if (!ticketTier.ticket_stages || ticketTier.ticket_stages.length === 0) {
    // No stages, use base price
    return {
      stage: null,
      currentPrice: ticketTier.price_cents || 0,
      remainingInStage: ticketTier.quantity_total - ticketTier.quantity_sold,
    };
  }

  // Sort stages by order_index
  const sortedStages = [...ticketTier.ticket_stages].sort(
    (a, b) => a.order_index - b.order_index
  );

  // Iterate through stages to find the first one with available inventory
  // This handles "holes" in earlier stages (e.g. due to expired holds)
  // by allowing them to be filled even if sales have moved to later stages
  for (const stage of sortedStages) {
    const soldQuantity = stage.sold_quantity || 0;
    const capacity = stage.quantity;

    if (soldQuantity < capacity) {
      return {
        stage,
        currentPrice: stage.price_cents,
        remainingInStage: capacity - soldQuantity,
      };
    }
  }

  // All stages sold out, use last stage price
  const lastStage = sortedStages[sortedStages.length - 1];
  return {
    stage: lastStage,
    currentPrice: lastStage.price_cents,
    remainingInStage: 0,
  };
}

export interface PurchaseToken {
  id: string;
  rsvp_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RsvpWithDetails {
  id: string;
  user_id: string;
  event_id: string;
  ticket_tier_id: string;
  requested_quantity: number;
  status: string;
  stage_id: string | null;
  stage_name: string | null;
  stage_price_cents: number | null;
  promoter_code: string | null;
  users: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  events: {
    id: string;
    name: string;
    slug: string;
    starts_at: string;
    venue: string;
    organization_id: string;
    image_url: string | null;
    currency: string;
    organizations: {
      name: string;
    };
  };
  ticket_tiers: TicketTierWithStage & {
    remaining_in_stage?: number | null;
    ticket_stages?: {
      id: string;
      name: string;
      price_cents: number;
      quantity: number;
      sold_quantity: number;
      order_index: number;
    }[];
  };
}

/**
 * Creates a secure purchase token for an approved RSVP.
 * Tokens do not expire - security is enforced by user authentication + RSVP ownership.
 */
export async function createPurchaseToken(
  rsvpId: string
): Promise<string | null> {
  try {
    if (!supabaseAdmin) {
      console.error("Database connection error");
      return null;
    }

    // Tokens no longer expire - they're valid until the RSVP is used/cancelled
    // Security is enforced by: user must be logged in + must own the RSVP
    //
    // Note: We keep expires_at column with a far-future value (100 years) because:
    // 1. The column has NOT NULL constraint - making it nullable requires migration
    // 2. Removing column entirely would break existing queries and require code audit
    // 3. The column serves as documentation that tokens WERE time-limited historically
    // 4. Future: could be repurposed if we need event-based expiry (e.g., expire after event date)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 100);

    // Generate a cryptographically secure token
    const token = crypto.randomUUID();

    const { data, error } = await supabaseAdmin
      .from("purchase_tokens")
      .insert({
        rsvp_id: rsvpId,
        token: token,
        expires_at: expiresAt.toISOString(),
      })
      .select("token")
      .single();

    if (error) {
      console.error("Error creating purchase token:", error);
      return null;
    }

    return data.token;
  } catch (error) {
    console.error("Error creating purchase token:", error);
    return null;
  }
}

/**
 * Validates a purchase token and returns the associated RSVP details
 */
export async function validatePurchaseToken(
  token: string
): Promise<RsvpWithDetails | null> {
  try {
    if (!supabaseAdmin) {
      console.error("Database connection error");
      return null;
    }

    // Verify the token exists
    // Note: Expiration check removed - tokens are now valid until RSVP is used/cancelled
    // Security is enforced by user authentication + RSVP ownership verification
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("purchase_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      console.log(
        "[PURCHASE-TOKEN] ❌ Token not found:",
        token.substring(0, 8) + "..."
      );
      return null;
    }

    // Check if token has been used
    if (tokenData.used_at) {
      console.log(
        "[PURCHASE-TOKEN] ❌ Token already used:",
        token.substring(0, 8) + "...",
        "Used at:",
        tokenData.used_at
      );
      return null;
    }

    // Get the RSVP with all related details
    const { data: rsvp, error: rsvpError } = await supabaseAdmin
      .from("rsvps")
      .select(
        `
        *,
        users!rsvps_user_id_fkey (
          id,
          email,
          first_name,
          last_name
        ),
        events!inner (
          id,
          name,
          slug,
          starts_at,
          venue,
          organization_id,
          image_url,
          currency,
          organizations!inner (
            name
          )
        ),
        ticket_tiers!inner (
          id,
          name,
          price_cents,
          quantity_total,
          quantity_sold,
          ticket_stages (
            id,
            name,
            price_cents,
            quantity,
            sold_quantity,
            order_index
          )
        )
      `
      )
      .eq("id", tokenData.rsvp_id)
      .eq("status", "approved")
      .single();

    if (rsvpError || !rsvp) {
      console.log(
        "[PURCHASE-TOKEN] RSVP not found or not approved for token:",
        token.substring(0, 8) + "..."
      );
      return null;
    }

    // Use the stage price that was locked in when RSVP was created
    // This ensures price stability - the price won't change between RSVP approval and purchase
    // Note: Only the price is locked; remaining_in_stage is calculated dynamically to reflect
    // real-time availability for accurate display to the user
    // Check for null/undefined explicitly to handle free tickets (stage_price_cents = 0)
    if (rsvp.stage_price_cents != null) {
      rsvp.ticket_tiers.current_stage_price = rsvp.stage_price_cents;
      rsvp.ticket_tiers.current_stage = rsvp.stage_name
        ? {
            id: rsvp.stage_id,
            name: rsvp.stage_name,
            price_cents: rsvp.stage_price_cents,
          }
        : null;
      // Calculate remaining in stage dynamically for display purposes (reflects live availability)
      const stagePriceInfo = getCurrentStagePrice(rsvp.ticket_tiers);
      rsvp.ticket_tiers.remaining_in_stage =
        stagePriceInfo?.remainingInStage || null;
    } else {
      // No stage - use base tier price
      rsvp.ticket_tiers.current_stage_price = rsvp.ticket_tiers.price_cents;
      rsvp.ticket_tiers.current_stage = null;
      rsvp.ticket_tiers.remaining_in_stage =
        rsvp.ticket_tiers.quantity_total - rsvp.ticket_tiers.quantity_sold;
    }

    return rsvp as RsvpWithDetails;
  } catch (error) {
    console.error("Error validating purchase token:", error);
    return null;
  }
}

/**
 * Marks a purchase token as used
 */
export async function markTokenAsUsed(token: string): Promise<boolean> {
  try {
    if (!supabaseAdmin) {
      console.error("Database connection error");
      return false;
    }

    const { error } = await supabaseAdmin
      .from("purchase_tokens")
      .update({
        used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("token", token);

    if (error) {
      console.error("Error marking token as used:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error marking token as used:", error);
    return false;
  }
}

/**
 * Generates a secure purchase URL for a token
 */
export function generatePurchaseUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || getBaseUrl();
  return `${base}/purchase?token=${token}`;
}

/**
 * Cleans up stale purchase tokens for database hygiene.
 * Handles three cases:
 * 1. Used tokens older than 30 days (historical cleanup)
 * 2. Unused tokens older than 90 days (abandoned purchases)
 * 3. Tokens for RSVPs that are no longer approved (cancelled/rejected/purchased)
 */
export async function cleanupStaleTokens(): Promise<void> {
  try {
    if (!supabaseAdmin) {
      console.error("Database connection error");
      return;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // 1. Delete used tokens older than 30 days
    const { error: usedError, count: usedCount } = await supabaseAdmin
      .from("purchase_tokens")
      .delete()
      .not("used_at", "is", null)
      .lt("used_at", thirtyDaysAgo.toISOString());

    if (usedError) {
      console.error("Error cleaning up used tokens:", usedError);
    }

    // 2. Delete unused tokens older than 90 days (abandoned)
    const { error: unusedError, count: unusedCount } = await supabaseAdmin
      .from("purchase_tokens")
      .delete()
      .is("used_at", null)
      .lt("created_at", ninetyDaysAgo.toISOString());

    if (unusedError) {
      console.error("Error cleaning up unused tokens:", unusedError);
    }

    // 3. Delete tokens for RSVPs that are no longer approved
    // Two-step approach: fetch approved IDs first, then delete tokens not in that list
    let invalidCount = 0;
    const { data: approvedRsvps, error: fetchError } = await supabaseAdmin
      .from("rsvps")
      .select("id")
      .eq("status", "approved");

    if (fetchError) {
      console.error("Error fetching approved RSVPs for cleanup:", fetchError);
    } else if (approvedRsvps && approvedRsvps.length > 0) {
      // Delete unused tokens where rsvp_id is NOT in the approved list
      const approvedIds = approvedRsvps.map(r => r.id);
      const { error: invalidRsvpError, count } = await supabaseAdmin
        .from("purchase_tokens")
        .delete()
        .is("used_at", null)
        .not("rsvp_id", "in", `(${approvedIds.join(",")})`);

      if (invalidRsvpError) {
        console.error(
          "Error cleaning up tokens for non-approved RSVPs:",
          invalidRsvpError
        );
      } else {
        invalidCount = count || 0;
      }
    }

    console.log("[PURCHASE-TOKENS] Cleanup complete:", {
      usedTokensRemoved: usedCount || 0,
      abandonedTokensRemoved: unusedCount || 0,
      invalidRsvpTokensRemoved: invalidCount,
    });
  } catch (error) {
    console.error("Error cleaning up stale tokens:", error);
  }
}
