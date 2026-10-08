import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { OrganizationPublic } from "@project-flame/lib";
import { isProductionBuild, INTERNAL_ORG_IDS } from "../lib/internal";

/**
 * Fetches all approved organizations (public data — no auth required).
 * Used by ExploreOrganizers on the home screen and the filter bottom sheet.
 * Internal orgs (FLAME) are excluded from production builds.
 */
export function useOrganizations() {
  return useQuery<OrganizationPublic[]>({
    queryKey: ["organizations", "approved"],
    queryFn: async () => {
      let query = supabase
        .from("organizations")
        .select("id, name, slug, logo_url, cover_image_url, description, instagram_handle, city")
        .eq("approved", true)
        .order("name", { ascending: true });

      if (isProductionBuild) {
        query = query.not("id", "in", `(${INTERNAL_ORG_IDS.join(",")})`);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[useOrganizations] query failed:", error);
        throw error;
      }

      return (data ?? []) as OrganizationPublic[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
