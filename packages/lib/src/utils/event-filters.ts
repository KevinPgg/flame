/**
 * Event filtering utilities
 * Shared between web and mobile for consistent active/past event classification.
 *
 * NOTE: All events are GUARANTEED to have both starts_at and ends_at due to:
 * 1. Database NOT NULL constraint (is_nullable: "NO")
 * 2. Zod schema validation: z.string().datetime() (required, not optional)
 * 3. TypeScript interface: both fields string (required, not optional)
 * 4. Frontend form validation (required HTML input fields)
 * 5. API server validation (validates date logic before DB insert)
 */

/** Minimal shape required by the event-filtering functions. Extend this interface
 *  when you need to pass richer event objects while retaining type safety. */
export interface ActiveEvent {
  starts_at: string;
  ends_at: string;
}

/** Extended event shape that carries city + organization data for filtering. */
export interface OrgFilterableEvent extends ActiveEvent {
  city?: string | null;
  organizationSlug?: string | null;
  organizationName?: string | null;
}

/**
 * City the event catalog lands on at cold open (W0-Q3). Applied as the initial
 * city filter on both platforms — but only when it actually has events — so the
 * single source of truth lives here instead of being duplicated as a string
 * literal in the mobile hook and each web catalog component.
 */
export const DEFAULT_CATALOG_CITY = "Quito";

/**
 * Determines if an event is currently active (not yet ended).
 *
 * @param event - Event object with ends_at date
 * @param referenceDate - The date to compare against (defaults to current date/time)
 * @returns true if the event is still active, false if it has ended
 *
 * @remarks
 * Uses strict comparison (>) to exclude events that have just ended.
 * Throws if ends_at is missing — this is a data-integrity fail-safe, not normal
 * error handling. It should NEVER fire in production given the validation layers above.
 */
export function isEventActive(
  event: ActiveEvent,
  referenceDate: Date = new Date()
): boolean {
  if (!event.ends_at) {
    // Only include a safe minimal subset — never serialize the full event object
    // which may contain PII (name, description, organizer details).
    throw new Error(
      `Event is missing required ends_at date. This indicates a SERIOUS data integrity issue. Context: ${JSON.stringify({ starts_at: event.starts_at })}`
    );
  }
  return new Date(event.ends_at) > referenceDate;
}

/**
 * Filters an array of events to only include currently active events.
 *
 * @param events - Array of events to filter
 * @param referenceDate - The date to compare against (defaults to current date/time)
 * @returns Array of events that are still active
 */
export function filterActiveEvents<T extends ActiveEvent>(
  events: T[],
  referenceDate: Date = new Date()
): T[] {
  return events.filter(event => isEventActive(event, referenceDate));
}

/**
 * Filters an array of events to only include past events.
 *
 * @param events - Array of events to filter
 * @param referenceDate - The date to compare against (defaults to current date/time)
 * @returns Array of events that have ended
 */
export function filterPastEvents<T extends ActiveEvent>(
  events: T[],
  referenceDate: Date = new Date()
): T[] {
  return events.filter(event => !isEventActive(event, referenceDate));
}

/**
 * Separates events into current/upcoming and past events.
 *
 * @param events - Array of events to separate
 * @param referenceDate - The date to compare against (defaults to current date/time)
 * @returns Object with currentEvents and pastEvents arrays
 */
export function separateEventsByDate<T extends ActiveEvent>(
  events: T[],
  referenceDate: Date = new Date()
): { currentEvents: T[]; pastEvents: T[] } {
  const currentEvents: T[] = [];
  const pastEvents: T[] = [];

  events.forEach(event => {
    if (isEventActive(event, referenceDate)) {
      currentEvents.push(event);
    } else {
      pastEvents.push(event);
    }
  });

  return { currentEvents, pastEvents };
}

// ---------------------------------------------------------------------------
// City / Organizer Filters
// ---------------------------------------------------------------------------

/**
 * Filters events by city (exact match).
 * Returns all events when city is null/undefined.
 */
export function filterEventsByCity<T extends OrgFilterableEvent>(
  events: T[],
  city: string | null | undefined,
): T[] {
  if (!city) return events;
  return events.filter(e => e.city === city);
}

/**
 * Filters events by organizer slug (exact match).
 * Returns all events when organizerSlug is null/undefined.
 */
export function filterEventsByOrganizer<T extends OrgFilterableEvent>(
  events: T[],
  organizerSlug: string | null | undefined,
): T[] {
  if (!organizerSlug) return events;
  return events.filter(e => e.organizationSlug === organizerSlug);
}

/**
 * Extracts unique, sorted city names from an array of events.
 * Skips null/undefined/empty city values.
 */
export function extractUniqueCities<T extends OrgFilterableEvent>(
  events: T[],
): string[] {
  const cities = new Set<string>();
  for (const e of events) {
    if (e.city) cities.add(e.city);
  }
  return Array.from(cities).sort();
}

/**
 * Extracts unique organizers (by slug) from an array of events.
 * Returns sorted by name. Skips events with no organizer data.
 */
export function extractUniqueOrganizers<T extends OrgFilterableEvent>(
  events: T[],
): { name: string; slug: string }[] {
  const map = new Map<string, string>();
  for (const e of events) {
    if (e.organizationSlug && e.organizationName && !map.has(e.organizationSlug)) {
      map.set(e.organizationSlug, e.organizationName);
    }
  }
  return Array.from(map.entries())
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
