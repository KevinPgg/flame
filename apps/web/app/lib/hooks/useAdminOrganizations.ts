import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";

/**
 * Client hooks for the support-only org-approval surface (W7-H1).
 *
 * The real security boundary is server-side (`SUPPORT_ADMIN_EMAILS` allowlist in
 * `api/admin/_lib.ts`). `useIsSupportAdmin` only decides whether to RENDER the
 * sections and enable the list queries; it also bootstraps the role promotion.
 */
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
  const { isSignedIn, isLoaded, user } = useUser();

  // userId is appended LAST so the cache is partitioned per account (prevents a
  // prior user's admin status leaking after a same-browser account switch),
  // while prefix-based invalidation in useAdminInvalidate still matches.
  const query = useQuery<{ isAdmin: boolean }>({
    queryKey: ["admin", "status", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/admin/status");
      if (!res.ok) throw new Error("Failed to resolve admin status");
      return res.json();
    },
    enabled: Boolean(isSignedIn) && isLoaded,
    staleTime: 5 * 60 * 1000,
  });

  return { isAdmin: query.data?.isAdmin ?? false, isLoading: query.isLoading };
}

export function useAdminOrganizations(status: AdminOrgStatus, enabled: boolean) {
  const { user } = useUser();

  return useQuery<{ organizations: AdminOrganization[] }>({
    queryKey: ["admin", "organizations", status, user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/organizations?status=${status}`);
      if (!res.ok) throw new Error("Failed to fetch organizations");
      return res.json();
    },
    enabled,
  });
}

async function postJson(url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Request failed");
  }
}

/**
 * Shared invalidation after any approve/reject/delete: refresh both admin lists
 * plus the caller's own org list (`["organizations"]`) so their inline view
 * stays in sync.
 */
function useAdminInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin", "organizations", "pending"] });
    qc.invalidateQueries({ queryKey: ["admin", "organizations", "rejected"] });
    qc.invalidateQueries({ queryKey: ["organizations"] });
  };
}

export function useApproveOrg() {
  const invalidate = useAdminInvalidate();
  return useMutation({
    mutationFn: (orgId: string) =>
      postJson(`/api/admin/organizations/${orgId}/approve`),
    onSuccess: invalidate,
  });
}

export function useRejectOrg() {
  const invalidate = useAdminInvalidate();
  return useMutation({
    mutationFn: ({ orgId, reason }: { orgId: string; reason?: string }) =>
      postJson(`/api/admin/organizations/${orgId}/reject`, { reason }),
    onSuccess: invalidate,
  });
}

export function useDeleteOrg() {
  const invalidate = useAdminInvalidate();
  return useMutation({
    mutationFn: async (orgId: string) => {
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to delete organization");
      }
    },
    onSuccess: invalidate,
  });
}
