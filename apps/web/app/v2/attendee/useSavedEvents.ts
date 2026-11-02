"use client";

/**
 * Saved events (heart) on the web — fase 4.1 (2026-11-02). One small store shared by every
 * heart on the page and "You → Saved", so tapping one heart updates the others at once.
 * No React Query / Clerk dependency on purpose: the list is GET /api/me/saved-events (401 →
 * signed out), and a heart tapped while signed out sends you to sign in and back.
 */
import { useEffect, useSyncExternalStore } from "react";
import { toggleSavedId } from "@project-flame/lib";
import type { HomeEvent } from "../../lib/home-events";

export type SavedEvent = Omit<HomeEvent, "is_featured">;
type Status = "idle" | "loading" | "ready" | "signedOut" | "error";
type State = { status: Status; events: SavedEvent[]; ids: string[] };

const EMPTY: State = { status: "idle", events: [], ids: [] };
let state: State = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function load(): Promise<void> {
  if (inflight) return inflight;
  if (state.status === "idle") set({ ...state, status: "loading" });
  inflight = (async () => {
    try {
      const res = await fetch("/api/me/saved-events", { cache: "no-store" });
      if (res.status === 401) return set({ status: "signedOut", events: [], ids: [] });
      if (!res.ok) throw new Error(String(res.status));
      const { events } = (await res.json()) as { events: SavedEvent[] };
      set({ status: "ready", events, ids: events.map((e) => e.id) });
    } catch {
      set({ ...state, status: state.status === "loading" ? "error" : state.status });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function signIn() {
  const back = window.location.pathname + window.location.search;
  window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
}

/** Heart tapped: optimistic, reverted if the API says no. */
async function toggle(event: { id: string } & Partial<SavedEvent>, saved: boolean): Promise<void> {
  if (inflight) await inflight; // first load still running: know if we're signed in
  if (state.status === "signedOut") return signIn();
  const before = state;
  const full = event.slug && event.starts_at ? (event as SavedEvent) : null;
  set({
    ...state,
    ids: toggleSavedId(state.ids, event.id, saved),
    events: saved ? (full ? [full, ...state.events.filter((e) => e.id !== event.id)] : state.events) : state.events.filter((e) => e.id !== event.id),
  });
  try {
    const res = await fetch("/api/me/saved-events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, saved }),
    });
    if (res.status === 401) {
      set({ status: "signedOut", events: [], ids: [] });
      return signIn();
    }
    if (!res.ok) throw new Error(String(res.status));
    // Saved from a place without the whole card (event page): fetch the list for You.
    if (saved && !full) await load();
  } catch {
    set(before);
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useSavedEvents() {
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    if (state.status === "idle") void load();
  }, []);
  return {
    status: s.status,
    events: s.events,
    isSaved: (id: string) => s.ids.includes(id),
    toggle,
    reload: load,
  };
}

/** Tests only: start from a clean store. */
export function __resetSavedEvents() {
  state = EMPTY;
  inflight = null;
  listeners.clear();
}
