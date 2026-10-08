/**
 * Fetches the current user's role and organization status.
 *
 * Queries Supabase directly using a Clerk-issued "supabase" JWT.
 * RLS policies automatically scope results to the authenticated user.
 *
 * Web source-of-truth: apps/web/app/lib/roles.ts (getUserRole, getUserOrganization)
 */

import { useQuery } from "@tanstack/react-query";
import { createAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";
import type { OrgMemberRole } from "@project-flame/lib";

export type UserRole = "user" | "org";

type DbRole = "user" | "organizer" | "admin";

function normalizeDbRole(raw: unknown): DbRole {
  if (raw === "organizer" || raw === "admin") return raw;
  return "user";
}

/** Roles that grant access to the hosting/organizer view toggle. */
const HOSTING_ROLES: OrgMemberRole[] = ["owner", "admin", "organizer"];

export function useUserRole(): {
  role: UserRole;
  memberRole: OrgMemberRole | null;
  hasUnapprovedOrg: boolean;
  isLoading: boolean;
} {
  const { getToken, isSignedIn, isConfigured, userId } = useOptionalAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["user-role", userId],
    queryFn: async () => {
      // Guard against sign-out race: Clerk invalidates the session internally
      // before isSignedIn transitions to false in React state. During this
      // window getToken({ template: "supabase" }) returns null even though
      // enabled is still true. A null return is expected — return the default
      // unauthenticated state silently. Any other exception is unexpected and
      // should propagate so React Query can retry/surface it.
      let supabaseToken: string | null;
      try {
        supabaseToken = await getToken({ template: "supabase" });
      } catch (tokenErr) {
        console.error("[useUserRole] getToken threw unexpectedly", {
          template: "supabase",
          error: tokenErr instanceof Error ? tokenErr.stack : tokenErr,
        });
        throw tokenErr;
      }
      if (!supabaseToken) {
        return {
          role: "user" as const,
          hasOrganization: false,
          hasUnapprovedOrg: false,
          memberRole: null as OrgMemberRole | null,
        };
      }

      // Wrap primary fetch to surface contextual error metadata for triage.
      const { client, user } = await (async () => {
        try {
          const c = createAuthenticatedClient(supabaseToken);
          const { data: u, error: userError } = await c
            .from("users")
            .select("id, role")
            .eq("clerk_id", userId!)
            .maybeSingle();
          if (userError) throw userError;
          return { client: c, user: u as { id: string; role: unknown } | null };
        } catch (e) {
          console.error("[useUserRole] user-role fetch failed", {
            action: "fetch-user-role",
            userId,
            error: e instanceof Error ? e.stack : e,
          });
          throw e;
        }
      })();

      if (!user)
        return {
          role: "user" as const,
          hasOrganization: false,
          hasUnapprovedOrg: false,
          memberRole: null as OrgMemberRole | null,
        };

      const dbRole: DbRole = normalizeDbRole(user.role);

      // Fetch all hosting-role memberships, then check which orgs are approved.
      // Only approved orgs grant access to the organizer view.
      let hasOrganization = false;
      let hasUnapprovedOrg = false;
      let memberRole: OrgMemberRole | null = null;
      try {
        const { data: memberships, error: membershipError } = await client
          .from("organization_members")
          .select("organization_id, role")
          .eq("user_id", user.id)
          .in("role", HOSTING_ROLES);

        // Throw on DB errors so React Query marks the query as failed rather
        // than caching an incorrect access state (org users would be silently
        // downgraded to "user" role on any transient DB error).
        if (membershipError) throw membershipError;

        if (memberships && memberships.length > 0) {
          // Check which orgs are approved to avoid showing hosting view for
          // unapproved organizations.
          const orgIds = memberships.map((m) => m.organization_id);
          const { data: orgs, error: orgsError } = await client
            .from("organizations")
            .select("id, approved")
            .in("id", orgIds);

          if (orgsError) throw orgsError;

          const approvedMembership = memberships.find((m) =>
            orgs.some((o) => o.id === m.organization_id && o.approved),
          );

          if (approvedMembership) {
            hasOrganization = true;
            memberRole = approvedMembership.role as OrgMemberRole;
          }

          hasUnapprovedOrg = memberships.some((m) =>
            orgs.some((o) => o.id === m.organization_id && !o.approved),
          );
        }
      } catch (e) {
        console.error("[useUserRole] org membership/approval fetch failed", {
          action: "fetch_organization_membership",
          userId,
          error: e instanceof Error ? e.stack : e,
        });
        // Re-throw so React Query marks this query as errored instead of
        // returning stale/incorrect org-access state to consumers.
        throw e;
      }

      return {
        role: dbRole,
        hasOrganization,
        hasUnapprovedOrg,
        memberRole,
      };
    },
    enabled: Boolean(isSignedIn && isConfigured && userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });

  // Only grant org view if the user actually has an approved organization.
  // DB role alone ("organizer"/"admin") is not sufficient — the org must be approved.
  const role: UserRole = data?.hasOrganization ? "org" : "user";

  return {
    role,
    memberRole: data?.memberRole ?? null,
    hasUnapprovedOrg: data?.hasUnapprovedOrg ?? false,
    isLoading,
  };
}
