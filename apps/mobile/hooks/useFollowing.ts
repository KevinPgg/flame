/**
 * Organizations you follow, in the app — fase 4.2 (2026-11-02). Same API as the web
 * (GET/PUT /api/me/following; public counts at /api/organizations/followers). React Query:
 * ["me","following"] for the list (You), ["org-followers", id] for a profile's count. The button
 * is optimistic (list and count move at once) and goes back if the API says no.
 * Signed out → sign in.
 */
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { apiClient, apiGet, apiGetPublic } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export type FollowedOrg = { id: string; name: string; slug: string; logo_url: string | null; city: string | null; followers_count: number };
export const FOLLOWING_KEY = ["me", "following"] as const;
const countKey = (orgId: string) => ["org-followers", orgId] as const;

export function useFollowing() {
  const { isSignedIn, getToken } = useOptionalAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const query = useQuery({
    queryKey: FOLLOWING_KEY,
    enabled: isSignedIn === true,
    staleTime: 60_000,
    queryFn: async () => (await apiGet<{ organizations: FollowedOrg[] }>("/api/me/following", getToken))?.organizations ?? [],
  });
  const orgs = useMemo(() => query.data ?? [], [query.data]);
  const ids = useMemo(() => new Set(orgs.map((o) => o.id)), [orgs]);

  const toggle = useCallback(
    async (org: { id: string; name: string } & Partial<FollowedOrg>, follow: boolean) => {
      if (isSignedIn !== true) {
        router.push("/sign-in" as Href);
        return;
      }
      const beforeList = qc.getQueryData<FollowedOrg[]>(FOLLOWING_KEY);
      const beforeCount = qc.getQueryData<number>(countKey(org.id));
      const nextCount = beforeCount === undefined ? undefined : Math.max(0, beforeCount + (follow ? 1 : -1));
      if (nextCount !== undefined) qc.setQueryData(countKey(org.id), nextCount);
      const full: FollowedOrg | null = org.slug
        ? { id: org.id, name: org.name, slug: org.slug, logo_url: org.logo_url ?? null, city: org.city ?? null, followers_count: nextCount ?? org.followers_count ?? 0 }
        : null;
      qc.setQueryData<FollowedOrg[]>(FOLLOWING_KEY, (old = []) =>
        follow ? (full ? [full, ...old.filter((o) => o.id !== org.id)] : old) : old.filter((o) => o.id !== org.id)
      );
      try {
        const res = await apiClient<{ followers_count: number }>("/api/me/following", {
          method: "PUT",
          body: JSON.stringify({ organization_id: org.id, following: follow }),
          getToken,
        });
        const n = res?.followers_count;
        if (typeof n === "number") {
          qc.setQueryData(countKey(org.id), n);
          qc.setQueryData<FollowedOrg[]>(FOLLOWING_KEY, (old = []) => old.map((o) => (o.id === org.id ? { ...o, followers_count: n } : o)));
        }
        if (follow && !full) void qc.invalidateQueries({ queryKey: FOLLOWING_KEY });
      } catch {
        qc.setQueryData(FOLLOWING_KEY, beforeList ?? []);
        if (beforeCount !== undefined) qc.setQueryData(countKey(org.id), beforeCount);
      }
    },
    [isSignedIn, getToken, qc, router]
  );

  return {
    orgs,
    isLoading: query.isLoading && isSignedIn === true,
    isFollowing: (id: string) => ids.has(id),
    toggle,
    refetch: query.refetch,
  };
}

/** Public follower count of one organization (profile). */
export function useFollowerCount(orgId: string | undefined) {
  return useQuery({
    queryKey: countKey(orgId ?? ""),
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => (await apiGetPublic<{ counts: Record<string, number> }>(`/api/organizations/followers?ids=${orgId}`))?.counts?.[orgId!] ?? 0,
  });
}

/** Public follower counts of many organizations (Explore cards), 50 ids per request. */
export function useFollowerCounts(orgIds: string[]) {
  const ids = [...new Set(orgIds)].sort();
  return useQuery({
    queryKey: ["org-followers-many", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const res = await apiGetPublic<{ counts: Record<string, number> }>(`/api/organizations/followers?ids=${chunk.join(",")}`);
        Object.assign(out, res?.counts ?? {});
      }
      return out;
    },
  });
}
