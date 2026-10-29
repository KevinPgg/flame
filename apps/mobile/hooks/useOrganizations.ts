import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { latestFlyers, type OrganizationPublic } from "@project-flame/lib";
import { isProductionBuild, INTERNAL_ORG_IDS } from "../lib/internal";

/**
 * Fetches all approved organizations (public data — no auth required).
 * Used by ExploreOrganizers on the home screen and the filter bottom sheet.
 * Internal orgs (FLAME) are excluded from production builds.
 */
export function useOrganizations() {
  return useQuery<Array<OrganizationPublic & { last_flyer_url?: string | null }>>({
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

      const orgs = (data ?? []) as OrganizationPublic[];
      if (orgs.length === 0) return orgs;
      // Kevin 2026-10-29: an organizer without upcoming events shows its latest event's flyer.
      const { data: evs, error: evError } = await supabase
        .from("events")
        .select("organization_id, image_url, starts_at")
        .in("organization_id", orgs.map((o) => o.id))
        .eq("status", "published")
        .not("image_url", "is", null)
        .order("starts_at", { ascending: false })
        .limit(1000);
      if (evError) {
        console.error("[useOrganizations] latest flyers query failed:", evError);
        return orgs;
      }
      const flyers = latestFlyers(evs ?? []);
      return orgs.map((o) => ({ ...o, last_flyer_url: flyers[o.id] ?? null }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
