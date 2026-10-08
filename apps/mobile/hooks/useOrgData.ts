/**
 * Fetches the current user's organization data.
 *
 * Queries Supabase directly using a Clerk-issued "supabase" JWT.
 * RLS policies scope results to the authenticated user.
 *
 * Web source-of-truth: apps/web/app/lib/roles.ts, apps/web/app/api/stripe/connect/status/route.ts
 */

import { useQuery } from "@tanstack/react-query";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";

export interface OrgData {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  memberRole: string;
  approved: boolean;
  stripeAccountId: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  description: string | null;
  instagramHandle: string | null;
  city: string | null;
}

export function useOrgData(orgId?: string | null) {
  const { getToken, isSignedIn, isConfigured, userId } = useOptionalAuth();

  return useQuery<OrgData | null>({
    queryKey: ["org-data", userId, orgId ?? null],
    queryFn: async () => {
      const client = await getAuthenticatedClient(getToken);

      const { data: user, error: userError } = await client
        .from("users")
        .select("id")
        .eq("clerk_id", userId!)
        .maybeSingle();

      if (userError) throw userError;
      if (!user) return null;

      // When a specific orgId is provided, look up that org's membership directly.
      // Otherwise fall back to the oldest membership (single-org default behaviour).
      let membershipQuery = client
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", user.id);

      if (orgId) {
        membershipQuery = membershipQuery.eq("organization_id", orgId) as typeof membershipQuery;
      } else {
        membershipQuery = membershipQuery.order("created_at", { ascending: true }).limit(1) as typeof membershipQuery;
      }

      const { data: membership, error: memberError } = await membershipQuery.maybeSingle();

      if (memberError) {
        console.error("[useOrgData] membership query failed", { userId, error: memberError });
        throw memberError;
      }
      if (!membership) return null;

      const { data: org, error: orgError } = await client
        .from("organizations")
        .select("id, name, slug, approved, stripe_account_id, logo_url, cover_image_url, description, instagram_handle, city")
        .eq("id", membership.organization_id)
        .maybeSingle();

      if (orgError) {
        console.error("[useOrgData] organization query failed", {
          userId,
          organizationId: membership.organization_id,
          error: orgError,
        });
        throw orgError;
      }
      if (!org) return null;

      return {
        organizationId: org.id as string,
        organizationName: org.name as string,
        organizationSlug: org.slug as string,
        memberRole: membership.role as string,
        approved: Boolean(org.approved),
        stripeAccountId: (org.stripe_account_id as string) ?? null,
        logoUrl: (org.logo_url as string) ?? null,
        coverImageUrl: (org.cover_image_url as string) ?? null,
        description: (org.description as string) ?? null,
        instagramHandle: (org.instagram_handle as string) ?? null,
        city: (org.city as string) ?? null,
      };
    },
    enabled: Boolean(isSignedIn && isConfigured && userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
