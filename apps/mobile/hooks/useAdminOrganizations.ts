/**
 * Client hooks for the support-only org-approval surface (W7-H1).
 *
 * Mirrors the web hooks in `apps/web/app/lib/hooks/useAdminOrganizations.ts`.
 * The pending/rejected lists are service-role-only on the backend (must NOT be
 * reachable via member RLS), so — unlike most mobile reads — these go through
 * the admin-gated web API via `lib/api.ts`, not direct Supabase. The
 * `SUPPORT_ADMIN_EMAILS` allowlist on the server is the real boundary; the
 * client gate only decides whether to render the sections.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export type AdminOrgStatus = "pending" | "rejected";

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  rejected_at: string | null;
  rejection_reason: string | null;
  owner_email: string | null;
  owner_name: string | null;
}

export function useIsSupportAdmin() {
  const { getToken, isSignedIn, isConfigured, userId } = useOptionalAuth();

  const query = useQuery<{ isAdmin: boolean }>({
    queryKey: ["admin", "status", userId],
    queryFn: () => apiGet<{ isAdmin: boolean }>("/api/admin/status", getToken),
    enabled: Boolean(isSignedIn) && isConfigured,
    staleTime: 5 * 60 * 1000,
  });

  return { isAdmin: query.data?.isAdmin ?? false, isLoading: query.isLoading };
}

export function useAdminOrganizations(status: AdminOrgStatus, enabled: boolean) {
  const { getToken, userId } = useOptionalAuth();

  // userId LAST so the cache is partitioned per account (account-switch leak)
  // while the prefix invalidation in useAdminInvalidate still matches.
  return useQuery<{ organizations: AdminOrganization[] }>({
    queryKey: ["admin", "organizations", status, userId],
    queryFn: () =>
      apiGet<{ organizations: AdminOrganization[] }>(
        `/api/admin/organizations?status=${status}`,
        getToken,
      ),
    enabled,
  });
}

/** Refresh both admin lists plus the caller's own org list after any action. */
function useAdminInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "organizations", "pending"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "organizations", "rejected"] });
    queryClient.invalidateQueries({ queryKey: ["user-orgs"] });
  };
}

export function useApproveOrg() {
  const { getToken } = useOptionalAuth();
  const invalidate = useAdminInvalidate();
  return useMutation<{ success: boolean }, ApiError, string>({
    mutationFn: (orgId) =>
      apiPost<{ success: boolean }>(
        `/api/admin/organizations/${orgId}/approve`,
        {},
        getToken,
      ),
    onSuccess: invalidate,
  });
}

export function useRejectOrg() {
  const { getToken } = useOptionalAuth();
  const invalidate = useAdminInvalidate();
  return useMutation<{ success: boolean }, ApiError, { orgId: string; reason?: string }>({
    mutationFn: ({ orgId, reason }) =>
      apiPost<{ success: boolean }>(
        `/api/admin/organizations/${orgId}/reject`,
        { reason },
        getToken,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteOrg() {
  const { getToken } = useOptionalAuth();
  const invalidate = useAdminInvalidate();
  return useMutation<{ success: boolean }, ApiError, string>({
    mutationFn: (orgId) =>
      apiDelete<{ success: boolean }>(`/api/admin/organizations/${orgId}`, getToken),
    onSuccess: invalidate,
  });
}
