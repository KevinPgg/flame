"use client";

/**
 * Organizations you follow, on the web — fase 4.2 (2026-11-02). Same idea as useSavedEvents:
 * one small store for every Follow button and "You → Following", no React Query / Clerk
 * dependency (GET /api/me/following; 401 = signed out → sign in and come back).
 * Also keeps the latest follower count of each organization touched here, so the number on the
 * profile moves with the button.
 */
import { useEffect, useSyncExternalStore } from "react";
import { toggleSavedId } from "@project-flame/lib";

export type FollowedOrg = { id: string; name: string; slug: string; logo_url: string | null; city: string | null; followers_count: number };
type Status = "idle" | "loading" | "ready" | "signedOut" | "error";
type State = { status: Status; orgs: FollowedOrg[]; ids: string[]; counts: Record<string, number> };

const EMPTY: State = { status: "idle", orgs: [], ids: [], counts: {} };
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
      const res = await fetch("/api/me/following", { cache: "no-store" });
      if (res.status === 401) return set({ ...EMPTY, status: "signedOut", counts: state.counts });
      if (!res.ok) throw new Error(String(res.status));
      const { organizations } = (await res.json()) as { organizations: FollowedOrg[] };
      const counts = { ...state.counts };
      organizations.forEach((o) => (counts[o.id] = o.followers_count));
      set({ status: "ready", orgs: organizations, ids: organizations.map((o) => o.id), counts });
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

/**
 * Follow / unfollow, optimistic. `baseCount` = the count the page already shows (profile), so
 * the number can move before the API answers.
 */
async function toggle(org: { id: string; name: string } & Partial<FollowedOrg>, follow: boolean, baseCount?: number): Promise<void> {
  if (inflight) await inflight;
  if (state.status === "signedOut") return signIn();
  const before = state;
  const current = state.counts[org.id] ?? baseCount;
  const counts = { ...state.counts };
  if (current !== undefined) counts[org.id] = Math.max(0, current + (follow ? 1 : -1));
  const full: FollowedOrg | null = org.slug
    ? { id: org.id, name: org.name, slug: org.slug, logo_url: org.logo_url ?? null, city: org.city ?? null, followers_count: counts[org.id] ?? 0 }
    : null;
  set({
    ...state,
    counts,
    ids: toggleSavedId(state.ids, org.id, follow),
    orgs: follow ? (full ? [full, ...state.orgs.filter((o) => o.id !== org.id)] : state.orgs) : state.orgs.filter((o) => o.id !== org.id),
  });
  try {
    const res = await fetch("/api/me/following", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: org.id, following: follow }),
    });
    if (res.status === 401) {
      set({ ...EMPTY, status: "signedOut", counts: before.counts });
      return signIn();
    }
    if (!res.ok) throw new Error(String(res.status));
    const { followers_count } = (await res.json()) as { followers_count: number };
    set({
      ...state,
      counts: { ...state.counts, [org.id]: followers_count },
      orgs: state.orgs.map((o) => (o.id === org.id ? { ...o, followers_count } : o)),
    });
    if (follow && !full) await load();
  } catch {
    set(before);
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useFollowing() {
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    if (state.status === "idle") void load();
  }, []);
  return {
    status: s.status,
    orgs: s.orgs,
    isFollowing: (id: string) => s.ids.includes(id),
    /** Latest known follower count, or the page's own number. */
    followersOf: (id: string, base: number) => s.counts[id] ?? base,
    toggle,
    reload: load,
  };
}

/** Tests only: start from a clean store. */
export function __resetFollowing() {
  state = EMPTY;
  inflight = null;
  listeners.clear();
}
