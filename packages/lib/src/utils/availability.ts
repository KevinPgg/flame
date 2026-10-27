/**
 * Availability Utilities
 *
 * Functions for checking event and tier availability.
 */

import type { TicketTierAvailability } from "../types/event";
import { formatCentsAsPrice } from "./format";

/**
 * Interface for a ticket tier with availability fields
 */
interface Tier {
  sales_start?: string | Date | null;
  sales_end?: string | Date | null;
  per_user_limit?: number;
  quantity_total: number;
  quantity_sold?: number | null;
  // Pending/approved RSVPs and active holds count against available capacity
  quantity_reserved?: number | null;
  // Organizer toggle (W4-C1, May 2026). When true, the tier is treated as
  // unavailable regardless of capacity so the attendee-side checkout is blocked.
  is_manually_sold_out?: boolean | null;
}

/**
 * Check if a ticket tier is available for purchase
 * @param tier - The ticket tier to check
 * @returns true if the tier is available, false otherwise
 */
export function isTierAvailable(tier: Tier): boolean {
  const now = new Date();
  const salesStart = tier.sales_start ? new Date(tier.sales_start) : null;
  const salesEnd = tier.sales_end ? new Date(tier.sales_end) : null;

  // Check if sales period is active
  if (salesStart && now < salesStart) return false;
  if (salesEnd && now > salesEnd) return false;

  // Organizer manual sold-out (W4-C1). Returning false here keeps the existing
  // "Sold Out" rendering on attendee surfaces — the organizer dashboard adds a
  // separate "Closed" indicator to disambiguate manual overrides from capacity
  // exhaustion. Sales-window checks intentionally come first so a not-yet-open
  // tier still reports "Not available yet" rather than "Sold Out".
  if (tier.is_manually_sold_out === true) return false;

  // Check if per-user limit is zero (tier disabled)
  if (tier.per_user_limit === 0) return false;

  // Check if sold out — quantity_reserved (active holds + pending RSVPs) count against capacity
  const totalClaimed = (tier.quantity_sold ?? 0) + (tier.quantity_reserved ?? 0);
  return tier.quantity_total - totalClaimed > 0;
}

/**
 * Check if any tier hasn't started yet
 * @param ticketTiers - Array of ticket tiers to check
 * @returns true if any tier has a future sales start date, false otherwise
 */
export function hasNotStartedTiers(
  ticketTiers: TicketTierAvailability[],
): boolean {
  if (!ticketTiers || ticketTiers.length === 0) return false;
  const now = new Date();
  return ticketTiers.some(tier => {
    const salesStart = tier.sales_start ? new Date(tier.sales_start) : null;
    return salesStart && now < salesStart;
  });
}

/**
 * Stage with calculated availability info
 */
export interface EnrichedStage {
  id: string;
  order_index: number;
  quantity: number;
  sold_quantity: number;
  quantity_reserved: number;
  remaining: number;
  is_available: boolean;
  [key: string]: unknown;
}

/**
 * Interface for a stage row from the database
 */
interface StageRow {
  id: string;
  order_index: number;
  quantity: number;
  sold_quantity: number;
  quantity_reserved: number;
  [key: string]: unknown;
}

/** Minimal stage shape for findFirstAvailableStage */
interface StageWithAvailability {
  id: string;
  name: string;
  price_cents: number;
  sold_quantity: number;
  quantity: number;
  order_index?: number;
}

/** Minimal tier shape for findFirstAvailableStage */
interface TierWithStages {
  price_cents: number;
  ticket_stages?: StageWithAvailability[];
}

/**
 * Find the first non-sold-out stage by order_index (waterfall logic).
 * Returns the active stage for pricing, or the last stage if all are sold.
 *
 * @param tier - Tier with optional ticket_stages
 * @returns { stageId, priceCents, stageName } — when no stages, stageId/stageName are undefined
 */
export function findFirstAvailableStage(tier: TierWithStages): {
  stageId: string | undefined;
  priceCents: number;
  stageName?: string;
} {
  if (!tier.ticket_stages || tier.ticket_stages.length === 0) {
    return { stageId: undefined, priceCents: tier.price_cents, stageName: undefined };
  }

  const sorted = [...tier.ticket_stages].sort(
    (a, b) => (a.order_index ?? Infinity) - (b.order_index ?? Infinity)
  );

  for (const stage of sorted) {
    if (stage.sold_quantity < stage.quantity) {
      return {
        stageId: stage.id,
        priceCents: stage.price_cents,
        stageName: stage.name,
      };
    }
  }

  const last = sorted[sorted.length - 1];
  return {
    stageId: last.id,
    priceCents: last.price_cents,
    stageName: last.name,
  };
}

/**
 * Enriches ticket stages with waterfall logic to handle "holes" in sales.
 * This ensures that if earlier stages have available capacity (e.g. due to expired holds),
 * they are prioritized for sale even if total sales count suggests we're in a later stage.
 *
 * @param tier - The ticket tier containing stages
 * @returns The tier with enriched stages including calculated availability
 */
export function enrichTicketStagesWithWaterfall<
  T extends { ticket_stages?: StageRow[] },
>(tier: T): T & { ticket_stages?: EnrichedStage[] } {
  if (!tier.ticket_stages || tier.ticket_stages.length === 0) {
    // When ticket_stages is undefined or empty, the tier already satisfies the return type
    return tier as T & { ticket_stages?: EnrichedStage[] };
  }

  // Sort stages by order
  const sortedStages = [...tier.ticket_stages].sort(
    (a, b) =>
      ((a.order_index as number) || 0) - ((b.order_index as number) || 0),
  );

  // Map stages to include availability info based on specific stage sales
  const enrichedStages: EnrichedStage[] = sortedStages.map(stage => {
    const soldQuantity = (stage.sold_quantity as number) || 0;
    const quantityReserved = (stage.quantity_reserved as number) || 0;
    const quantity = (stage.quantity as number) || 0;
    const remaining = Math.max(0, quantity - soldQuantity - quantityReserved);
    const isAvailable = remaining > 0;

    return {
      ...stage,
      id: stage.id as string,
      order_index: (stage.order_index as number) || 0,
      quantity,
      sold_quantity: soldQuantity,
      quantity_reserved: quantityReserved,
      remaining,
      is_available: isAvailable,
    };
  });

  return {
    ...tier,
    ticket_stages: enrichedStages,
  };
}

/** Minimal tier shape needed by getLowestPrice */
export interface PriceableTier {
  price_cents: number;
  quantity_total: number;
  quantity_sold?: number | null;
  quantity_reserved?: number | null;
  per_user_limit?: number | null;
  sales_start?: string | Date | null;
  sales_end?: string | Date | null;
  ticket_stages?: Array<{
    id?: string;
    name?: string;
    price_cents?: number;
    quantity?: number;
    sold_quantity?: number;
    order_index?: number;
  }>;
}

/** Lowest / highest price on sale now, or why there is none (Flame 2.0, 2026-10-27). */
export type LowestPriceInfo =
  | { status: "none" }
  | { status: "notYet" }
  | { status: "soldOut" }
  | { status: "ok"; lowCents: number; highCents: number };

export function lowestPriceInfo(ticketTiers: PriceableTier[]): LowestPriceInfo {
  if (!ticketTiers || ticketTiers.length === 0) return { status: "none" };

  const toAvailability = (t: PriceableTier): TicketTierAvailability => ({
    sales_start: t.sales_start as string | null | undefined,
    sales_end: t.sales_end as string | null | undefined,
    per_user_limit: t.per_user_limit ?? undefined,
    quantity_total: t.quantity_total,
    quantity_sold: t.quantity_sold ?? 0,
  });

  const availableTiers = ticketTiers.filter((tier) =>
    isTierAvailable({
      ...tier,
      per_user_limit: tier.per_user_limit ?? undefined,
    }),
  );

  if (availableTiers.length === 0) {
    return hasNotStartedTiers(ticketTiers.map(toAvailability)) ? { status: "notYet" } : { status: "soldOut" };
  }

  const prices: number[] = [];

  availableTiers.forEach((tier) => {
    if (tier.ticket_stages && tier.ticket_stages.length > 0) {
      const hasAvailabilityFields = tier.ticket_stages.every(
        (s) =>
          typeof s.quantity === "number" &&
          typeof s.sold_quantity === "number" &&
          typeof s.price_cents === "number",
      );
      if (hasAvailabilityFields) {
        const { priceCents } = findFirstAvailableStage(
          tier as TierWithStages,
        );
        if (typeof priceCents === "number" && !isNaN(priceCents) && isFinite(priceCents)) {
          prices.push(priceCents);
        }
      } else {
        tier.ticket_stages.forEach((stage) => {
          if (
            typeof stage.price_cents === "number" &&
            !isNaN(stage.price_cents) &&
            isFinite(stage.price_cents)
          ) {
            prices.push(stage.price_cents);
          }
        });
      }
    } else {
      if (
        typeof tier.price_cents === "number" &&
        !isNaN(tier.price_cents) &&
        isFinite(tier.price_cents)
      ) {
        prices.push(tier.price_cents);
      }
    }
  });

  if (prices.length === 0) {
    return hasNotStartedTiers(ticketTiers.map(toAvailability)) ? { status: "notYet" } : { status: "soldOut" };
  }

  return { status: "ok", lowCents: Math.min(...prices), highCents: Math.max(...prices) };
}

/**
 * Compute the lowest (or range) price display string for event cards.
 *
 * Uses findFirstAvailableStage when stages have availability fields so sold-out
 * stages don't incorrectly lower the displayed minimum. Falls back to iterating
 * all stage prices when stages lack quantity/sold_quantity (legacy data).
 *
 * Returns:
 * - null if no tiers
 * - "Not available yet" / "Sold Out" string
 * - Formatted price string ("$10.00") or range ("$10.00 - $25.00")
 */
export function getLowestPrice(
  ticketTiers: PriceableTier[],
  currency = "USD",
): string | null {
  const info = lowestPriceInfo(ticketTiers);
  if (info.status === "none") return null;
  if (info.status === "notYet") return "Not available yet";
  if (info.status === "soldOut") return "Sold Out";
  if (info.lowCents === info.highCents) return formatCentsAsPrice(info.lowCents, currency);
  return `${formatCentsAsPrice(info.lowCents, currency)} - ${formatCentsAsPrice(info.highCents, currency)}`;
}
