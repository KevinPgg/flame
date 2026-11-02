import { parseLineup, type LineupArtist } from "../organizer/lineup";

/**
 * Flame 2.0 Explore (fase 2.5) — search by name, as today, for web and app: events by their
 * name, venue, city, organizer or (fase 4.4) an artist of the line-up; organizers by name or
 * city; artists (fase 4.4) by name, each with the upcoming events they play. Accents and case don't matter
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
  /** events.lineup (fase 4.3); optional so older selects still work. */
  lineup?: unknown;
  starts_at?: string;
};

/** An artist found by the search, with the events (in the list given) where they play. */
export type ArtistResult<E> = { name: string; photo_url: string | null; events: E[] };
type SearchableOrg = { name: string; city?: string | null };

export function searchExplore<E extends SearchableEvent, O extends SearchableOrg>(
  events: E[],
  orgs: O[],
  query: string
): { events: E[]; organizers: O[]; artists: ArtistResult<E>[] } {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return { events: [], organizers: [], artists: [] };
  const hits = (fields: Array<string | null | undefined>) => {
    const hay = fields.map(normalizeSearch).join(" ");
    return words.every((w) => hay.includes(w));
  };
  const lineups = new Map<E, LineupArtist[]>(events.map((e) => [e, parseLineup(e.lineup)]));

  // Artists: same name (accents/case ignored) = same artist across events; photo from any of them.
  const byArtist = new Map<string, ArtistResult<E>>();
  for (const e of events) {
    for (const a of lineups.get(e)!) {
      if (!hits([a.name])) continue;
      const key = normalizeSearch(a.name);
      const found = byArtist.get(key) ?? { name: a.name, photo_url: null, events: [] };
      if (!found.photo_url && a.photo_url) found.photo_url = a.photo_url;
      if (!found.events.includes(e)) found.events.push(e);
      byArtist.set(key, found);
    }
  }
  return {
    events: events.filter((e) => hits([e.name, e.venue, e.city, e.organizations?.name, ...lineups.get(e)!.map((a) => a.name)])),
    organizers: orgs.filter((o) => hits([o.name, o.city])),
    artists: [...byArtist.values()].sort((a, b) => b.events.length - a.events.length || a.name.localeCompare(b.name)),
  };
}

export const RECENT_SEARCHES_MAX = 4;

/** "Recent searches" (prototype): newest first, no repeats (case/accents ignored), at most 4. */
export function addRecentSearch(list: readonly string[], query: string): string[] {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 2) return [...list];
  const key = normalizeSearch(q);
  return [q, ...list.filter((r) => normalizeSearch(r) !== key)].slice(0, RECENT_SEARCHES_MAX);
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

/**
 * Latest flyer per organization (Kevin 2026-10-29: an organizer without upcoming events shows
 * its last event's flyer). Rows: that organization's published events, any order.
 */
export function latestFlyers(rows: Array<{ organization_id?: string | null; image_url?: string | null; starts_at?: string | null }>): Record<string, string> {
  const best: Record<string, { url: string; at: number }> = {};
  for (const r of rows) {
    if (!r.organization_id || !r.image_url) continue;
    const at = r.starts_at ? Date.parse(r.starts_at) : NaN;
    const cur = best[r.organization_id];
    if (!cur || (Number.isFinite(at) && !(at <= cur.at))) best[r.organization_id] = { url: r.image_url, at: Number.isFinite(at) ? at : -Infinity };
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.url]));
}

export function organizerCover(
  org: { id?: string | null; slug: string; logo_url?: string | null; cover_image_url?: string | null; last_flyer_url?: string | null },
  events: CoverEvent[],
  now: number = Date.now(),
): { url: string; kind: "flyer" | "logo" | "cover" } | null {
  const ts = (s?: string | null) => (s ? Date.parse(s) : NaN);
  const mine = events
    .filter((e) => e.image_url && (e.organizations?.slug === org.slug || (!!org.id && e.organization_id === org.id)))
    .filter((e) => !(ts(e.ends_at) <= now))
    .sort((a, b) => ts(a.starts_at) - ts(b.starts_at));
  if (mine[0]?.image_url) return { url: mine[0].image_url, kind: "flyer" };
  if (org.last_flyer_url) return { url: org.last_flyer_url, kind: "flyer" };
  if (org.logo_url) return { url: org.logo_url, kind: "logo" };
  if (org.cover_image_url) return { url: org.cover_image_url, kind: "cover" };
  return null;
}
