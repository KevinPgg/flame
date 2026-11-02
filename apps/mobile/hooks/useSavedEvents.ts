/**
 * Saved events (heart) in the app — fase 4.1 (2026-11-02). Same API as the web
 * (GET/PUT /api/me/saved-events). One React Query cache entry shared by every heart and
 * "You → Saved"; the heart is optimistic and goes back if the API says no. Signed out → sign in.
 */
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { toggleSavedId } from "@project-flame/lib";
import { apiClient, apiGet } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";
import type { FeedEvent } from "../components/v2/attendee/home/EventFeedCard";

export const SAVED_EVENTS_KEY = ["me", "saved-events"] as const;
type Saved = { events: FeedEvent[]; ids: string[] };
const EMPTY: Saved = { events: [], ids: [] };

export function useSavedEvents() {
  const { isSignedIn, getToken } = useOptionalAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const query = useQuery({
    queryKey: SAVED_EVENTS_KEY,
    enabled: isSignedIn === true,
    staleTime: 60_000,
    queryFn: async (): Promise<Saved> => {
      const res = await apiGet<{ events: FeedEvent[] }>("/api/me/saved-events", getToken);
      const events = res?.events ?? [];
      return { events, ids: events.map((e) => e.id) };
    },
  });
  const data = query.data ?? EMPTY;
  const ids = useMemo(() => new Set(data.ids), [data.ids]);

  const toggle = useCallback(
    async (event: { id: string } & Partial<FeedEvent>, saved: boolean) => {
      if (isSignedIn !== true) {
        router.push("/sign-in" as Href);
        return;
      }
      const before = qc.getQueryData<Saved>(SAVED_EVENTS_KEY);
      const full = event.slug && event.starts_at ? (event as FeedEvent) : null;
      qc.setQueryData<Saved>(SAVED_EVENTS_KEY, (old = EMPTY) => ({
        ids: toggleSavedId(old.ids, event.id, saved),
        events: saved
          ? full
            ? [full, ...old.events.filter((e) => e.id !== event.id)]
            : old.events
          : old.events.filter((e) => e.id !== event.id),
      }));
      try {
        await apiClient("/api/me/saved-events", { method: "PUT", body: JSON.stringify({ event_id: event.id, saved }), getToken });
        // Saved from the event screen (no whole card): fetch the list for You.
        if (saved && !full) void qc.invalidateQueries({ queryKey: SAVED_EVENTS_KEY });
      } catch {
        qc.setQueryData(SAVED_EVENTS_KEY, before ?? EMPTY);
      }
    },
    [isSignedIn, getToken, qc, router]
  );

  return {
    events: data.events,
    isLoading: query.isLoading && isSignedIn === true,
    isSaved: (id: string) => ids.has(id),
    toggle,
    refetch: query.refetch,
  };
}
