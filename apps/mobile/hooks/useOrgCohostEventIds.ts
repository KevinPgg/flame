/**
 * Returns the set of event IDs where the given org appears as a cohost.
 *
 * Used by the public organizer profile screen (`organizer/[slug].tsx`) so
 * cohosted events appear alongside owned events. Uses the anon client —
 * event_assignments is readable when either side is one of the user's orgs,
 * OR via the same RLS path that exposes the assignments to the public profile
 * SSR fetch on web. Returns an empty Set if unauthorised / no rows.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export function useOrgCohostEventIds(orgId: string | null | undefined) {
  return useQuery<Set<string>>({
    queryKey: ["org-cohost-event-ids", orgId ?? null],
    queryFn: async () => {
      if (!orgId) return new Set();

      const { data, error } = await supabase
        .from("event_assignments")
        .select("event_id")
        .eq("cohost_organization_id", orgId);

      // RLS may filter rows out for non-members — that's fine, profile page
      // simply doesn't render the corresponding cohost events for them.
      if (error) {
        console.error("[useOrgCohostEventIds] fetch failed", error);
        return new Set();
      }

      return new Set((data ?? []).map(r => r.event_id as string));
    },
    enabled: Boolean(orgId),
    staleTime: 5 * 60 * 1000,
  });
}
