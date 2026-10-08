import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { EventCardData, SpotlightData } from "@project-flame/ui";
import {
  formatEventDate,
  buildTimeRange,
  formatDay,
  formatMonth,
  isValidIanaTimezone,
  EventSchema,
  getLowestPrice,
} from "@project-flame/lib";
import { z } from "zod";
import type { Event } from "@project-flame/lib";
import { isProductionBuild, INTERNAL_ORG_IDS } from "../lib/internal";

// --- Data Mappers ---

export const mapEventToCardData = (event: Event): EventCardData => {
  const locationParts = [event.venue, event.city].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(", ") : "";
  const rawTz = event.timezone ?? "";
  const tz = isValidIanaTimezone(rawTz) ? rawTz : "America/Guayaquil";

  const dateStr = event.starts_at ? formatEventDate(event.starts_at, tz) : "";
  const dayStr = event.starts_at ? formatDay(event.starts_at, tz) : "";
  const monthStr = event.starts_at ? formatMonth(event.starts_at, tz) : "";

  const startTime = event.starts_at ? buildTimeRange(event.starts_at, null, tz) : "";
  const timeRange = event.starts_at
    ? buildTimeRange(event.starts_at, event.ends_at, tz, event.city)
    : "TBD";

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
    timeRange: timeRange,
    location,
    description: event.description ?? undefined,
    city: event.city ?? null,
    organizationSlug: event.organizations?.slug ?? null,
    organizationName: event.organizations?.name ?? null,
    isRsvp: Boolean(event.requires_rsvp),
    priceDisplay,
  };
};

const mapEventToSpotlightData = (event: Event): SpotlightData => {
  const locationParts = [event.venue, event.city].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(", ") : "";
  const rawTz = event.timezone ?? "";
  const tz = isValidIanaTimezone(rawTz) ? rawTz : "America/Guayaquil";

  const time = event.starts_at
    ? buildTimeRange(event.starts_at, event.ends_at, tz, event.city)
    : "TBD";

  const priceDisplay = getLowestPrice(
    event.ticket_tiers ?? [],
    event.currency ?? "USD",
  );

  // isToday: event's start date in event timezone must match "today" in event timezone
  const isToday =
    event.starts_at && tz
      ? (() => {
          try {
            const eventDateInTz = new Date(event.starts_at).toLocaleDateString("en-CA", {
              timeZone: tz,
            });
            const todayInTz = new Date().toLocaleDateString("en-CA", { timeZone: tz });
            return eventDateInTz === todayInTz;
          } catch {
            return false;
          }
        })()
      : false;

  return {
    id: event.id,
    title: event.name,
    imageUrl: event.image_url || "https://placehold.co/800x600/1a1a2e/ffffff?text=No+Image",
    date: event.starts_at ? formatEventDate(event.starts_at, tz) : "",
    time,
    location,
    isToday,
    ctaLabel: "Reserve Your Spot",
    djs: [],
    priceDisplay,
  };
};

// --- Unified Hook ---

// Cap on the Featured Events carousel — kept in sync with web's
// FEATURED_EVENTS_LIMIT in `apps/web/app/discover/page.tsx`.
// See CHANGELOG_IOS_VERSIONS.md (v1.0.13) for context.
const FEATURED_EVENTS_LIMIT = 10;

export const useAppEvents = () => {
  return useQuery({
    queryKey: ["events", "all"],
    queryFn: async () => {
      try {
        // 1. Fetch ALL relevant events in a single round-trip
        const { data, error } = await supabase
          .from("events")
          .select(`
            *,
            organizations(name, slug),
            ticket_tiers(
              id, price_cents, quantity_total, quantity_sold,
              per_user_limit, sales_start, sales_end,
              registration_form_fields,
              is_manually_sold_out, is_hidden, description,
              ticket_stages(id, name, price_cents, quantity, sold_quantity, order_index, description)
            )
          `)
          .eq("status", "published")
          .gt("ends_at", new Date().toISOString())
          .order("starts_at", { ascending: true });

        if (error) {
          throw error;
        }

        if (__DEV__) {
          console.debug("[useAppEvents] Fetched events count:", data?.length);
        }

        const result = z.array(EventSchema).safeParse(data);
        if (!result.success) {
          console.error("[useAppEvents] Validation failed:", {
            action: "useAppEvents:validate",
            error: result.error,
          });
          throw new Error("Failed to validate events data");
        }

        // Strip internal org events from public production builds AND drop
        // organizer-hidden tiers (W4-C1, May 2026) so attendee status/badge
        // calculations never count tiers that aren't visible. The web RPC
        // get_event_with_tiers handles this server-side; this list query is a
        // direct table read so we filter in memory.
        const rawEvents = (
          isProductionBuild
            ? result.data.filter(
                (e) => !INTERNAL_ORG_IDS.includes(e.organization_id)
              )
            : result.data
        ).map((e) => {
          const eventWithTiers = e as typeof e & {
            ticket_tiers?: Array<{ is_hidden?: boolean } & Record<string, unknown>>;
          };
          return {
            ...e,
            ticket_tiers: (eventWithTiers.ticket_tiers ?? []).filter(
              (t) => t.is_hidden !== true,
            ),
          };
        }) as unknown as Event[];

        // 2. Process & Filter in memory (Zero Latency)
        const allEvents = rawEvents.map(mapEventToCardData);

        // Featured carousel: every event flagged `is_featured`, closest first
        // (rawEvents is already sorted by starts_at ASC), capped at FEATURED_EVENTS_LIMIT.
        const featuredEvents = rawEvents
          .filter((e) => e.is_featured)
          .slice(0, FEATURED_EVENTS_LIMIT)
          .map(mapEventToCardData);

        const upcomingEvents = allEvents.slice(0, 6); // Just take the first 6 sorted by date

        // 3. Derive Spotlight ("Reserve Your Spot") — driven by `main_featured`.
        // The DB enforces at most one main_featured event via idx_single_main_featured_event.
        // Falls back to the first upcoming event so the spotlight slot is never empty.
        const spotlightSource = rawEvents.find((e) => e.main_featured) || rawEvents[0];
        const spotlightEvent = spotlightSource ? mapEventToSpotlightData(spotlightSource) : null;

        return {
          allEvents,
          featuredEvents,
          upcomingEvents,
          spotlightEvent,
        };
      } catch (err) {
        console.error("[useAppEvents] fetchEvents failed:", {
          action: "useAppEvents:fetchEvents",
          error: err,
        });
        throw err;
      }
    },
    // staleTime inherited from QueryClient defaults (5 min) — see _layout.tsx
  });
};
