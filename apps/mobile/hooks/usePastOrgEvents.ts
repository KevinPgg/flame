import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { EventSchema } from "@project-flame/lib";
import type { Event } from "@project-flame/lib";
import type { EventCardData } from "@project-flame/ui";
import { mapEventToCardData } from "./useAppEvents";

const PAST_EVENTS_SELECT = `
  *,
  organizations(name, slug),
  ticket_tiers(
    id, price_cents, quantity_total, quantity_sold,
    per_user_limit, sales_start, sales_end,
    ticket_stages(id, name, price_cents, quantity, sold_quantity, order_index)
  )
`;

/**
 * Fetches past (ended) published events for a specific organization. Includes
 * events the org owns AND events it co-hosts (via event_assignments).
 *
 * Ordered most-recent-first so the user sees the newest past events at the top.
 * Uses the anon client — published events are public, cohost links are public
 * for published events via `Anyone can view cohost links for published events`.
 */
export function usePastOrgEvents(orgId: string | null | undefined) {
  return useQuery<EventCardData[]>({
    queryKey: ["past-org-events", orgId ?? null],
    queryFn: async () => {
      if (!orgId) return [];

      const now = new Date().toISOString();

      // Fetch cohost event IDs first; merge into the main filter.
      const { data: cohostRows } = await supabase
        .from("event_assignments")
        .select("event_id")
        .eq("cohost_organization_id", orgId);

      const cohostEventIds = (cohostRows ?? []).map(r => r.event_id as string);

      const baseQuery = supabase
        .from("events")
        .select(PAST_EVENTS_SELECT)
        .eq("status", "published")
        .lte("ends_at", now)
        .order("starts_at", { ascending: false });

      const { data, error } =
        cohostEventIds.length > 0
          ? await baseQuery.or(
              `organization_id.eq.${orgId},id.in.(${cohostEventIds.join(",")})`,
            )
          : await baseQuery.eq("organization_id", orgId);

      if (error) throw error;

      const result = z.array(EventSchema).safeParse(data);
      if (!result.success) {
        console.error("[usePastOrgEvents] Validation failed:", result.error);
        throw new Error("Failed to validate past org events");
      }

      return (result.data as Event[]).map(mapEventToCardData);
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}
