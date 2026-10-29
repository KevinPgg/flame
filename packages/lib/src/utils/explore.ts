/**
 * Flame 2.0 Explore (fase 2.5) — search by name, as today, for web and app: events by their
 * name, venue, city or organizer; organizers by name or city. Accents and case don't matter
 * ("cumbia" finds "Cúmbia"). Featured events: the ones flagged featured first, then the next
 * upcoming, so the row is never empty.
 */
export const normalizeSearch = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

type SearchableEvent = {
  name: string;
  venue?: string | null;
  city?: string | null;
  organizations?: { name: string } | null;
};
type SearchableOrg = { name: string; city?: string | null };

export function searchExplore<E extends SearchableEvent, O extends SearchableOrg>(events: E[], orgs: O[], query: string): { events: E[]; organizers: O[] } {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return { events: [], organizers: [] };
  const hits = (fields: Array<string | null | undefined>) => {
    const hay = fields.map(normalizeSearch).join(" ");
    return words.every((w) => hay.includes(w));
  };
  return {
    events: events.filter((e) => hits([e.name, e.venue, e.city, e.organizations?.name])),
    organizers: orgs.filter((o) => hits([o.name, o.city])),
  };
}

export function featuredFirst<E extends { is_featured?: boolean | null }>(events: E[], limit = 10): E[] {
  const featured = events.filter((e) => e.is_featured);
  const rest = events.filter((e) => !e.is_featured);
  return [...featured, ...rest].slice(0, limit);
}

/**
 * Background of an organizer card in the organizer rows (Kevin 2026-10-28): the flyer of the
 * organizer's latest event — the next one that hasn't ended (the lists hold upcoming events) —
 * and, without one, the organizer's profile photo; then its cover.
 */
type CoverEvent = {
  starts_at: string;
  ends_at?: string | null;
  image_url?: string | null;
  organization_id?: string | null;
  organizations?: { slug?: string | null } | null;
};

export function organizerCover(
  org: { id?: string | null; slug: string; logo_url?: string | null; cover_image_url?: string | null },
  events: CoverEvent[],
  now: number = Date.now(),
): { url: string; kind: "flyer" | "logo" | "cover" } | null {
  const ts = (s?: string | null) => (s ? Date.parse(s) : NaN);
  const mine = events
    .filter((e) => e.image_url && (e.organizations?.slug === org.slug || (!!org.id && e.organization_id === org.id)))
    .filter((e) => !(ts(e.ends_at) <= now))
    .sort((a, b) => ts(a.starts_at) - ts(b.starts_at));
  if (mine[0]?.image_url) return { url: mine[0].image_url, kind: "flyer" };
  if (org.logo_url) return { url: org.logo_url, kind: "logo" };
  if (org.cover_image_url) return { url: org.cover_image_url, kind: "cover" };
  return null;
}
