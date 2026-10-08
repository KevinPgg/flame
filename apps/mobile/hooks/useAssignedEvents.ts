/**
 * Fetches events assigned to the current user (for organizer-role members).
 *
 * Returns current & upcoming events only — organizers don't need to see
 * past events they were assigned to.
 *
 * Covers both:
 * - Direct user assignments (user_id = current user)
 * - Co-host org assignments (cohost_organization_id in user's orgs)
 */

import { useQuery } from "@tanstack/react-query";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";

function computeTierAttendees(tiers: AssignedEventTier[]): number {
  return tiers.reduce((sum, t) => {
    if (t.ticket_stages && t.ticket_stages.length > 0) {
      return sum + t.ticket_stages.reduce((s, st) => s + (st.sold_quantity || 0), 0);
    }
    return sum + (t.quantity_sold || 0);
  }, 0);
}

function computeTierRevenueCents(tiers: AssignedEventTier[]): number {
  return tiers.reduce((sum, t) => {
    if (t.ticket_stages && t.ticket_stages.length > 0) {
      return sum + t.ticket_stages.reduce(
        (s, st) => s + (st.sold_quantity || 0) * (st.price_cents || 0), 0
      );
    }
    return sum + (t.quantity_sold || 0) * (t.price_cents || 0);
  }, 0);
}

interface AssignedEventTierStage {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  sold_quantity: number;
  order_index: number;
}

interface AssignedEventTier {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  per_user_limit: number;
  sales_start: string;
  sales_end: string;
  order_index: number;
  ticket_stages?: AssignedEventTierStage[];
}

export interface AssignedEvent {
  id: string;
  name: string;
  slug: string;
  city: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  status: string;
  timezone: string;
  currency: string;
  organization_id: string;
  /** The org through which this assignment was made: cohost_organization_id when
   *  the user's org is a co-host, otherwise the event's owner organization_id.
   *  Use this (not organization_id) to scope events to the active org in the UI. */
  assignmentOrgId: string;
  source_org_name: string;
  cohost_org_name?: string;
  is_cohost: boolean;
  attendees: number;
  revenueCents: number;
}

export function useAssignedEvents(
  userId: string | null | undefined,
  orgId: string | null | undefined
) {
  const { getToken, isSignedIn, isConfigured } = useOptionalAuth();

  return useQuery<AssignedEvent[]>({
    queryKey: ["assigned-events", userId, orgId],
    queryFn: async () => {
      const client = await getAuthenticatedClient(getToken);

      // Resolve internal user id from clerk_id
      const { data: user, error: userError } = await client
        .from("users")
        .select("id")
        .eq("clerk_id", userId!)
        .maybeSingle();

      if (userError) throw userError;
      // Do NOT early-return here — the co-host org query below is independent of
      // the users row. A missing user row (e.g. mid-sync) should still allow
      // co-host events to load.

      const now = new Date().toISOString();

      // Fetch direct user assignments (only when we have an internal user row)
      let userAssignments: Record<string, unknown>[] = [];
      if (user) {
        const { data: directData, error: userAssignError } = await client
          .from("event_assignments")
          .select(
            `
            id,
            event_id,
            organization_id,
            cohost_organization_id,
            events:event_id (
              id, name, slug, city, venue, starts_at, ends_at,
              image_url, status, timezone, organization_id, currency,
              ticket_tiers (
                id, name, price_cents, quantity_total, quantity_sold,
                per_user_limit, sales_start, sales_end, order_index,
                ticket_stages (
                  id, name, price_cents, quantity, sold_quantity, order_index
                )
              )
            ),
            source_org:organization_id ( name )
          `
          )
          .eq("user_id", user.id)
          .not("events.ends_at", "lt", now);

        if (userAssignError) throw userAssignError;
        userAssignments = (directData ?? []) as Record<string, unknown>[];
      }

      // Fetch co-host org assignments (where the user's org is the co-host)
      let cohostAssignments: Record<string, unknown>[] = [];
      if (orgId) {
        const { data: cohostData, error: cohostError } = await client
          .from("event_assignments")
          .select(
            `
            id,
            event_id,
            organization_id,
            cohost_organization_id,
            events:event_id (
              id, name, slug, city, venue, starts_at, ends_at,
              image_url, status, timezone, organization_id, currency,
              ticket_tiers (
                id, name, price_cents, quantity_total, quantity_sold,
                per_user_limit, sales_start, sales_end, order_index,
                ticket_stages (
                  id, name, price_cents, quantity, sold_quantity, order_index
                )
              )
            ),
            source_org:organization_id ( name ),
            cohost_org:cohost_organization_id ( name )
          `
          )
          .eq("cohost_organization_id", orgId)
          .not("events.ends_at", "lt", now);

        if (cohostError) throw cohostError;
        cohostAssignments = (cohostData ?? []) as Record<string, unknown>[];
      }

      const allAssignments = [...userAssignments, ...cohostAssignments];

      // Deduplicate by event_id. A user can be both directly assigned AND part
      // of a co-host org for the same event. When that happens, merge the two
      // rows so the existing entry gets is_cohost=true and cohost_org_name filled
      // in rather than silently dropping the second row.
      const seen = new Set<string>();
      const results: AssignedEvent[] = [];

      for (const row of allAssignments) {
        const event = row.events as Record<string, unknown> | null;
        if (!event) continue;

        const eventId = event.id as string;
        const sourceOrg = row.source_org as Record<string, unknown> | null;
        const cohostOrg = row.cohost_org as Record<string, unknown> | null;
        const isCohostRow = row.cohost_organization_id != null;

        if (seen.has(eventId)) {
          const existing = results.find((r) => r.id === eventId);
          if (existing && isCohostRow) {
            existing.is_cohost = true;
            existing.cohost_org_name =
              (cohostOrg?.name as string) ??
              existing.cohost_org_name;
            // Update assignmentOrgId so the simplified dashboard filter
            // (e.assignmentOrgId === selectedOrgId) matches the co-host org
            // when the user's org is the co-host and the event was first seen
            // via a direct user-assignment row (which carries the owner org id).
            existing.assignmentOrgId = row.cohost_organization_id as string;
            if (!existing.image_url && event.image_url) {
              existing.image_url = event.image_url as string;
            }
            if (!existing.source_org_name && sourceOrg?.name) {
              existing.source_org_name = sourceOrg.name as string;
            }
          }
          continue;
        }

        const tiers = (event.ticket_tiers ?? []) as AssignedEventTier[];
        const attendees = computeTierAttendees(tiers);
        const revenueCents = computeTierRevenueCents(tiers);

        seen.add(eventId);
        results.push({
          id: eventId,
          name: event.name as string,
          slug: event.slug as string,
          city: event.city as string,
          venue: event.venue as string,
          starts_at: event.starts_at as string,
          ends_at: event.ends_at as string,
          image_url: (event.image_url as string) ?? null,
          status: event.status as string,
          timezone: event.timezone as string,
          currency: (event.currency as string) ?? "USD",
          organization_id: event.organization_id as string,
          assignmentOrgId: (row.cohost_organization_id as string) ?? (row.organization_id as string),
          source_org_name: (sourceOrg?.name as string) ?? "",
          cohost_org_name: (cohostOrg?.name as string) ?? undefined,
          is_cohost: isCohostRow,
          attendees,
          revenueCents,
        });
      }

      // Sort by starts_at ascending
      results.sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      );

      return results;
    },
    enabled: Boolean(isSignedIn && isConfigured && userId),
    staleTime: 2 * 60 * 1000,
  });
}
