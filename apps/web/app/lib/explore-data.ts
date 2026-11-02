/**
 * Organizers for the Flame 2.0 Explore (fase 2.5): approved organizations, same filter as the
 * v1 /discover (internal orgs hidden in production), with cover and city for the cards and
 * the search. Events come from getHomeEvents (same upcoming list as the Home).
 */
import { unstable_cache } from "next/cache";
import { INTERNAL_ORG_IDS, latestFlyers } from "@project-flame/lib";
import { supabaseAdmin } from "./supabase/server";
import { followerCounts } from "./follows";
import { isProduction } from "./utils/environment";

export type ExploreOrganizer = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_image_url: string | null;
  city: string | null;
  /** Flyer of its latest published event (card background when nothing is upcoming). */
  last_flyer_url?: string | null;
  /** Fase 4.4: people following it (count only). */
  followers_count?: number;
};

async function fetchExploreOrganizers(): Promise<ExploreOrganizer[]> {
  if (!supabaseAdmin) return [];
  let q = supabaseAdmin
    .from("organizations")
    .select("id, name, slug, logo_url, cover_image_url, city")
    .eq("approved", true)
    .order("name", { ascending: true })
    .limit(60);
  if (isProduction()) q = q.not("id", "in", `(${INTERNAL_ORG_IDS.join(",")})`);
  const { data, error } = await q;
  if (error) {
    console.error("[explore-data] organizations query failed", error);
    throw error;
  }
  const orgs = (data ?? []) as ExploreOrganizer[];
  if (orgs.length === 0) return orgs;
  // Kevin 2026-10-29: without upcoming events the card shows its latest event's flyer.
  const { data: evs, error: evError } = await supabaseAdmin
    .from("events")
    .select("organization_id, image_url, starts_at")
    .in("organization_id", orgs.map((o) => o.id))
    .eq("status", "published")
    .not("image_url", "is", null)
    .order("starts_at", { ascending: false })
    .limit(1000);
  if (evError) {
    console.error("[explore-data] latest flyers query failed", evError);
    return orgs;
  }
  const flyers = latestFlyers(evs ?? []);
  let counts: Record<string, number> = {};
  try {
    counts = await followerCounts(supabaseAdmin, orgs.map((o) => o.id));
  } catch (e) {
    console.error("[explore-data] follower counts failed", e); // cards work without them
  }
  // Fase 4.4: most followed first (then by name, as before).
  return orgs
    .map((o) => ({ ...o, last_flyer_url: flyers[o.id] ?? null, followers_count: counts[o.id] ?? 0 }))
    .sort((a, b) => (b.followers_count ?? 0) - (a.followers_count ?? 0) || a.name.localeCompare(b.name));
}

export const getExploreOrganizers = unstable_cache(fetchExploreOrganizers, ["explore-organizers-v3"], { revalidate: 60 });
