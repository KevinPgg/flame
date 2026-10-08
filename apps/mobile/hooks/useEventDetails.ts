import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { findFirstAvailableStage } from "@project-flame/lib";
import type { Event, TicketTier } from "@project-flame/lib";
import { useOptionalAuth } from "./useOptionalAuth";

// RPC response schemas — full Event and TicketTier shapes for typed validation
const TicketStageSchema = z.object({
  id: z.string(),
  ticket_tier_id: z.string(),
  name: z.string(),
  price_cents: z.number(),
  currency: z.string(),
  quantity: z.number(),
  sold_quantity: z.number(),
  order_index: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  // W4-C2 (May 2026): per-stage description, optional. Forwarded by the
  // get_event_with_tiers RPC and rendered on attendee surfaces in place of the
  // tier-level description while this stage is active.
  description: z.string().nullish(),
  // W4-C1 (May 2026): per-stage active holds + pending/approved RSVPs.
  // Populated by `get_event_with_tiers` (see migration
  // 20260527000600_tier_visibility_and_manual_sold_out.sql lines 67-89).
  // Optional so old RPC responses pre-migration don't fail parsing.
  quantity_reserved: z.number().optional(),
}).passthrough();

const TicketTierSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  name: z.string(),
  price_cents: z.number(),
  quantity_total: z.number(),
  quantity_sold: z.number(),
  quantity_reserved: z.number().optional(),
  per_user_limit: z.number().nullable(),
  sales_start: z.string().nullable(),
  sales_end: z.string().nullable(),
  order_index: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  description: z.string().nullish(),
  /** True when the organizer has set a secret_code on this tier. The raw code
   *  is never returned by the API — this boolean is sufficient for the client
   *  to know it should prompt the user before checkout.
   *  Required (not optional): a missing field means the RPC contract regressed
   *  and the parser will throw, failing closed rather than silently open. */
  has_secret_code: z.boolean(),
  // W4-C1 (May 2026): organizer override forwarded by the RPC. When true,
  // getTierStatus() short-circuits to "sold_out" regardless of capacity.
  // Optional so older RPC responses (pre-migration) don't break parsing.
  is_manually_sold_out: z.boolean().nullish(),
  // W4-C1: hidden flag also flows through (RPC strips it for non-organizers
  // but exempts org members — we filter again client-side so the attendee
  // detail screen always matches what attendees see, even when previewed by
  // the organizer who owns the event).
  is_hidden: z.boolean().nullish(),
  ticket_stages: z.array(TicketStageSchema).optional(),
}).passthrough();

const EventSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  slug: z.string(),
  city: z.string(),
  venue: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  description: z.string().nullish(),
  image_url: z.string().nullish(),
  status: z.string(),
  is_featured: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  requires_rsvp: z.boolean().optional(),
  organizations: z.object({ name: z.string(), slug: z.string() }).optional(),
}).passthrough();

const GetEventWithTiersResponseSchema = z.object({
  event: EventSchema,
  ticket_tiers: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(TicketTierSchema)
  ),
  organization_name: z.string().optional(),
  cohost_org_names: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(z.string())
  ),
});

// --- Tier availability status ---

export type TierStatus =
  | "available"
  | "sold_out"
  | "not_available_yet"
  | "sales_ended";

export interface TicketTierWithStatus extends TicketTier {
  status: TierStatus;
  displayPrice: number; // price in cents
  currentStageName?: string;
  /** W4-C2 (May 2026) — description of the active stage, if the active stage
   *  has its own description set. Attendee-facing tier cards prefer this over
   *  the tier-level `description`. */
  currentStageDescription?: string | null;
  /** Forwarded from the RPC — true when this tier requires an access code. */
  has_secret_code?: boolean;
  /**
   * Set on stage-expanded entries only (when a tier has ticket_stages).
   * The real DB ticket_tier id — used in API payloads (ticket_tier_id).
   * `id` on stage-expanded entries is a synthetic composite key for selection uniqueness.
   */
  tierId?: string;
  /**
   * Set on stage-expanded entries only.
   * The DB ticket_stage id — forwarded as stage_id in API payloads.
   */
  stageId?: string;
}

/** Extended Event with fields from DB not in shared type */
export interface EventDetail extends Omit<Event, "ticket_tiers" | "status"> {
  /** Widened from Event's "published" literal — the RPC bypasses the status filter for org members,
   *  so non-published statuses (draft, archived, etc.) are valid here. */
  status: string;
  requires_rsvp?: boolean;
  organization_name?: string;
  cohost_org_names?: string[];
  ticket_tiers?: TicketTierWithStatus[];
  /** Raw RPC-returned registration form config. Shape validated at read sites via isValidFormField guard. */
  registration_form_config?: unknown;
  /** Per-event markup overrides (events.markup_percent / events.markup_fixed_cents).
   *  Forwarded by the RPC via to_jsonb(events). Read by useCheckout's pre-PaymentIntent
   *  estimate so the sheet matches what the server will authorize — without these the
   *  client falls back to system defaults and silently diverges from Stripe for any
   *  event with custom markup. Optional; absent rows fall back to DEFAULT_*. */
  markup_percent?: number;
  markup_fixed_cents?: number;
}

// --- Availability Logic ---
// We keep our granular TierStatus enum (available / sold_out / not_available_yet / sales_ended)
// because the shared lib's `isTierAvailable()` only returns a boolean. The extended enum
// drives distinct UI badges in TicketTierCard.

function getTierStatus(tier: TicketTier): TierStatus {
  const now = new Date();

  // Sales-window checks come FIRST so a tier that hasn't opened yet reports
  // "Not available yet" rather than "Sold Out", even when the organizer has
  // also flagged it manually sold out. This mirrors the ordering in the
  // shared-lib `isTierAvailable()` (sales window before manual sold-out) and
  // web `EventDetail.tsx`, which labels not-started tiers via `isTierNotStarted`.
  if (tier.sales_start && now < new Date(tier.sales_start)) {
    return "not_available_yet";
  }

  if (tier.sales_end && now > new Date(tier.sales_end)) {
    return "sales_ended";
  }

  // W4-C1: organizer "mark as sold out" override. Applied after the sales
  // window so an open (or window-less) tier surfaces as "Sold Out" even with
  // capacity remaining.
  if (tier.is_manually_sold_out === true) {
    return "sold_out";
  }

  if (tier.per_user_limit === 0) {
    return "sold_out";
  }

  const totalClaimed = tier.quantity_sold + (tier.quantity_reserved || 0);
  if (totalClaimed >= tier.quantity_total) {
    return "sold_out";
  }

  return "available";
}

/**
 * Determine the current active price for a tier.
 * Uses shared findFirstAvailableStage (waterfall logic).
 */
function getCurrentStagePrice(
  tier: TicketTier
): { price: number; stageName?: string } {
  const { priceCents, stageName } = findFirstAvailableStage(tier);
  return { price: priceCents, stageName };
}

/** Active stage price when staged; otherwise tier.price_cents. Matches displayPrice so sort order reflects what attendees see. */
function getTierSortPriceCents(tier: TicketTier): number {
  if (tier.ticket_stages && tier.ticket_stages.length > 0) {
    const { priceCents } = findFirstAvailableStage(tier);
    return priceCents;
  }
  return tier.price_cents;
}

/**
 * W4-C3 (Jun 2026): Enrich a single raw RPC-shaped tier into one or more
 * TicketTierWithStatus entries (stages expand to one per stage). Exported so
 * the unlock-tier flow on the event detail screen can fold an unlocked hidden
 * tier into the same render path without duplicating the enrichment logic.
 */
export function enrichTier(tier: TicketTier): TicketTierWithStatus[] {
  if (tier.ticket_stages && tier.ticket_stages.length > 0) {
    const tierStatus = getTierStatus(tier);
    const sorted = [...tier.ticket_stages].sort(
      (a, b) => (a.order_index ?? Infinity) - (b.order_index ?? Infinity),
    );

    let foundAvailable = false;
    return sorted.map((stage) => {
      const reservedInStage =
        (stage as { quantity_reserved?: number }).quantity_reserved ?? 0;
      const isSoldOut =
        (stage.sold_quantity ?? 0) + reservedInStage >= stage.quantity;
      const isCurrentStage = !foundAvailable && !isSoldOut;
      if (isCurrentStage) foundAvailable = true;

      let status: TierStatus;
      if (
        tierStatus === "not_available_yet" ||
        tierStatus === "sales_ended" ||
        tierStatus === "sold_out"
      ) {
        status = tierStatus;
      } else if (tier.per_user_limit === 0) {
        status = "sold_out";
      } else if (isCurrentStage) {
        status = "available";
      } else if (isSoldOut) {
        status = "sold_out";
      } else {
        status = "not_available_yet";
      }

      return {
        ...tier,
        id: `${tier.id}::${stage.id}`,
        tierId: tier.id,
        stageId: stage.id,
        name: tier.name,
        displayPrice: stage.price_cents,
        status,
        currentStageName: stage.name,
        currentStageDescription:
          typeof stage.description === "string" ? stage.description : null,
        quantity_total: stage.quantity,
        quantity_sold: stage.sold_quantity ?? 0,
        quantity_reserved: reservedInStage,
        has_secret_code: tier.has_secret_code,
      };
    });
  }

  const status = getTierStatus(tier);
  const { price, stageName } = getCurrentStagePrice(tier);
  return [
    {
      ...tier,
      status,
      displayPrice: price,
      currentStageName: stageName,
      has_secret_code: tier.has_secret_code,
    },
  ];
}

/**
 * W4-C3: Schema for a single tier returned by POST /api/ticket-tiers/unlock.
 * Exported so the screen can validate the unlock response before enrichment.
 */
export const UnlockedTierSchema = TicketTierSchema;

// --- RPC Response Validation ---

function validateGetEventWithTiersResponse(
  data: unknown,
  eventId: string
): z.infer<typeof GetEventWithTiersResponseSchema> {
  try {
    return GetEventWithTiersResponseSchema.parse(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      "[useEventDetails] fetchEventWithTiers validation failed",
      { eventId, action: "validateGetEventWithTiersResponse", err: msg, data }
    );
    throw new Error("Invalid event data");
  }
}

// --- Hook ---

export const useEventDetails = (eventId: string) => {
  const { getToken, isSignedIn, userId } = useOptionalAuth();

  return useQuery({
    queryKey: ["event", eventId, userId ?? "anon"],
    queryFn: async () => {
      // Use the authenticated client when signed in so auth.jwt() ->> 'sub' is
      // populated inside get_event_with_tiers, enabling the org-member bypass for
      // non-published events. Anonymous visitors fall back to the anon client and
      // can still see published events normally.
      // If token retrieval fails (e.g., network error during Clerk token refresh),
      // fall back to the anon client so published events still load.
      let client = supabase;
      if (isSignedIn) {
        try {
          client = await getAuthenticatedClient(getToken);
        } catch (tokenError) {
          console.error("[useEventDetails] getAuthenticatedClient failed, falling back to anon client", tokenError);
        }
      }

      const { data, error } = await client.rpc("get_event_with_tiers", {
        p_event_id: eventId,
      });

      if (error) {
        console.error("[useEventDetails] fetchEventWithTiers RPC error", {
          eventId,
          action: "fetchEventWithTiers",
          error,
        });
        throw error;
      }

      const parsed = validateGetEventWithTiersResponse(data, eventId);
      const {
        event: rawEvent,
        ticket_tiers: rawTiers,
        organization_name: orgName,
        cohost_org_names: cohostNames,
      } = parsed;

      const event: EventDetail = {
        // Cast omits the two fields that conflict between EventSchema and the shared Event type:
        // - "status": EventSchema uses z.string() (org members see non-published); Event uses "published" literal
        // - "ticket_tiers": overridden below with enriched TicketTierWithStatus[]
        ...(rawEvent as unknown as Omit<Event, "ticket_tiers" | "status">),
        status: rawEvent.status,
        organization_name: orgName || undefined,
        cohost_org_names: cohostNames.length > 0 ? cohostNames : undefined,
        ticket_tiers: undefined,
      };

      // Enrich ticket tiers with computed availability (parsed from Zod).
      // W4-C1: the RPC exempts org members from the `is_hidden` filter so they
      // can preview the tier server-side; we strip them here so the attendee
      // detail screen matches the public attendee experience regardless of who
      // is viewing. Mirrors the web SSR filter in `events/[slug]/page.tsx`.
      const tiers = (rawTiers as TicketTier[]).filter(
        (t) => t.is_hidden !== true,
      );
      event.ticket_tiers = tiers
        .sort((a, b) => {
          const priceDiff = getTierSortPriceCents(a) - getTierSortPriceCents(b);
          if (priceDiff !== 0) return priceDiff;
          const orderDiff = (a.order_index ?? Infinity) - (b.order_index ?? Infinity);
          if (orderDiff !== 0) return orderDiff;
          return a.created_at.localeCompare(b.created_at);
        })
        .flatMap(enrichTier);

      return event;
    },
    enabled: !!eventId,
    staleTime: 1000 * 60 * 2,
    refetchInterval: 10_000,
  });
};
