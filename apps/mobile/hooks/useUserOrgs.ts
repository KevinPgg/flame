/**
 * Fetches ALL organizations the current user belongs to.
 *
 * Unlike useOrgData (which returns only the first org), this returns
 * every org membership — used for multi-org selection UI (e.g. scanner).
 */

import { useQuery } from "@tanstack/react-query";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";

export interface UserOrg {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  memberRole: string;
  approved: boolean;
  logoUrl: string | null;
  eventCount: number;
}

export function useUserOrgs() {
  const { getToken, isSignedIn, isConfigured, userId } = useOptionalAuth();

  return useQuery<UserOrg[]>({
    queryKey: ["user-orgs", userId],
    queryFn: async (): Promise<UserOrg[]> => {
      const client = await getAuthenticatedClient(getToken);

      const { data: user, error: userError } = await client
        .from("users")
        .select("id")
        .eq("clerk_id", userId!)
        .maybeSingle();

      if (userError) throw userError;
      if (!user) return [];

      const { data: memberships, error: memberError } = await client
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (memberError) throw memberError;
      if (!memberships || memberships.length === 0) return [];

      const orgIds = memberships.map((m) => m.organization_id as string);

      const { data: orgs, error: orgError } = await client
        .from("organizations")
        .select("id, name, slug, approved, rejected_at, logo_url, events(count)")
        .in("id", orgIds);

      if (orgError) throw orgError;

      const orgMap = new Map(
        (orgs ?? []).map((o) => [o.id as string, o]),
      );

      // Count cohosted events per org so the "N events" pill on profile
      // matches the dashboard listing (which merges owned + cohosted).
      const { data: cohostRows } = await client
        .from("event_assignments")
        .select("cohost_organization_id")
        .in("cohost_organization_id", orgIds)
        .not("cohost_organization_id", "is", null);

      const cohostCountByOrg = new Map<string, number>();
      for (const row of (cohostRows ?? []) as Array<{ cohost_organization_id: string }>) {
        const id = row.cohost_organization_id;
        cohostCountByOrg.set(id, (cohostCountByOrg.get(id) ?? 0) + 1);
      }

      return memberships
        .map((m): UserOrg | null => {
          const org = orgMap.get(m.organization_id as string);
          // Hide rejected orgs from "My Organizers" — a rejected org should
          // disappear, not linger as "Pending approval" (W7-H1 QA).
          if (!org || (org as { rejected_at?: string | null }).rejected_at) {
            return null;
          }
          const eventsAgg = (org as { events?: Array<{ count: number }> }).events;
          const rawCount = Array.isArray(eventsAgg)
            ? eventsAgg[0]?.count
            : undefined;
          const ownedCount = typeof rawCount === "number" ? rawCount : 0;
          const cohostCount = cohostCountByOrg.get(org.id as string) ?? 0;
          return {
            organizationId: org.id as string,
            organizationName: org.name as string,
            organizationSlug: org.slug as string,
            memberRole: m.role as string,
            approved: Boolean(org.approved),
            logoUrl: (org.logo_url as string) ?? null,
            eventCount: ownedCount + cohostCount,
          };
        })
        .filter((o): o is UserOrg => o !== null);
    },
    enabled: Boolean(isSignedIn && isConfigured && userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
