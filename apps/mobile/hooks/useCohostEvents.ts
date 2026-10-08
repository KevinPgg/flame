/**
 * Fetches events where the given org is a co-host.
 *
 * Queries event_assignments where cohost_organization_id = orgId,
 * joined with events for display data. Returns full event data
 * so cards can render identically to owned events.
 */

import { useQuery } from "@tanstack/react-query";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";
import type { OrgEvent } from "./useOrgEvents";

export interface CohostEvent {
  /** The event data */
  event: OrgEvent;
  /** The owning org's name (for "Co-host with X" badge) */
  ownerOrgName: string;
  /** The assignment ID (for reference) */
  assignmentId: string;
}

export function useCohostEvents(orgId: string | null | undefined) {
  const { getToken, isSignedIn, isConfigured } = useOptionalAuth();

  return useQuery<CohostEvent[]>({
    queryKey: ["cohost-events", orgId],
    queryFn: async () => {
      const client = await getAuthenticatedClient(getToken);

      const { data, error } = await client
        .from("event_assignments")
        .select(
          `
          id,
          event_id,
          organization_id,
          source_org:organization_id ( name ),
          events:event_id (
            id, organization_id, name, slug, city, venue,
            starts_at, ends_at, description, image_url, status,
            requires_rsvp, created_at, updated_at, timezone, currency,
            qr_scanner_code, registration_form_config,
            ticket_tiers (
              id, name, price_cents, quantity_total, quantity_sold,
              per_user_limit, sales_start, sales_end, order_index,
              ticket_stages (
                id, name, price_cents, quantity, sold_quantity, order_index
              )
            )
          )
        `
        )
        .eq("cohost_organization_id", orgId!);

      if (error) throw error;

      return (data ?? [])
        .map((row: Record<string, unknown>) => {
          const event = row.events as Record<string, unknown> | null;
          const sourceOrg = row.source_org as Record<string, unknown> | null;
          if (!event) return null;
          return {
            event: event as unknown as OrgEvent,
            ownerOrgName: (sourceOrg?.name as string) ?? "Unknown",
            assignmentId: row.id as string,
          };
        })
        .filter(Boolean) as CohostEvent[];
    },
    enabled: Boolean(isSignedIn && isConfigured && orgId),
    staleTime: 2 * 60 * 1000,
  });
}
