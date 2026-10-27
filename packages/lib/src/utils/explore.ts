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
