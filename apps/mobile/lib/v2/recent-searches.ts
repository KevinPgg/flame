/**
 * Explore "Recent searches" (fase 4.4, prototype): kept on this phone only (SecureStore, like
 * the default city — AsyncStorage isn't installed). Rules in @project-flame/lib addRecentSearch.
 */
import * as SecureStore from "expo-secure-store";
import { RECENT_SEARCHES_MAX } from "@project-flame/lib";

const KEY = "flame_recent_searches";

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const v = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_SEARCHES_MAX) : [];
  } catch {
    return [];
  }
}

export async function saveRecentSearches(list: string[]): Promise<void> {
  try {
    if (list.length === 0) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, JSON.stringify(list.slice(0, RECENT_SEARCHES_MAX)));
  } catch {
    /* not available: just don't remember */
  }
}
