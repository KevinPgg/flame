/**
 * Fetches the current organization's events for management.
 *
 * Queries Supabase directly (read operation) using authenticated client.
 * Returns events with ticket tiers for the org's event management screen.
 *
 * Web source-of-truth: apps/web/app/api/events/route.ts (GET handler)
 */

import { useQuery } from "@tanstack/react-query";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";
import { useOrgData } from "./useOrgData";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";
import type { FormField } from "./useRsvpManagement";

export interface OrgEventTierStage {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  sold_quantity: number;
  order_index: number;
  // Per-stage active holds + pending/approved RSVP quantities. Populated by
  // useOrgEvents alongside the tier-level total so the organizer dashboard can
  // surface a stage-accurate "{n} reserved" hint. (W4-C1, May 2026.)
  quantity_reserved?: number;
  /** W4-C2 (May 2026): per-stage description rendered to attendees in place
   *  of the tier-level description while this stage is active. */
  description?: string | null;
}

export interface OrgEventTier {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  // Active holds + pending/approved RSVP quantities attached to this tier.
  // Populated by useOrgEvents for primary-org events. useCohostEvents does
  // not populate this — it only fetches event/tier metadata via the
  // event_assignments join, not holds/rsvps. (As of
  // 20260519220824_cohost_rsvp_rls_access.sql cohost org owner/admins CAN
  // read rsvps via RLS, but useCohostEvents intentionally stays lightweight.)
  // Matches the get_event_with_tiers RPC definition of quantity_reserved.
  quantity_reserved?: number;
  per_user_limit: number | null;
  sales_start: string | null;
  sales_end: string | null;
  order_index: number;
  secret_code?: string | null;
  /** Per-tier subset of event-level registration form field IDs. See
   *  packages/lib/src/utils/registration-form.ts for semantics. */
  registration_form_fields?: string[] | null;
  /** RSVP: questions per ticket (each guest) instead of once per request. */
  registration_per_ticket?: boolean | null;
  /** W4-C1 (May 2026): organizer toggle. When true, isTierAvailable() returns
   *  false regardless of capacity so attendees see "Sold Out". The organizer
   *  dashboard surfaces a separate "Marked as Sold Out" indicator. */
  is_manually_sold_out?: boolean;
  /** W4-C1 (May 2026): organizer toggle. When true, attendee-facing screens
   *  filter the tier out (web get_event_with_tiers RPC drops it; mobile event
   *  details query inherits the filter). Organizer dashboards keep showing the
   *  tier so it can be managed. */
  is_hidden?: boolean;
  /** W4-C2 (May 2026): tier-level organizer description. Falls back to the
   *  active stage's description on attendee surfaces when both are set. */
  description?: string | null;
  ticket_stages?: OrgEventTierStage[];
}

export interface OrgEvent {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  city: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  description: string | null;
  image_url: string | null;
  status: string;
  requires_rsvp: boolean;
  created_at: string;
  updated_at: string;
  timezone: string;
  currency: string;
  qr_scanner_code: string | null;
  registration_form_config: FormField[] | null;
  ticket_tiers: OrgEventTier[];
}

const EVENT_FIELDS = `
  id,
  organization_id,
  name,
  slug,
  city,
  venue,
  starts_at,
  ends_at,
  description,
  image_url,
  status,
  requires_rsvp,
  created_at,
  updated_at,
  timezone,
  currency,
  qr_scanner_code,
  registration_form_config,
  ticket_tiers (
    id,
    name,
    price_cents,
    quantity_total,
    quantity_sold,
    per_user_limit,
    sales_start,
    sales_end,
    order_index,
    secret_code,
    registration_form_fields,
    registration_per_ticket,
    is_manually_sold_out,
    is_hidden,
    description,
    ticket_stages (
      id,
      name,
      price_cents,
      quantity,
      sold_quantity,
      order_index,
      description
    )
  )
`;

export function useOrgEvents(orgId?: string | null) {
  const { getToken, isSignedIn, isConfigured } = useOptionalAuth();
  const { selectedOrgId } = useMemberRoleContext();
  const { data: orgData } = useOrgData(selectedOrgId);

  const effectiveOrgId = orgId ?? orgData?.organizationId;

  return useQuery<OrgEvent[]>({
    queryKey: ["org-events", effectiveOrgId],
    queryFn: async () => {
      const client = await getAuthenticatedClient(getToken);

      // Step 1: fetch event IDs where this org is a co-host.
      // This lets organisers see events they co-host alongside events they own.
      const { data: cohostRows, error: cohostError } = await client
        .from("event_assignments")
        .select("event_id")
        .eq("cohost_organization_id", effectiveOrgId!);

      if (cohostError) throw cohostError;

      const cohostEventIds = (cohostRows ?? []).map((r) => r.event_id as string);

      // Step 2: fetch events — owned OR co-hosted — in a single query.
      const eventsQuery = client.from("events").select(EVENT_FIELDS);

      const { data, error } =
        cohostEventIds.length > 0
          ? await eventsQuery
              .or(
                `organization_id.eq.${effectiveOrgId},id.in.(${cohostEventIds.join(",")})`,
              )
              .order("starts_at", { ascending: true })
          : await eventsQuery
              .eq("organization_id", effectiveOrgId!)
              .order("starts_at", { ascending: true });

      if (error) throw error;

      const events = (data as unknown as OrgEvent[]) ?? [];

      // Enrich each tier with quantity_reserved (active holds +
      // pending/approved RSVP quantities). This matches the web organizer
      // dashboard hint and the get_event_with_tiers RPC semantics. RLS
      // policies `organizers_view_event_holds` and
      // "Organization members can view RSVPs for their events" allow direct
      // reads from the mobile client — no SECURITY DEFINER RPC needed.
      const tierIds = events.flatMap(e =>
        (e.ticket_tiers ?? []).map(t => t.id),
      );
      const eventIds = events.map(e => e.id);

      if (tierIds.length === 0 || eventIds.length === 0) {
        for (const event of events) {
          event.ticket_tiers = (event.ticket_tiers ?? []).map(t => ({
            ...t,
            quantity_reserved: 0,
          }));
        }
        return events;
      }

      const [holdsRes, rsvpsRes] = await Promise.all([
        client
          .from("holds")
          .select("tier_id, stage_id, quantity, expires_at, order_id")
          .in("tier_id", tierIds)
          .gt("expires_at", new Date().toISOString())
          .is("order_id", null),
        client
          .from("rsvps")
          .select(
            "ticket_tier_id, stage_id, requested_quantity, status, event_id",
          )
          .in("event_id", eventIds)
          .in("status", ["pending", "approved"]),
      ]);

      // Non-fatal: a missing policy or transient error should not break event
      // listing — fall through with 0 reservations so the pending hint is
      // simply omitted.
      if (holdsRes.error) {
        console.error("[useOrgEvents] fetch holds failed", holdsRes.error);
      }
      if (rsvpsRes.error) {
        console.error("[useOrgEvents] fetch rsvps failed", rsvpsRes.error);
      }

      const reservedByTier: Record<string, number> = {};
      const reservedByStage: Record<string, number> = {};
      for (const row of (holdsRes.data ?? []) as Array<{
        tier_id: string;
        stage_id: string | null;
        quantity: number | null;
      }>) {
        const qty = row.quantity ?? 0;
        if (row.tier_id) {
          reservedByTier[row.tier_id] = (reservedByTier[row.tier_id] ?? 0) + qty;
        }
        if (row.stage_id) {
          reservedByStage[row.stage_id] =
            (reservedByStage[row.stage_id] ?? 0) + qty;
        }
      }
      for (const row of (rsvpsRes.data ?? []) as Array<{
        ticket_tier_id: string | null;
        stage_id: string | null;
        requested_quantity: number | null;
      }>) {
        const qty = row.requested_quantity ?? 0;
        if (row.ticket_tier_id) {
          reservedByTier[row.ticket_tier_id] =
            (reservedByTier[row.ticket_tier_id] ?? 0) + qty;
        }
        if (row.stage_id) {
          reservedByStage[row.stage_id] =
            (reservedByStage[row.stage_id] ?? 0) + qty;
        }
      }

      for (const event of events) {
        event.ticket_tiers = (event.ticket_tiers ?? []).map(t => ({
          ...t,
          quantity_reserved: reservedByTier[t.id] ?? 0,
          ticket_stages: (t.ticket_stages ?? []).map(s => ({
            ...s,
            quantity_reserved: reservedByStage[s.id] ?? 0,
          })),
        }));
      }

      return events;
    },
    enabled: Boolean(isSignedIn && isConfigured && effectiveOrgId),
    staleTime: 2 * 60 * 1000,
  });
}
