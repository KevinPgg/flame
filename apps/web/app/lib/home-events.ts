import { unstable_cache } from "next/cache";
import { INTERNAL_ORG_IDS } from "@project-flame/lib";
import { supabaseAdmin } from "./supabase/server";
import { isProduction } from "./utils/environment";

/**
 * Upcoming published events for the Home (v1 `/` and the Flame 2.0 Home, fase 2.2): one query,
 * cached 60 s like the v1 page's ISR (the v2 page renders per request because its layout reads
 * the signed-in person's language). Hidden tiers are left out, as the app does.
 */
export type HomeEvent = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  city: string | null;
  requires_rsvp: boolean | null;
  currency: string | null;
  timezone: string | null;
  organizations: { name: string; slug: string; logo_url: string | null } | null;
  ticket_tiers: Array<{
    id: string;
    price_cents: number;
    quantity_total: number;
    quantity_sold: number;
    per_user_limit?: number | null;
    sales_start: string | null;
    sales_end: string | null;
    is_hidden?: boolean | null;
    ticket_stages: Array<{ id: string; price_cents: number; quantity: number; sold_quantity: number; order_index: number }>;
  }>;
};

async function fetchHomeEvents(): Promise<HomeEvent[]> {
  if (!supabaseAdmin) return [];
  let q = supabaseAdmin
    .from("events")
    .select(
      `id, name, slug, image_url, starts_at, ends_at, venue, city, requires_rsvp, currency, timezone,
       organizations ( name, slug, logo_url ),
       ticket_tiers ( id, price_cents, quantity_total, quantity_sold, per_user_limit, sales_start, sales_end, is_hidden,
         ticket_stages ( id, price_cents, quantity, sold_quantity, order_index ) )`
    )
    .eq("status", "published")
    .gt("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (isProduction()) q = q.not("organization_id", "in", `(${INTERNAL_ORG_IDS.join(",")})`);
  const { data, error } = await q;
  if (error) {
    console.error("[home-events] query failed", error);
    throw error;
  }
  return ((data ?? []) as unknown as HomeEvent[]).map((e) => {
    const org = Array.isArray(e.organizations) ? (e.organizations[0] ?? null) : e.organizations;
    return { ...e, organizations: org, ticket_tiers: (e.ticket_tiers ?? []).filter((t) => t.is_hidden !== true) };
  });
}

export const getHomeEvents = unstable_cache(fetchHomeEvents, ["home-events-v2"], { revalidate: 60 });
