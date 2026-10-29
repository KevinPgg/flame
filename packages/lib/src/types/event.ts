/**
 * Core Event Types
 *
 * These types represent the core data structures for events, tickets, and tiers.
 * Shared between web and mobile applications.
 */

import { z } from "zod";

/**
 * Main Event interface - all fields are REQUIRED unless marked optional
 * NOTE: ends_at is guaranteed to exist due to:
 * 1. Database NOT NULL constraint
 * 2. Zod schema validation (required, not optional)
 * 3. Frontend form validation (required HTML input)
 */
export interface Event {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  city: string;
  venue: string;
  starts_at: string; // REQUIRED - always present
  ends_at: string; // REQUIRED - always present
  description?: string;
  image_url?: string;
  status: "published";
  is_featured?: boolean;
  main_featured?: boolean;
  created_at: string;
  updated_at: string;
  requires_rsvp?: boolean;
  currency: string;
  timezone: string;
  organizations?: {
    name: string;
    slug: string;
  };
  ticket_tiers?: TicketTier[];
}

/**
 * Ticket Stage - represents a pricing stage within a tier
 * Stages allow for dynamic pricing (e.g., Early Bird, Regular, Last Minute)
 */
export interface TicketStage {
  id: string;
  ticket_tier_id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity: number;
  sold_quantity: number;
  order_index: number;
  created_at: string;
  updated_at: string;
  /**
   * Optional organizer-authored description of this stage. When set on the
   * currently active stage, attendee surfaces render it in place of the
   * tier-level description so per-stage offers (e.g. "Includes free drink")
   * can communicate stage-specific terms. 120-character cap enforced at the
   * API layer. (W4-C2, May 2026 migration `20260527002336_ticket_stage_description`.)
   */
  description?: string | null;
  /**
   * Per-stage active holds + pending/approved RSVP quantities. Populated by
   * the `get_event_with_tiers` RPC and by mobile's `useOrgEvents` enrichment.
   * (W4-C1, May 2026.)
   */
  quantity_reserved?: number;
}

/**
 * Ticket Tier - represents a category of tickets (e.g., General Admission, VIP)
 */
export interface TicketTier {
  id: string;
  event_id: string;
  name: string;
  price_cents: number; // Kept for backward compatibility, but stages determine actual pricing
  quantity_total: number;
  quantity_sold: number;
  quantity_reserved?: number; // Count of pending/approved RSVPs (added by events API)
  per_user_limit: number | null;
  sales_start: string | null;
  sales_end: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  description?: string;
  /**
   * Subset of `events.registration_form_config` field IDs that apply to this tier.
   * - `null` or `undefined` → tier inherits the full event-level form (backward-compatible default).
   * - `[]` → tier collects no fields.
   * - `["field-abc", "field-xyz"]` → only those fields are required/displayed for this tier.
   *
   * Server-side validation: `apps/web/app/api/rsvp/route.ts` filters required-field
   * checks by this array. Web attendee display: `EventDetail.tsx`. Mobile attendee
   * display: `CheckoutMainSheet.tsx`.
   */
  registration_form_fields?: string[] | null;
  /**
   * RSVP tiers: `true` → the questions are answered for every ticket (guest 1 at the top level of
   * `registration_data`, guests 2..N in `registration_data._guests`). `false`/missing (default) →
   * once per request, as before. Column added 2026-10-29 (`20261029120000_tier_registration_per_ticket`).
   */
  registration_per_ticket?: boolean | null;
  /**
   * Organizer toggle that forces `isTierAvailable()` to return `false` regardless
   * of capacity. Attendees see the standard "Sold Out" label; the organizer
   * dashboard surfaces an additional "Closed" indicator so the manual override
   * is distinguishable from natural sold-out. Persisted in `ticket_tiers`
   * (W4-C1, May 2026 migration `20260527000600_tier_visibility_and_manual_sold_out`).
   */
  is_manually_sold_out?: boolean;
  /**
   * Organizer toggle that hides this tier from attendees. The
   * `get_event_with_tiers` RPC strips hidden tiers from non-organizer responses
   * so consumers (web event page, mobile event details) never see them. Host-org
   * members continue to receive the tier so they can manage it.
   * (W4-C1, same migration as above.)
   */
  is_hidden?: boolean;
  ticket_stages?: TicketStage[];
}

/**
 * Extended TicketTier with current stage pricing information
 */
export interface TicketTierWithStage extends TicketTier {
  current_stage_price?: number;
  current_stage?: {
    id: string;
    name: string;
    price_cents: number;
  };
}

/**
 * Interface for ticket tier availability checking
 */
export interface TicketTierAvailability {
  sales_start?: string | Date | null;
  sales_end?: string | Date | null;
  per_user_limit?: number;
  quantity_total: number;
  quantity_sold?: number | null;
}

export const EventSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  slug: z.string(),
  city: z.string(),
  venue: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  description: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  status: z.literal("published"),
  is_featured: z.boolean().optional(),
  main_featured: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  requires_rsvp: z.boolean().optional(),
  currency: z.string(),
  timezone: z.string(),
}).passthrough();
