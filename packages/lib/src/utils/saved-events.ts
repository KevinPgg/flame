/**
 * "Saved" (fase 4.1, 2026-11-02): the events a person saved with the heart, as shown in You.
 * Upcoming first (soonest first), then the ones that already ended (most recent first), so a
 * saved event never silently disappears once it happens.
 */
export type SavedEventTime = { id: string; starts_at: string; ends_at?: string | null };

export function splitSavedEvents<E extends SavedEventTime>(events: E[], now: Date = new Date()): { upcoming: E[]; past: E[] } {
  const t = now.getTime();
  const end = (e: E) => new Date(e.ends_at || e.starts_at).getTime();
  const start = (e: E) => new Date(e.starts_at).getTime();
  const upcoming = events.filter((e) => end(e) > t).sort((a, b) => start(a) - start(b));
  const past = events.filter((e) => end(e) <= t).sort((a, b) => start(b) - start(a));
  return { upcoming, past };
}

/** Set of saved ids after a toggle (for the optimistic update of the hearts). */
export function toggleSavedId(ids: readonly string[], eventId: string, saved: boolean): string[] {
  const rest = ids.filter((id) => id !== eventId);
  return saved ? [eventId, ...rest] : rest;
}
