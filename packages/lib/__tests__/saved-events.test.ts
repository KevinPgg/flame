/** Fase 4.1 Guardar eventos: order of "You → Saved" and the optimistic toggle. */
import { describe, it, expect } from "vitest";
import { splitSavedEvents, toggleSavedId } from "../src/utils/saved-events";

const ev = (id: string, starts: string, ends?: string) => ({ id, starts_at: starts, ends_at: ends ?? null });

describe("splitSavedEvents", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("upcoming soonest first; ended most recent first; happening now counts as upcoming", () => {
    const list = [
      ev("late", "2026-12-01T22:00:00Z", "2026-12-02T04:00:00Z"),
      ev("old", "2026-09-01T22:00:00Z", "2026-09-02T04:00:00Z"),
      ev("now", "2026-11-10T10:00:00Z", "2026-11-10T18:00:00Z"),
      ev("recent", "2026-11-08T22:00:00Z", "2026-11-09T04:00:00Z"),
      ev("noEnd", "2026-11-20T22:00:00Z"),
    ];
    const { upcoming, past } = splitSavedEvents(list, now);
    expect(upcoming.map((e) => e.id)).toEqual(["now", "noEnd", "late"]);
    expect(past.map((e) => e.id)).toEqual(["recent", "old"]);
  });
});

describe("toggleSavedId", () => {
  it("adds once at the front and removes", () => {
    expect(toggleSavedId(["a", "b"], "c", true)).toEqual(["c", "a", "b"]);
    expect(toggleSavedId(["a", "b"], "a", true)).toEqual(["a", "b"]);
    expect(toggleSavedId(["a", "b"], "a", false)).toEqual(["b"]);
  });
});
