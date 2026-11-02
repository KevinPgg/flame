/**
 * Line-up (fase 4.3, 2026-11-02): artists of an event with optional Instagram, Spotify and
 * SoundCloud. Stored as `events.lineup` jsonb (array, ≤ LINEUP_MAX), edited in create/edit event,
 * shown on the event page (prototype `x-artists`). Photos are not part of this step.
 *
 * Organizers paste whatever they have ("@perdomo.dj", "instagram.com/perdomo.dj",
 * "https://open.spotify.com/artist/…", "soundcloud.com/perdomo"); the normalizers turn it into
 * one canonical value or say it's invalid. The server runs the same `sanitizeLineup`.
 */

export const LINEUP_MAX = 20;
export const ARTIST_NAME_MAX = 80;

export type LineupArtist = {
  name: string;
  /** Instagram handle without "@". */
  instagram?: string | null;
  /** https://open.spotify.com/… */
  spotify?: string | null;
  /** https://soundcloud.com/… */
  soundcloud?: string | null;
};

export type ArtistDraft = { key: string; name: string; instagram: string; spotify: string; soundcloud: string };

export type LineupErrorKey =
  | "artistNameRequired"
  | "artistNameTooLong"
  | "instagramInvalid"
  | "spotifyInvalid"
  | "soundcloudInvalid"
  | "lineupTooLong";

let seq = 0;
export function newArtistDraft(over: Partial<Omit<ArtistDraft, "key">> = {}): ArtistDraft {
  seq += 1;
  return { key: `a${Date.now().toString(36)}${seq}`, name: "", instagram: "", spotify: "", soundcloud: "", ...over };
}

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

/** "@perdomo.dj" | "instagram.com/perdomo.dj/" | "https://www.instagram.com/perdomo.dj?igsh=…" → "perdomo.dj". */
export function normalizeInstagram(raw: string): string | null | "invalid" {
  let v = raw.trim();
  if (!v) return null;
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([^/?#]+)/i);
  if (m) v = m[1]!;
  v = v.replace(/^@+/, "");
  return HANDLE.test(v) ? v : "invalid";
}

function asUrl(raw: string): URL | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
}

/** Spotify link (open.spotify.com or spotify.link) → canonical https URL without tracking query. */
export function normalizeSpotify(raw: string): string | null | "invalid" {
  if (!raw.trim()) return null;
  const u = asUrl(raw);
  if (!u) return "invalid";
  const host = u.hostname.toLowerCase();
  if (host === "spotify.link" && u.pathname.length > 1) return `https://spotify.link${u.pathname}`;
  if (host !== "open.spotify.com" || u.pathname.length <= 1) return "invalid";
  return `https://open.spotify.com${u.pathname.replace(/\/+$/, "")}`;
}

/** SoundCloud link or bare username → https://soundcloud.com/<path>. */
export function normalizeSoundcloud(raw: string): string | null | "invalid" {
  const v = raw.trim();
  if (!v) return null;
  if (/^[A-Za-z0-9_-]{2,60}$/.test(v)) return `https://soundcloud.com/${v.toLowerCase()}`;
  const u = asUrl(v);
  if (!u) return "invalid";
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (host === "on.soundcloud.com" && u.pathname.length > 1) return `https://on.soundcloud.com${u.pathname}`;
  if (host !== "soundcloud.com" || u.pathname.length <= 1) return "invalid";
  return `https://soundcloud.com${u.pathname.replace(/\/+$/, "")}`;
}

const isBlank = (d: Pick<ArtistDraft, "name" | "instagram" | "spotify" | "soundcloud">) =>
  !d.name.trim() && !d.instagram.trim() && !d.spotify.trim() && !d.soundcloud.trim();

/** Errors keyed `lineup.<key>.<field>` (and `lineup` for too many). Fully empty rows are ignored. */
export function validateLineup(drafts: ArtistDraft[]): Record<string, LineupErrorKey> {
  const e: Record<string, LineupErrorKey> = {};
  const rows = drafts.filter((d) => !isBlank(d));
  if (rows.length > LINEUP_MAX) e.lineup = "lineupTooLong";
  for (const d of rows) {
    const p = `lineup.${d.key}.`;
    const name = d.name.trim();
    if (!name) e[p + "name"] = "artistNameRequired";
    else if (name.length > ARTIST_NAME_MAX) e[p + "name"] = "artistNameTooLong";
    if (normalizeInstagram(d.instagram) === "invalid") e[p + "instagram"] = "instagramInvalid";
    if (normalizeSpotify(d.spotify) === "invalid") e[p + "spotify"] = "spotifyInvalid";
    if (normalizeSoundcloud(d.soundcloud) === "invalid") e[p + "soundcloud"] = "soundcloudInvalid";
  }
  return e;
}

/** Valid drafts → what the API stores (empty rows dropped, links normalized, nulls omitted). */
export function lineupFromDrafts(drafts: ArtistDraft[]): LineupArtist[] {
  return drafts
    .filter((d) => !isBlank(d))
    .map((d) => {
      const a: LineupArtist = { name: d.name.trim() };
      const ig = normalizeInstagram(d.instagram);
      const sp = normalizeSpotify(d.spotify);
      const sc = normalizeSoundcloud(d.soundcloud);
      if (ig && ig !== "invalid") a.instagram = ig;
      if (sp && sp !== "invalid") a.spotify = sp;
      if (sc && sc !== "invalid") a.soundcloud = sc;
      return a;
    });
}

export function draftsFromLineup(lineup: unknown): ArtistDraft[] {
  return parseLineup(lineup).map((a) =>
    newArtistDraft({ name: a.name, instagram: a.instagram ?? "", spotify: a.spotify ?? "", soundcloud: a.soundcloud ?? "" })
  );
}

/** Whatever is in the database (or an old row without the column) → a safe list to show. */
export function parseLineup(value: unknown): LineupArtist[] {
  if (!Array.isArray(value)) return [];
  const out: LineupArtist[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const a: LineupArtist = { name: name.slice(0, ARTIST_NAME_MAX) };
    const ig = typeof o.instagram === "string" ? normalizeInstagram(o.instagram) : null;
    const sp = typeof o.spotify === "string" ? normalizeSpotify(o.spotify) : null;
    const sc = typeof o.soundcloud === "string" ? normalizeSoundcloud(o.soundcloud) : null;
    if (ig && ig !== "invalid") a.instagram = ig;
    if (sp && sp !== "invalid") a.spotify = sp;
    if (sc && sc !== "invalid") a.soundcloud = sc;
    out.push(a);
    if (out.length === LINEUP_MAX) break;
  }
  return out;
}

/**
 * Server side (POST/PATCH /api/events): the body's `lineup` → what to store, or the first problem.
 * Strict: an invalid link is an error (not silently dropped), so the organizer sees it.
 */
export function sanitizeLineup(value: unknown): { lineup: LineupArtist[] } | { error: string } {
  if (value === null || value === undefined) return { lineup: [] };
  if (!Array.isArray(value)) return { error: "lineup must be an array" };
  const drafts: ArtistDraft[] = [];
  for (const [i, v] of value.entries()) {
    if (!v || typeof v !== "object") return { error: `lineup[${i}] must be an object` };
    const o = v as Record<string, unknown>;
    const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
    drafts.push({ key: String(i), name: str("name"), instagram: str("instagram"), spotify: str("spotify"), soundcloud: str("soundcloud") });
  }
  const errors = validateLineup(drafts);
  const first = Object.entries(errors)[0];
  if (first) return { error: `${first[0]}: ${first[1]}` };
  return { lineup: lineupFromDrafts(drafts) };
}

/** Links to show for an artist (only the ones it has). */
export function artistLinks(a: LineupArtist): Array<{ kind: "instagram" | "spotify" | "soundcloud"; url: string }> {
  const out: Array<{ kind: "instagram" | "spotify" | "soundcloud"; url: string }> = [];
  if (a.instagram) out.push({ kind: "instagram", url: `https://instagram.com/${a.instagram}` });
  if (a.spotify) out.push({ kind: "spotify", url: a.spotify });
  if (a.soundcloud) out.push({ kind: "soundcloud", url: a.soundcloud });
  return out;
}

/** Same line-up? (edit form: send it only when it changed). */
export function sameLineup(a: LineupArtist[], b: LineupArtist[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Initials for the artist tile when there's no photo ("DJ Mila Q" → "MQ", "Perdomo" → "PE"). */
export function artistInitials(name: string): string {
  const words = name.replace(/^(dj|mc)\s+/i, "").split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
  return (words[0] ?? name).slice(0, 2).toUpperCase();
}
