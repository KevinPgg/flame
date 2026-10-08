/**
 * Debounced search for approved organizations by name.
 *
 * Uses authenticated Supabase client with .ilike for server-side filtering.
 * Excludes specified org IDs (own org + already-added co-hosts).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";
import type { OrganizationPublic } from "@project-flame/lib";
import { isProductionBuild, INTERNAL_ORG_IDS } from "../lib/internal";

interface UseSearchApprovedOrganizationsResult {
  results: OrganizationPublic[];
  searching: boolean;
  error: string | null;
  search: (query: string) => void;
  clearResults: () => void;
}

export function useSearchApprovedOrganizations(
  excludeIds: string[] = []
): UseSearchApprovedOrganizationsResult {
  // Always exclude internal orgs in production builds
  const effectiveExcludeIds = isProductionBuild
    ? [...new Set([...excludeIds, ...INTERNAL_ORG_IDS])]
    : excludeIds;
  const { getToken } = useOptionalAuth();
  const [results, setResults] = useState<OrganizationPublic[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excludeRef = useRef(effectiveExcludeIds);
  excludeRef.current = effectiveExcludeIds;
  // Incrementing token to discard responses from superseded requests
  const requestIdRef = useRef(0);

  const search = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = query.trim();
      if (!trimmed) {
        // Invalidate any in-flight request so its response is ignored
        requestIdRef.current += 1;
        setResults([]);
        setError(null);
        setSearching(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        const requestId = ++requestIdRef.current;
        setSearching(true);
        setError(null);
        try {
          const client = await getAuthenticatedClient(getToken);
          let queryBuilder = client
            .from("organizations")
            .select(
              "id, name, slug, logo_url, cover_image_url, description, instagram_handle, city"
            )
            .eq("approved", true)
            .ilike("name", `%${trimmed}%`)
            .order("name", { ascending: true })
            .limit(20);

          // Exclude specified org IDs
          if (excludeRef.current.length > 0) {
            queryBuilder = queryBuilder.not(
              "id",
              "in",
              `(${excludeRef.current.join(",")})`
            );
          }

          const { data, error: queryError } = await queryBuilder;

          // Discard if a newer request was issued while this one was in-flight
          if (requestId !== requestIdRef.current) return;

          if (queryError) throw queryError;
          setResults((data ?? []) as OrganizationPublic[]);
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          setError(
            err instanceof Error ? err.message : "Search failed."
          );
          setResults([]);
        } finally {
          if (requestId === requestIdRef.current) {
            setSearching(false);
          }
        }
      }, 350);
    },
    [getToken]
  );

  const clearResults = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    setResults([]);
    setError(null);
    setSearching(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { results, searching, error, search, clearResults };
}
