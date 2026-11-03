/**
 * Countries and cities (Flame 2.0, 2026-11-02, decision of Kevin): a fixed catalog for the CITY
 * (clean data for Home/Explore filters and the selector grouped by country, as in the prototype),
 * and Google Places autocomplete only for the VENUE when creating/editing an event.
 *
 * Events keep `city` as text: a city outside the catalog still works (it shows under "Other").
 * The country is derived from the city — no column. Old free-text spellings map through aliases.
 */
import type { Language } from "../i18n";

export type CountryCode = "EC" | "US" | "ES" | "PA" | "PT" | "MX";

export interface CatalogCity {
  name: string;
  timezone: string;
  /** Other spellings already used in event data (accents/case are ignored anyway). */
  aliases?: string[];
}

export interface CatalogCountry {
  code: CountryCode;
  name: Record<Language, string>;
  flag: string;
  currency: string;
  cities: CatalogCity[];
}

/** Order = order in the selectors. Cities from the prototype's CITIES. */
export const COUNTRIES: readonly CatalogCountry[] = [
  {
    code: "EC",
    name: { en: "Ecuador", es: "Ecuador" },
    flag: "🇪🇨",
    currency: "USD",
    cities: [
      { name: "Guayaquil", timezone: "America/Guayaquil", aliases: ["GYE"] },
      { name: "Samborondón", timezone: "America/Guayaquil" },
      { name: "Salinas", timezone: "America/Guayaquil" },
      { name: "Cuenca", timezone: "America/Guayaquil" },
      { name: "Quito", timezone: "America/Guayaquil", aliases: ["UIO"] },
      { name: "Montañita", timezone: "America/Guayaquil" },
    ],
  },
  {
    code: "US",
    name: { en: "United States", es: "Estados Unidos" },
    flag: "🇺🇸",
    currency: "USD",
    cities: [
      { name: "Miami", timezone: "America/New_York", aliases: ["Miami Beach"] },
      { name: "Boston", timezone: "America/New_York" },
      { name: "New York", timezone: "America/New_York", aliases: ["New York City", "NYC", "Nueva York"] },
    ],
  },
  {
    code: "ES",
    name: { en: "Spain", es: "España" },
    flag: "🇪🇸",
    currency: "EUR",
    cities: [
      { name: "Ibiza", timezone: "Europe/Madrid", aliases: ["Eivissa"] },
      { name: "Madrid", timezone: "Europe/Madrid" },
      { name: "Barcelona", timezone: "Europe/Madrid" },
      { name: "Pamplona", timezone: "Europe/Madrid", aliases: ["Iruña"] },
    ],
  },
  {
    code: "PA",
    name: { en: "Panama", es: "Panamá" },
    flag: "🇵🇦",
    currency: "USD",
    cities: [{ name: "Panama City", timezone: "America/Panama", aliases: ["Ciudad de Panamá", "Panamá", "Panama"] }],
  },
  {
    code: "PT",
    name: { en: "Portugal", es: "Portugal" },
    flag: "🇵🇹",
    currency: "EUR",
    cities: [
      { name: "Lisboa", timezone: "Europe/Lisbon", aliases: ["Lisbon"] },
      { name: "Porto", timezone: "Europe/Lisbon", aliases: ["Oporto"] },
    ],
  },
  {
    code: "MX",
    name: { en: "Mexico", es: "México" },
    flag: "🇲🇽",
    currency: "MXN",
    cities: [
      { name: "Ciudad de México", timezone: "America/Mexico_City", aliases: ["Mexico City", "CDMX", "México DF"] },
      { name: "Mérida", timezone: "America/Merida" },
      { name: "Cancún", timezone: "America/Cancun", aliases: ["Cancun"] },
    ],
  },
];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const INDEX = new Map<string, { country: CatalogCountry; city: CatalogCity }>();
for (const country of COUNTRIES)
  for (const city of country.cities) for (const n of [city.name, ...(city.aliases ?? [])]) INDEX.set(fold(n), { country, city });

/** "guayaquil " / "NYC" / "Lisbon" → the catalog entry; anything else → null. */
export function findCatalogCity(raw: string | null | undefined): { country: CatalogCountry; city: CatalogCity } | null {
  return raw ? (INDEX.get(fold(raw)) ?? null) : null;
}

/** The catalog spelling of a city, or the text as typed (trimmed) when it isn't in the catalog. */
export function canonicalCity(raw: string): string {
  return findCatalogCity(raw)?.city.name ?? raw.trim();
}

/** Currency and time zone a new event in that city most likely uses (create form defaults). */
export function cityDefaults(raw: string): { timezone: string; currency: string } | null {
  const m = findCatalogCity(raw);
  return m ? { timezone: m.city.timezone, currency: m.country.currency } : null;
}

export interface CityGroup {
  /** null = cities outside the catalog ("Other"). */
  country: CatalogCountry | null;
  cities: Array<{ city: string; count: number }>;
  count: number;
}

/**
 * Cities with events (cityCounts) grouped by country in catalog order, each city under its
 * catalog spelling (variants merged); unknown cities last, under "Other". Empty groups dropped.
 */
export function groupCitiesByCountry(counts: Array<{ city: string; count: number }>): CityGroup[] {
  const byCountry = new Map<CountryCode | "other", Map<string, number>>();
  for (const { city, count } of counts) {
    const m = findCatalogCity(city);
    const key = m ? m.country.code : "other";
    const name = m ? m.city.name : city.trim();
    const group = byCountry.get(key) ?? new Map<string, number>();
    group.set(name, (group.get(name) ?? 0) + count);
    byCountry.set(key, group);
  }
  const out: CityGroup[] = [];
  const make = (country: CatalogCountry | null, g: Map<string, number> | undefined) => {
    if (!g || g.size === 0) return;
    const order = country ? country.cities.map((c) => c.name) : [];
    const cities = [...g].map(([city, count]) => ({ city, count })).sort((a, b) => {
      const ia = order.indexOf(a.city);
      const ib = order.indexOf(b.city);
      return ia !== -1 && ib !== -1 ? ia - ib : b.count - a.count || a.city.localeCompare(b.city);
    });
    out.push({ country, cities, count: cities.reduce((s, c) => s + c.count, 0) });
  };
  for (const c of COUNTRIES) make(c, byCountry.get(c.code));
  make(null, byCountry.get("other"));
  return out;
}

/** True when the event's city is the one picked (catalog spellings and aliases match). */
export function sameCity(eventCity: string | null | undefined, picked: string): boolean {
  if (!eventCity) return false;
  return canonicalCity(eventCity).toLowerCase() === canonicalCity(picked).toLowerCase();
}

// ── Venue (Google Places) ───────────────────────────────────────────────────

export const VENUE_ADDRESS_MAX = 300;
export const VENUE_PLACE_ID_MAX = 300;

/**
 * Link to the venue on Google Maps — built by us (Maps URLs, no API call, no key, no cost).
 * With a place id Maps opens that exact place; without it, a search by name + address + city.
 */
export function venueMapsUrl(v: { venue?: string | null; venue_address?: string | null; venue_place_id?: string | null; city?: string | null }): string | null {
  const query = [v.venue, v.venue_address || v.city].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
  if (!query) return null;
  const u = new URL("https://www.google.com/maps/search/");
  u.searchParams.set("api", "1");
  u.searchParams.set("query", query);
  if (v.venue_place_id) u.searchParams.set("query_place_id", v.venue_place_id);
  return u.toString();
}

/** A new random session token for one autocomplete → details round (Google bills per session). */
export function newPlacesSessionToken(): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20)}`;
}
