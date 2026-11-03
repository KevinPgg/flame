/**
 * Google Places API (New) for the event VENUE (2026-11-02). Server only: the key never reaches
 * the browser or the app. Cost control:
 *   · one session token per "type → pick" round, closed by the details call (Google bills by session);
 *   · details asks only for `id,formattedAddress` (Essentials SKU) — the name comes from the
 *     suggestion the person tapped;
 *   · only signed-in people, min 3 characters, limited per person (and the quota/budget in Google Cloud).
 * Key: GOOGLE_PLACES_API_KEY (same variable the v1 city field uses).
 */
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places/";
const TIMEOUT_MS = 5000;

export class PlacesError extends Error {
  constructor(public status: number, public code: "NOT_CONFIGURED" | "UPSTREAM" | "TIMEOUT") {
    super(code);
  }
}

const SESSION = /^[0-9a-f-]{20,64}$/i;
export const isSessionToken = (v: unknown): v is string => typeof v === "string" && SESSION.test(v);
export const isPlaceId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(v);

function key(): string {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new PlacesError(503, "NOT_CONFIGURED");
  return k;
}

async function call(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      console.error("[places] Google error", res.status, await res.text().catch(() => ""));
      throw new PlacesError(502, "UPSTREAM");
    }
    return await res.json();
  } catch (e) {
    if (e instanceof PlacesError) throw e;
    if ((e as { name?: string })?.name === "AbortError") throw new PlacesError(504, "TIMEOUT");
    console.error("[places] fetch failed", e);
    throw new PlacesError(502, "UPSTREAM");
  } finally {
    clearTimeout(timer);
  }
}

export type VenueSuggestion = { place_id: string; name: string; address: string };

export async function autocompleteVenues(input: { text: string; session: string; language: string; country?: string | null }): Promise<VenueSuggestion[]> {
  const body: Record<string, unknown> = { input: input.text, sessionToken: input.session, languageCode: input.language };
  if (input.country) body.includedRegionCodes = [input.country.toLowerCase()];
  const json = (await call(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify(body),
  })) as {
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }>;
  };
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .slice(0, 6)
    .map((p) => ({
      place_id: p.placeId!,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      address: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

/** Closes the session. Only id + formatted address (Essentials). */
export async function venueDetails(input: { placeId: string; session: string; language: string }): Promise<{ place_id: string; address: string }> {
  const url = `${DETAILS_URL}${encodeURIComponent(input.placeId)}?sessionToken=${encodeURIComponent(input.session)}&languageCode=${encodeURIComponent(input.language)}`;
  const json = (await call(url, { headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "id,formattedAddress" } })) as { id?: string; formattedAddress?: string };
  return { place_id: json.id ?? input.placeId, address: (json.formattedAddress ?? "").slice(0, 300) };
}

const hits = new Map<string, number[]>();
/** Best effort, per server instance: 60 calls a minute per person. */
export function placesRateLimited(who: string, now = Date.now()): boolean {
  const recent = (hits.get(who) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 60) {
    hits.set(who, recent);
    return true;
  }
  recent.push(now);
  hits.set(who, recent);
  return false;
}
