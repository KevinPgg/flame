/**
 * Default city of the Home (fase 2.2, Kevin 2026-10-27): chosen in Settings and remembered on
 * this phone only (SecureStore — AsyncStorage isn't installed; no DB, no account). It replaces
 * the earlier "never remembered" rule for the app; the web still applies the catalog default.
 * Values: "auto" (catalog rule: Quito when it has events, else all), "all", or a city name.
 */
import * as SecureStore from "expo-secure-store";
import { DEFAULT_CATALOG_CITY } from "@project-flame/lib";

export const DEFAULT_CITY_AUTO = "auto";
export const DEFAULT_CITY_ALL = "all";
export type DefaultCityPref = string; // "auto" | "all" | city name

const KEY = "flme.v2.defaultCity";

export async function readDefaultCityPref(): Promise<DefaultCityPref> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return v && v.trim() ? v : DEFAULT_CITY_AUTO;
  } catch {
    return DEFAULT_CITY_AUTO;
  }
}

export async function saveDefaultCityPref(pref: DefaultCityPref): Promise<void> {
  try {
    if (pref === DEFAULT_CITY_AUTO) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, pref);
  } catch {
    /* best effort: the choice still applies for this session */
  }
}

/**
 * City the Home opens on (null = all cities). A saved city with no upcoming events falls back to
 * the catalog rule, so the Home never opens empty because of an old setting.
 */
export function resolveDefaultCity(pref: DefaultCityPref, citiesWithEvents: string[]): string | null {
  if (pref === DEFAULT_CITY_ALL) return null;
  if (pref !== DEFAULT_CITY_AUTO && citiesWithEvents.includes(pref)) return pref;
  return citiesWithEvents.includes(DEFAULT_CATALOG_CITY) ? DEFAULT_CATALOG_CITY : null;
}
