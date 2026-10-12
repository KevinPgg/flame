/**
 * Organizer dashboard model — pure functions shared by web and mobile (Flame 2.0).
 *
 * Mirrors the rules of the v1 web dashboard (apps/web/app/components/organizer/OrganizerAdminView.tsx)
 * so v2 shows exactly the same numbers:
 *   - Role scope: owner/admin see every event; an "organizer" member only the events assigned to them.
 *   - The list merges owned events and events the org co-hosts (deduped by id).
 *   - "Total events" counts that merged list.
 *   - "Total revenue" sums `totalRevenue` (net, server-computed) of OWNED scoped events only,
 *     grouped by currency. Co-hosted events don't add to the co-host's revenue.
 */
import { separateEventsByDate } from "../utils/event-filters";

export interface DashboardEvent {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  currency?: string | null;
  totalRevenue?: number | null;
  totalAttendees?: number | null;
  pending_rsvps?: number | null;
  requires_rsvp?: boolean | null;
}

export interface CohostEntry<E> {
  event: E;
  owner_org_name: string;
}

export interface OwnerCohostAssignmentRef {
  event_id: string;
  cohost_org_name: string;
}

export interface OrganizerEventListInput<E extends DashboardEvent> {
  events: E[];
  cohostEvents?: CohostEntry<E>[];
  ownerCohostAssignments?: OwnerCohostAssignmentRef[];
  /**
   * `undefined` = full access (owner/admin).
   * `string[]` = only these event ids (organizer role, from their event assignments).
   */
  assignedEventIds?: string[];
}

export interface OrganizerEventList<E extends DashboardEvent> {
  /** Owned events in scope (drive revenue). */
  owned: E[];
  /** Owned + co-hosted events in scope, deduped. Drives the list and "Total events". */
  all: E[];
  /** event id → partner org names (both directions), unique, in first-seen order. */
  cohostPartners: Record<string, string[]>;
}

export function buildOrganizerEventList<E extends DashboardEvent>(
  input: OrganizerEventListInput<E>
): OrganizerEventList<E> {
  const { events, cohostEvents = [], ownerCohostAssignments = [], assignedEventIds } = input;
  const inScope = (e: E) => assignedEventIds === undefined || assignedEventIds.includes(e.id);

  const owned = events.filter(inScope);
  const byId = new Map<string, E>();
  for (const e of owned) byId.set(e.id, e);
  for (const c of cohostEvents) {
    if (inScope(c.event) && !byId.has(c.event.id)) byId.set(c.event.id, c.event);
  }

  const partners: Record<string, string[]> = {};
  const add = (eventId: string, name: string) => {
    const list = (partners[eventId] ??= []);
    if (!list.includes(name)) list.push(name);
  };
  for (const a of ownerCohostAssignments) add(a.event_id, a.cohost_org_name);
  for (const c of cohostEvents) add(c.event.id, c.owner_org_name);

  return { owned, all: Array.from(byId.values()), cohostPartners: partners };
}

export interface CurrencyTotal {
  /** Upper-case ISO code, e.g. "USD". */
  currency: string;
  cents: number;
}

/** Sum of `totalRevenue` per currency, in first-seen order (missing currency → USD). */
export function revenueByCurrency(events: DashboardEvent[]): CurrencyTotal[] {
  const map = new Map<string, number>();
  for (const e of events) {
    const currency = (e.currency || "USD").toUpperCase();
    map.set(currency, (map.get(currency) ?? 0) + (e.totalRevenue || 0));
  }
  return Array.from(map, ([currency, cents]) => ({ currency, cents }));
}

/** Case- and accent-insensitive name search ("fiesta" finds "Fiésta"). Empty query → all. */
export function searchEventsByName<E extends { name: string }>(events: E[], query: string): E[] {
  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = normalize(query.trim());
  if (!q) return events;
  return events.filter((e) => normalize(e.name).includes(q));
}

/**
 * Current & upcoming (soonest first) vs past (most recent first).
 * Same "current" rule as v1: the event hasn't ended yet.
 */
export function splitEventsByTime<E extends DashboardEvent>(
  events: E[],
  now: Date = new Date()
): { current: E[]; past: E[] } {
  const { currentEvents, pastEvents } = separateEventsByDate(events, now);
  const time = (e: E) => new Date(e.starts_at).getTime();
  return {
    current: [...currentEvents].sort((a, b) => time(a) - time(b)),
    past: [...pastEvents].sort((a, b) => time(b) - time(a)),
  };
}

/** Pending RSVP requests across the given events (sidebar / tab badge). */
export function totalPendingRsvps(events: DashboardEvent[]): number {
  return events.reduce((sum, e) => sum + (e.pending_rsvps || 0), 0);
}

/**
 * Localized date/time of an event in ITS timezone (not the viewer's), e.g.
 * en → { date: "Sat, Oct 24", time: "10:00 PM" }, es → { date: "sáb, 24 oct", time: "22:00" }.
 * Invalid date → empty strings. Invalid/missing timezone → America/Guayaquil.
 */
export function formatEventDateTime(
  iso: string,
  timezone: string | null | undefined,
  locale: string
): { date: string; time: string } {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return { date: "", time: "" };
  const fmt = (timeZone: string) => ({
    date: new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone }).format(d),
    time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(d),
  });
  try {
    return fmt(timezone?.trim() || "America/Guayaquil");
  } catch {
    return fmt("America/Guayaquil");
  }
}
