import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isEventActive,
  filterActiveEvents,
  filterPastEvents,
  separateEventsByDate,
  filterEventsByCity,
  filterEventsByOrganizer,
  extractUniqueCities,
  extractUniqueOrganizers,
} from "../src";
import type { OrgFilterableEvent } from "../src";

beforeEach(() => vi.clearAllMocks());

const past = "2020-01-01T00:00:00Z";
const future = "2099-12-31T23:59:59Z";
const ref = new Date("2025-06-15T12:00:00Z");

const pastEvent = { starts_at: "2020-01-01T10:00:00Z", ends_at: "2020-01-01T14:00:00Z" };
const activeEvent = { starts_at: "2025-06-15T10:00:00Z", ends_at: "2099-12-31T23:59:59Z" };
const justEndedEvent = { starts_at: "2025-06-15T11:00:00Z", ends_at: "2025-06-15T12:00:00Z" };

describe("isEventActive", () => {
  it("returns true for a future event", () => {
    expect(isEventActive(activeEvent, ref)).toBe(true);
  });

  it("returns false for a past event", () => {
    expect(isEventActive(pastEvent, ref)).toBe(false);
  });

  it("returns false for an event that ended exactly at the reference date (strict >)", () => {
    expect(isEventActive(justEndedEvent, ref)).toBe(false);
  });

  it("uses current time as default reference", () => {
    const alwaysFuture = { starts_at: future, ends_at: future };
    expect(isEventActive(alwaysFuture)).toBe(true);
    const alwaysPast = { starts_at: past, ends_at: past };
    expect(isEventActive(alwaysPast)).toBe(false);
  });

  it("throws when ends_at is missing", () => {
    expect(() =>
      isEventActive({ starts_at: "2025-01-01T10:00:00Z", ends_at: "" }, ref)
    ).toThrow("missing required ends_at");
  });
});

describe("filterActiveEvents", () => {
  it("returns only events that have not ended", () => {
    const result = filterActiveEvents([pastEvent, activeEvent, justEndedEvent], ref);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(activeEvent);
  });

  it("returns empty array when all events are past", () => {
    expect(filterActiveEvents([pastEvent, justEndedEvent], ref)).toHaveLength(0);
  });

  it("preserves extra fields on the event objects (generic type)", () => {
    const enriched = { ...activeEvent, id: "abc", name: "Test" };
    const result = filterActiveEvents([enriched], ref);
    expect(result[0].id).toBe("abc");
  });
});

describe("filterPastEvents", () => {
  it("returns only events that have ended", () => {
    const result = filterPastEvents([pastEvent, activeEvent, justEndedEvent], ref);
    expect(result).toHaveLength(2);
    expect(result).toContain(pastEvent);
    expect(result).toContain(justEndedEvent);
  });

  it("returns empty array when all events are active", () => {
    expect(filterPastEvents([activeEvent], ref)).toHaveLength(0);
  });
});

describe("separateEventsByDate", () => {
  it("separates events into currentEvents and pastEvents", () => {
    const { currentEvents, pastEvents } = separateEventsByDate(
      [pastEvent, activeEvent, justEndedEvent],
      ref
    );
    expect(currentEvents).toHaveLength(1);
    expect(currentEvents[0]).toBe(activeEvent);
    expect(pastEvents).toHaveLength(2);
  });

  it("returns empty arrays for both when input is empty", () => {
    const { currentEvents, pastEvents } = separateEventsByDate([], ref);
    expect(currentEvents).toHaveLength(0);
    expect(pastEvents).toHaveLength(0);
  });

  it("all in currentEvents when all active", () => {
    const { currentEvents, pastEvents } = separateEventsByDate([activeEvent], ref);
    expect(currentEvents).toHaveLength(1);
    expect(pastEvents).toHaveLength(0);
  });

  it("all in pastEvents when all ended", () => {
    const { currentEvents, pastEvents } = separateEventsByDate([pastEvent], ref);
    expect(currentEvents).toHaveLength(0);
    expect(pastEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// City / Organizer filter tests
// ---------------------------------------------------------------------------

const orgEvents: OrgFilterableEvent[] = [
  { starts_at: future, ends_at: future, city: "Guayaquil", organizationSlug: "kora", organizationName: "Kora Experiences" },
  { starts_at: future, ends_at: future, city: "Quito", organizationSlug: "kora", organizationName: "Kora Experiences" },
  { starts_at: future, ends_at: future, city: "Guayaquil", organizationSlug: "vibra", organizationName: "Vibra Events" },
  { starts_at: future, ends_at: future, city: null, organizationSlug: null, organizationName: null },
  { starts_at: future, ends_at: future, city: "Cuenca", organizationSlug: "vibra", organizationName: "Vibra Events" },
];

describe("filterEventsByCity", () => {
  it("filters by exact city match", () => {
    const result = filterEventsByCity(orgEvents, "Guayaquil");
    expect(result).toHaveLength(2);
    expect(result.every(e => e.city === "Guayaquil")).toBe(true);
  });

  it("returns all events when city is null", () => {
    expect(filterEventsByCity(orgEvents, null)).toHaveLength(orgEvents.length);
  });

  it("returns all events when city is undefined", () => {
    expect(filterEventsByCity(orgEvents, undefined)).toHaveLength(orgEvents.length);
  });

  it("returns empty array when no match", () => {
    expect(filterEventsByCity(orgEvents, "Manta")).toHaveLength(0);
  });

  it("is case-sensitive", () => {
    expect(filterEventsByCity(orgEvents, "guayaquil")).toHaveLength(0);
  });
});

describe("filterEventsByOrganizer", () => {
  it("filters by exact slug match", () => {
    const result = filterEventsByOrganizer(orgEvents, "kora");
    expect(result).toHaveLength(2);
    expect(result.every(e => e.organizationSlug === "kora")).toBe(true);
  });

  it("returns all events when slug is null", () => {
    expect(filterEventsByOrganizer(orgEvents, null)).toHaveLength(orgEvents.length);
  });

  it("returns all events when slug is undefined", () => {
    expect(filterEventsByOrganizer(orgEvents, undefined)).toHaveLength(orgEvents.length);
  });

  it("returns empty array when no match", () => {
    expect(filterEventsByOrganizer(orgEvents, "no-such-org")).toHaveLength(0);
  });
});

describe("extractUniqueCities", () => {
  it("returns unique, sorted cities", () => {
    expect(extractUniqueCities(orgEvents)).toEqual(["Cuenca", "Guayaquil", "Quito"]);
  });

  it("skips null/undefined cities", () => {
    const result = extractUniqueCities(orgEvents);
    expect(result).not.toContain(null);
    expect(result).not.toContain(undefined);
  });

  it("returns empty array for empty input", () => {
    expect(extractUniqueCities([])).toEqual([]);
  });
});

describe("extractUniqueOrganizers", () => {
  it("returns unique organizers sorted by name", () => {
    const result = extractUniqueOrganizers(orgEvents);
    expect(result).toEqual([
      { slug: "kora", name: "Kora Experiences" },
      { slug: "vibra", name: "Vibra Events" },
    ]);
  });

  it("skips events with null organizer data", () => {
    const result = extractUniqueOrganizers(orgEvents);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(extractUniqueOrganizers([])).toEqual([]);
  });

  it("deduplicates by slug, keeping first occurrence name", () => {
    const dupes: OrgFilterableEvent[] = [
      { starts_at: future, ends_at: future, organizationSlug: "x", organizationName: "First" },
      { starts_at: future, ends_at: future, organizationSlug: "x", organizationName: "Second" },
    ];
    const result = extractUniqueOrganizers(dupes);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("First");
  });
});
