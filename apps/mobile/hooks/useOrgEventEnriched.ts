/**
 * Fetches enriched organizer event data from the web API.
 *
 * Unlike useOrgEvents (which queries Supabase directly for basic event + tier data),
 * this hook calls GET /api/organizer/data which returns:
 * - Actual purchase details with correct basePrice from orders
 * - totalRevenue computed from real order amounts (not tier.price_cents * quantity_sold)
 * - totalAttendees from ticket_tiers.quantity_sold
 * - Promotional tickets + bank transfer orders (sent ticket history)
 * - Promoter link stats with both "completed" and "paid" order statuses
 *
 * Industry standard: Single batch fetch per screen (Eventbrite/Ticketmaster pattern).
 * The full response is cached at the org level; navigating between events reuses the cache.
 *
 * Web source: apps/web/app/api/organizer/data/route.ts
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { apiGet } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";
import { useOrgData } from "./useOrgData";
import { FormFieldSchema, type FormField } from "./useRsvpManagement";

export interface EnrichedPurchase {
  id: string;
  userName: string;
  email: string;
  tierName: string;
  stageName: string | null;
  quantity: number;
  pricePerTicket: number;
  totalPrice: number;
  basePrice: number;
  scanned: boolean;
  rsvpStatus: string;
  createdAt: string;
  /**
   * Registration form answers from the matching RSVP, when the event has a
   * `registration_form_config`. `null` for non-RSVP events or when the join
   * yielded nothing. Used to add reg-form columns to the purchase XLSX export.
   */
  registrationData?: Record<string, unknown> | null;
}

export interface EnrichedPromotionalTicket {
  id: string;
  email: string;
  customer_name: string;
  status: string;
  created_at: string;
  checked_in_at: string | null;
  metadata?: {
    stage_id?: string;
    stage_name?: string;
    stage_price_cents?: number;
  } | null;
  ticket_tiers: {
    id?: string;
    name: string;
    price_cents: number;
  };
  is_bank_transfer?: boolean;
  order_total_cents?: number;
  order_quantity?: number;
  quantity?: number;
}

export interface EnrichedPromoterLink {
  id: string;
  promoter_code: string;
  promoter_name: string | null;
  created_at: string;
  total_tickets_sold: number;
  total_revenue_cents: number;
}

export interface EnrichedPromoCode {
  id: string;
  code: string;
  discount_percentage: number;
  usage_limit: number;
  usage_count: number;
  created_at: string;
}

interface EnrichedEventTierStage {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  sold_quantity: number;
  order_index: number;
}

interface EnrichedEventTier {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  per_user_limit: number;
  sales_start: string;
  sales_end: string;
  order_index: number;
  ticket_stages?: EnrichedEventTierStage[];
}

export interface EnrichedOrgEvent {
  id: string;
  name: string;
  slug: string;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  city: string;
  venue: string;
  description: string | null;
  status: string;
  requires_rsvp: boolean;
  currency?: string;
  timezone: string;
  ticket_tiers: EnrichedEventTier[];
  purchases: EnrichedPurchase[];
  totalRevenue: number;
  totalAttendees: number;
  pending_rsvps: number;
  approved_rsvps?: number;
  rejected_rsvps?: number;
  purchased_rsvps?: number;
  promotional_tickets: EnrichedPromotionalTicket[];
  bank_transfer_orders: EnrichedPromotionalTicket[];
  promotional_codes: EnrichedPromoCode[];
  promoter_links: EnrichedPromoterLink[];
  /**
   * Registration form schema for RSVP events. When present and non-empty, the
   * Purchase Details XLSX export adds one column per field (in the same order
   * as `registration_form_config`), pulling values from each purchase's
   * `registrationData`. Mirrors web parity (RsvpManagement + OrgEventDetail).
   */
  registration_form_config?: FormField[] | null;
}

interface OrgDataResponse {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  events: EnrichedOrgEvent[];
}

// Explicit Zod schemas for nested shapes consumed by the UI
const PurchaseSchema = z.object({
  id: z.string(),
  userName: z.string(),
  email: z.string(),
  tierName: z.string(),
  stageName: z.string().nullable(),
  quantity: z.number(),
  pricePerTicket: z.number(),
  totalPrice: z.number(),
  basePrice: z.number(),
  scanned: z.boolean(),
  rsvpStatus: z.string(),
  createdAt: z.string(),
  registrationData: z.record(z.string(), z.unknown()).nullable().optional(),
});

const TicketTierRefSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  price_cents: z.number(),
});

const SentTicketSchema = z.object({
  id: z.string(),
  email: z.string(),
  customer_name: z.string(),
  status: z.string(),
  created_at: z.string(),
  checked_in_at: z.string().nullable(),
  metadata: z
    .object({
      stage_id: z.string().optional(),
      stage_name: z.string().optional(),
      stage_price_cents: z.number().optional(),
    })
    .nullable()
    .optional(),
  ticket_tiers: TicketTierRefSchema,
  is_bank_transfer: z.boolean().optional(),
  order_total_cents: z.number().optional(),
  order_quantity: z.number().optional(),
  quantity: z.number().optional(),
});

const PromotionalCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  discount_percentage: z.number(),
  usage_limit: z.number(),
  usage_count: z.number(),
  created_at: z.string(),
});

const PromoterLinkSchema = z.object({
  id: z.string(),
  promoter_code: z.string(),
  promoter_name: z.string().nullable(),
  created_at: z.string(),
  total_tickets_sold: z.number(),
  total_revenue_cents: z.number(),
});

const EnrichedEventTierStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  price_cents: z.number(),
  quantity: z.number(),
  sold_quantity: z.number(),
  order_index: z.number(),
});

const EnrichedEventTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  price_cents: z.number(),
  quantity_total: z.number(),
  quantity_sold: z.number(),
  per_user_limit: z.number(),
  sales_start: z.string(),
  sales_end: z.string(),
  order_index: z.number(),
  ticket_stages: z.array(EnrichedEventTierStageSchema).optional(),
});

const EnrichedEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  image_url: z.string().nullable(),
  city: z.string(),
  venue: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  requires_rsvp: z.boolean(),
  currency: z.string().optional(),
  timezone: z.string(),
  ticket_tiers: z.array(EnrichedEventTierSchema).default([]),
  totalRevenue: z.number(),
  totalAttendees: z.number(),
  pending_rsvps: z.number(),
  approved_rsvps: z.number().optional(),
  rejected_rsvps: z.number().optional(),
  purchased_rsvps: z.number().optional(),
  purchases: z.array(PurchaseSchema).default([]),
  promotional_tickets: z.array(SentTicketSchema).default([]),
  bank_transfer_orders: z.array(SentTicketSchema).default([]),
  promotional_codes: z.array(PromotionalCodeSchema).default([]),
  promoter_links: z.array(PromoterLinkSchema).default([]),
  registration_form_config: z.array(FormFieldSchema).nullable().optional(),
});

const OrgDataResponseSchema = z.object({
  organization: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
  events: z.array(EnrichedEventSchema),
});

/**
 * Fetches all enriched org events in a single API call.
 * Cached at the org level so navigating between events reuses the same data.
 * Pass orgId to target a specific org (e.g. selectedOrgId from MemberRoleContext)
 * rather than always using the user's first-joined org.
 */
function useOrgEnrichedAll(orgId?: string | null) {
  const { getToken, isSignedIn, isConfigured } = useOptionalAuth();
  const {
    data: orgData,
    isLoading: isOrgLoading,
    error: orgError,
    refetch: refetchOrgData,
  } = useOrgData(orgId);
  const orgSlug = orgData?.organizationSlug;

  const query = useQuery<EnrichedOrgEvent[]>({
    queryKey: ["org-enriched-data", orgSlug],
    queryFn: async () => {
      const endpoint = orgSlug
        ? `/api/organizer/data?org=${encodeURIComponent(orgSlug)}`
        : "/api/organizer/data";

      const raw = await apiGet<unknown>(endpoint, getToken);
      const result = OrgDataResponseSchema.safeParse(raw);
      if (!result.success) {
        console.error("[useOrgEventEnriched] API response validation failed", {
          action: "validateOrgDataResponse",
          error: result.error,
        });
        throw new Error("Invalid organizer data response");
      }
      return result.data.events ?? [];
    },
    enabled: Boolean(isSignedIn && isConfigured && orgSlug),
    staleTime: 60_000,
  });

  const composedRefetch = useCallback(async () => {
    await refetchOrgData();
    return query.refetch();
  }, [refetchOrgData, query.refetch]);

  return {
    ...query,
    refetch: composedRefetch,
    isLoading: isOrgLoading || query.isLoading,
    error: orgError ?? query.error,
  };
}

/**
 * Minimal projection of the `/api/organizer/data` response used purely to read
 * per-event revenue for events THIS org co-hosts. The full response also carries
 * `events` + a large enriched shape, but Zod ignores unknown keys so we only
 * validate what the dashboard cards need. `totalRevenue` is server-computed with
 * the shared calculateOrganizerBasePrice logic (excludes bank_transfer), so it
 * matches owner events and the cohost detail view.
 */
const CohostRevenueResponseSchema = z.object({
  cohost_events: z
    .array(
      z.object({
        event: z.object({
          id: z.string(),
          totalRevenue: z.number().optional(),
        }),
      }),
    )
    .default([]),
});

/**
 * Returns a Map of eventId → net revenue (cents) for events the given org
 * co-hosts. Cohost revenue lives under the OWNER org's orders, which RLS hides
 * from the cohost's mobile client — so unlike owner revenue (useOrgDashboardStats
 * queries Supabase directly) it can only come from the server. The dashboard
 * feeds this map into the cohost cards so they show the same figure as the
 * cohost detail view instead of $0 (or a gross tier estimate).
 */
export function useCohostRevenueMap(orgId?: string | null) {
  const { getToken, isSignedIn, isConfigured } = useOptionalAuth();
  const { data: orgData } = useOrgData(orgId);
  const orgSlug = orgData?.organizationSlug;

  return useQuery<Map<string, number>>({
    queryKey: ["cohost-revenue", orgSlug],
    queryFn: async () => {
      const endpoint = orgSlug
        ? `/api/organizer/data?org=${encodeURIComponent(orgSlug)}`
        : "/api/organizer/data";
      const raw = await apiGet<unknown>(endpoint, getToken);
      const parsed = CohostRevenueResponseSchema.safeParse(raw);
      const map = new Map<string, number>();
      if (!parsed.success) {
        console.error("[useCohostRevenueMap] response validation failed", {
          action: "validateCohostRevenue",
          error: parsed.error,
        });
        // Throw so React Query enters its error state (data stays undefined,
        // error is set) instead of resolving with an empty map. An empty map is
        // a "success" that would silently render $0 on every cohost card with no
        // "estimates shown — live data unavailable" disclaimer; the thrown error
        // instead falls the cards back to the gross tier estimate AND surfaces
        // the banner via cohostStatsFailed in organizer-admin.tsx.
        throw new Error("Cohost revenue response failed validation");
      }
      for (const entry of parsed.data.cohost_events) {
        if (typeof entry.event.totalRevenue === "number") {
          map.set(entry.event.id, entry.event.totalRevenue);
        }
      }
      return map;
    },
    enabled: Boolean(isSignedIn && isConfigured && orgSlug),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Returns the enriched data for a single org event.
 * Internally fetches all org events (cached) and filters client-side.
 * Pass orgId to target a specific org when the user is a member of multiple orgs.
 */
export function useOrgEventEnriched(eventId: string | undefined, orgId?: string | null) {
  const query = useOrgEnrichedAll(orgId);

  const event = useMemo(
    () => (eventId ? query.data?.find((e) => e.id === eventId) ?? null : null),
    [query.data, eventId],
  );

  return {
    data: event,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}
