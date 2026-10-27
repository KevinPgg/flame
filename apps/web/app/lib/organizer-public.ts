/**
 * Public organizer profile data for the Flame 2.0 page (fase 2.4): the approved organization by
 * slug and its published events (owned or co-hosted — same rule as the v1 page), in the Home's
 * event shape so the same cards and price rules apply. Hidden tiers are left out.
 */
import { supabaseAdmin } from "./supabase/server";
import type { HomeEvent } from "./home-events";

export type PublicOrganizer = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  instagram_handle: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
};

const EVENT_SELECT = `id, name, slug, image_url, starts_at, ends_at, venue, city, requires_rsvp, currency, timezone,
  organizations ( name, slug, logo_url ),
  ticket_tiers ( id, price_cents, quantity_total, quantity_sold, per_user_limit, sales_start, sales_end, is_hidden,
    ticket_stages ( id, price_cents, quantity, sold_quantity, order_index ) )`;

export async function getPublicOrganizer(slug: string): Promise<{ org: PublicOrganizer; upcoming: HomeEvent[]; past: HomeEvent[] } | null> {
  const trimmed = slug?.trim();
  if (!trimmed || !supabaseAdmin) return null;
  const { data: raw } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug, description, city, instagram_handle, logo_url, cover_image_url, approved")
    .eq("slug", trimmed)
    .maybeSingle();
  if (!raw || !raw.approved) return null;
  const org: PublicOrganizer = {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    description: raw.description ?? null,
    city: raw.city ?? null,
    instagram_handle: raw.instagram_handle ?? null,
    logo_url: raw.logo_url ?? null,
    cover_image_url: raw.cover_image_url ?? null,
  };

  const { data: cohostRows } = await supabaseAdmin.from("event_assignments").select("event_id").eq("cohost_organization_id", org.id);
  const cohostIds = (cohostRows ?? []).map((r) => r.event_id as string);
  const q = supabaseAdmin.from("events").select(EVENT_SELECT).eq("status", "published");
  const { data } = cohostIds.length
    ? await q.or(`organization_id.eq.${org.id},id.in.(${cohostIds.join(",")})`).order("starts_at", { ascending: true })
    : await q.eq("organization_id", org.id).order("starts_at", { ascending: true });

  const events = ((data ?? []) as unknown as HomeEvent[]).map((e) => {
    const o = Array.isArray(e.organizations) ? (e.organizations[0] ?? null) : e.organizations;
    return { ...e, organizations: o, ticket_tiers: (e.ticket_tiers ?? []).filter((t) => t.is_hidden !== true) };
  });
  const now = Date.now();
  const ended = (e: HomeEvent) => (e.ends_at ? Date.parse(e.ends_at) : Date.parse(e.starts_at)) <= now;
  return { org, upcoming: events.filter((e) => !ended(e)), past: events.filter(ended).reverse() };
}
