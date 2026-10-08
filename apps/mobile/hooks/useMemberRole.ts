/**
 * Returns the current user's specific role within a given organization.
 *
 * Unlike useUserRole (which checks for ANY actionable membership), this hook
 * returns the exact role for a specific org — used for permission gating
 * within the organizer view.
 */

import { useQuery } from "@tanstack/react-query";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";
import type { OrgMemberRole } from "@project-flame/lib";

export function useMemberRole(orgId: string | null | undefined) {
  const { getToken, isSignedIn, isConfigured, userId } = useOptionalAuth();

  const { data: memberRole = null, isLoading, error, refetch } = useQuery<OrgMemberRole | null>({
    queryKey: ["member-role", userId, orgId],
    queryFn: async () => {
      const client = await getAuthenticatedClient(getToken);

      // Resolve internal user id from clerk_id
      const { data: user, error: userError } = await client
        .from("users")
        .select("id")
        .eq("clerk_id", userId!)
        .maybeSingle();

      if (userError) throw userError;
      if (!user) return null;

      const { data: membership, error: memberError } = await client
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("organization_id", orgId!)
        .maybeSingle();

      if (memberError) {
        console.error("[useMemberRole] query failed", {
          userId,
          orgId,
          error: memberError,
        });
        throw memberError;
      }

      return (membership?.role as OrgMemberRole) ?? null;
    },
    enabled: Boolean(isSignedIn && isConfigured && userId && orgId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return { memberRole, isLoading, error, refetch };
}
