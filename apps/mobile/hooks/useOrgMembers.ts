/**
 * Fetches all members of an organization with joined user details.
 *
 * Uses the get_org_members_with_profiles RPC (SECURITY DEFINER) which
 * returns only safe profile columns (id, first_name, last_name, email) —
 * no PII fields from the users table are exposed to the caller.
 *
 * Returns members sorted by role priority (owner first) then by name.
 */

import { useQuery } from "@tanstack/react-query";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";
import type { OrganizationMember, OrgMemberRole } from "@project-flame/lib";

const ROLE_PRIORITY: Record<OrgMemberRole, number> = {
  owner: 0,
  admin: 1,
  organizer: 2,
  viewer: 3,
};

export function useOrgMembers(orgId: string | null | undefined) {
  const { getToken, isSignedIn, isConfigured } = useOptionalAuth();

  return useQuery<OrganizationMember[]>({
    queryKey: ["org-members", orgId],
    queryFn: async () => {
      const client = await getAuthenticatedClient(getToken);

      const { data, error } = await client.rpc("get_org_members_with_profiles", {
        p_org_id: orgId!,
      });

      if (error) throw error;

      const members = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        user_id: row.user_id as string,
        organization_id: row.organization_id as string,
        role: row.role as OrganizationMember["role"],
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        user_email: (row.user_email as string) ?? undefined,
        user_first_name: (row.user_first_name as string) ?? null,
        user_last_name: (row.user_last_name as string) ?? null,
      })) satisfies OrganizationMember[];

      // Sort by role priority (owner → admin → organizer → viewer),
      // then alphabetically by first name within the same role.
      return members.sort((a, b) => {
        const roleDiff =
          (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99);
        if (roleDiff !== 0) return roleDiff;
        const nameA = (a.user_first_name ?? a.user_email ?? "").toLowerCase();
        const nameB = (b.user_first_name ?? b.user_email ?? "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    },
    enabled: Boolean(isSignedIn && isConfigured && orgId),
    staleTime: 2 * 60 * 1000,
  });
}
