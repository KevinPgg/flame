/**
 * Maps raw event data (from Supabase) to EventCardData shape.
 * Mirrors mobile useAppEvents mapEventToCardData.
 */

import type { Event } from "@project-flame/lib";
import {
  formatEventDate,
  formatEventTime,
  formatDay,
  formatMonth,
  getTimezoneAbbr,
  isValidIanaTimezone,
  getLowestPrice,
} from "@project-flame/lib";

export interface EventCardData {
  id: string;
  title: string;
  imageUrl: string;
  date: string;
  day: string;
  month: string;
  time: string;
  timeRange?: string;
  location: string;
  description?: string;
  city?: string | null;
  organizationSlug?: string | null;
  organizationName?: string | null;
  isRsvp?: boolean;
  priceDisplay?: string | null;
}

export function mapEventToCardData(event: Event): EventCardData {
  const locationParts = [event.venue, event.city].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(", ") : "";
  const rawTz = event.timezone ?? "";
  const tz = isValidIanaTimezone(rawTz) ? rawTz : "America/Guayaquil";

  const dateStr = event.starts_at ? formatEventDate(event.starts_at, tz) : "";
  const dayStr = event.starts_at ? formatDay(event.starts_at, tz) : "";
  const monthStr = event.starts_at ? formatMonth(event.starts_at, tz) : "";

  const startTime = event.starts_at ? formatEventTime(event.starts_at, tz) : "";
  const endTime = event.ends_at ? formatEventTime(event.ends_at, tz) : "";
  const tzAbbr = event.starts_at ? getTimezoneAbbr(tz, event.starts_at) : "";
  const baseRange = startTime && endTime ? `${startTime} - ${endTime}` : startTime || "TBD";
  const timeRange = tzAbbr ? `${baseRange} ${tzAbbr}` : baseRange;

  const priceDisplay = getLowestPrice(
    event.ticket_tiers ?? [],
    event.currency ?? "USD",
  );

  return {
    id: event.id,
    title: event.name,
    imageUrl: event.image_url || "https://placehold.co/600x400/1a1a2e/ffffff?text=No+Image",
    date: dateStr,
    day: dayStr,
    month: monthStr,
    time: startTime,
    timeRange,
    location,
    description: event.description ?? undefined,
    city: event.city ?? null,
    organizationSlug: event.organizations?.slug ?? null,
    organizationName: event.organizations?.name ?? null,
    isRsvp: Boolean(event.requires_rsvp),
    priceDisplay,
  };
}
