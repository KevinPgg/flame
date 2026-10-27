/**
 * Flame 2.0 Home (fase 2.2) — one rule set for web and app: events grouped by day, cities with
 * their counts, and the price line of a card. Pure functions; screens only render.
 */
import { lowestPriceInfo, type PriceableTier } from "./availability";
import { isValidIanaTimezone } from "./format";

const FALLBACK_TZ = "America/Guayaquil";

export type FeedEventTime = { starts_at: string; ends_at: string; timezone?: string | null };

function tzOf(e: { timezone?: string | null }): string {
  return e.timezone && isValidIanaTimezone(e.timezone) ? e.timezone : FALLBACK_TZ;
}

/** Calendar day (YYYY-MM-DD) of an instant in a time zone. */
export function dayKeyIn(instant: Date | string, tz: string): string {
  return new Date(instant).toLocaleDateString("en-CA", { timeZone: tz });
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type FeedDay<T> = {
  /** "now" for events already running; otherwise the event's local date (YYYY-MM-DD). */
  key: string;
  when: "now" | "today" | "tomorrow" | "later";
  /** A start time inside the day, for formatting its label ("Friday, Oct 31"). */
  sample: string;
  /** Time zone of that day's events (labels are written in it). */
  timezone: string;
  events: T[];
};

/**
 * Upcoming events (already sorted or not) → days in order: "Happening now" first (started,
 * not ended), then each local date. Today / tomorrow are relative to each event's own zone.
 */
export function groupEventsByDay<T extends FeedEventTime>(events: T[], now: Date = new Date()): FeedDay<T>[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const days: FeedDay<T>[] = [];
  const byKey = new Map<string, FeedDay<T>>();
  for (const e of sorted) {
    if (Date.parse(e.ends_at) <= now.getTime()) continue;
    const tz = tzOf(e);
    const running = Date.parse(e.starts_at) <= now.getTime();
    const key = running ? "now" : dayKeyIn(e.starts_at, tz);
    let day = byKey.get(key);
    if (!day) {
      const today = dayKeyIn(now, tz);
      const when = running ? "now" : key === today ? "today" : key === addDays(today, 1) ? "tomorrow" : "later";
      day = { key, when, sample: e.starts_at, timezone: tz, events: [] };
      byKey.set(key, day);
      days.push(day);
    }
    day.events.push(e);
  }
  // "now" can be created after a later day only if input was unsorted by start; keep it first.
  return days.sort((a, b) => (a.key === "now" ? -1 : b.key === "now" ? 1 : 0));
}

/** Cities that have events, with how many — most events first, then by name. */
export function cityCounts(events: Array<{ city?: string | null }>): Array<{ city: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of events) if (e.city) counts.set(e.city, (counts.get(e.city) ?? 0) + 1);
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/** Price line of a Home card, before translation. */
export type PriceSummary =
  | { kind: "free" }
  | { kind: "price"; cents: number }
  | { kind: "from"; cents: number }
  | { kind: "soldOut" }
  | { kind: "notYet" }
  | null;

export function priceSummary(tiers: PriceableTier[] | null | undefined): PriceSummary {
  const info = lowestPriceInfo(tiers ?? []);
  if (info.status === "none") return null;
  if (info.status === "soldOut") return { kind: "soldOut" };
  if (info.status === "notYet") return { kind: "notYet" };
  if (info.lowCents === 0) return { kind: "free" };
  return info.lowCents === info.highCents ? { kind: "price", cents: info.lowCents } : { kind: "from", cents: info.lowCents };
}

/** Card date line: "Fri, Oct 31 · 10:00 PM" (in the event's zone and the reader's language). */
export function feedWhen(startsAt: string, timezone: string | null | undefined, locale: string): string {
  const timeZone = timezone && isValidIanaTimezone(timezone) ? timezone : FALLBACK_TZ;
  const d = new Date(startsAt);
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone }).format(d);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(d);
  return `${day} · ${time}`;
}

/** Day heading for a later date: "Friday, October 31". */
export function feedDayTitle(day: Pick<FeedDay<unknown>, "sample" | "timezone">, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: day.timezone }).format(new Date(day.sample));
}
