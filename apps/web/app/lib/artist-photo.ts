/**
 * Artist photo for the line-up (fase 4.3, 2026-11-02): where to get the picture of an artist
 * from the links the organizer gave. Public oEmbed endpoints, no keys:
 *  - Spotify: open.spotify.com/oembed → thumbnail_url (Spotify has dropped it for some types at
 *    times; then, if SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET exist, the Web API artist images).
 *  - SoundCloud: soundcloud.com/oembed → thumbnail_url (the avatar; the generic placeholder is
 *    refused).
 * Instagram has no public way to read a profile picture (its oEmbed needs a Meta app token and
 * only covers posts), so it is not offered.
 */
import { normalizeSoundcloud, normalizeSpotify } from "@project-flame/lib";

export type PhotoSource = "spotify" | "soundcloud";
const TIMEOUT_MS = 8000;

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function spotifyApiImage(link: string): Promise<string | null> {
  const id = link.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?artist\/([A-Za-z0-9]+)/)?.[1];
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !clientId || !secret) return null;
  const token = await getJson("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  const artist = await getJson(`https://api.spotify.com/v1/artists/${id}`, { headers: { Authorization: `Bearer ${token.access_token}` } });
  const images = (artist?.images ?? []) as Array<{ url: string; width?: number }>;
  return images.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
}

/** Image URL at the source, or null when the profile has no usable picture. Throws on a bad link. */
export async function sourcePhotoUrl(source: PhotoSource, raw: string): Promise<string | null> {
  if (source === "spotify") {
    const link = normalizeSpotify(raw);
    if (!link || link === "invalid") throw new Error("invalid link");
    try {
      const o = await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(link)}`);
      if (typeof o?.thumbnail_url === "string" && o.thumbnail_url) return o.thumbnail_url;
    } catch {
      /* fall through to the Web API */
    }
    return spotifyApiImage(link);
  }
  const link = normalizeSoundcloud(raw);
  if (!link || link === "invalid") throw new Error("invalid link");
  const o = await getJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(link)}`);
  const thumb = typeof o?.thumbnail_url === "string" ? o.thumbnail_url : "";
  if (!thumb || /fb_placeholder\.png/.test(thumb)) return null;
  return thumb.replace(/-(large|t300x300)\./, "-t500x500.");
}

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Download a remote image (≤ 5 MB, jpeg/png/webp). */
export async function downloadImage(url: string): Promise<{ bytes: Buffer; type: string; ext: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("not https");
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw new Error(`type ${type}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("too big");
  return { bytes, type, ext };
}

export const ARTIST_PHOTO_TYPES = TYPES;
export const ARTIST_PHOTO_MAX_BYTES = MAX_BYTES;
