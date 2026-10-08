"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { FiCalendar, FiMapPin, FiTag, FiSearch } from "react-icons/fi";
import {
  getLowestPrice,
  buildTimeRange,
  isValidIanaTimezone,
  DEFAULT_DISPLAY_TIMEZONE,
  DEFAULT_CATALOG_CITY,
  type TicketStage,
  type TicketTier,
  type OrganizationPublic,
} from "@project-flame/lib";
import { formatDate } from "../lib/date-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal ticket stage shape for catalog display (Supabase select returns subset). */
type CatalogTicketStage = Pick<
  TicketStage,
  "id" | "price_cents" | "quantity" | "sold_quantity" | "order_index"
>;

/** Minimal ticket tier shape for catalog display (getLowestPrice compatible). */
type CatalogTicketTier = Pick<
  TicketTier,
  "id" | "price_cents" | "quantity_total" | "quantity_sold" | "sales_start" | "sales_end"
> & {
  ticket_stages?: CatalogTicketStage[];
};

/** Event shape for events catalog (Supabase join returns organizations as array or single). */
interface CatalogEvent {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  starts_at: string;
  venue: string;
  city: string;
  requires_rsvp: boolean;
  currency: string | null;
  timezone?: string | null;
  organizations?: { name: string; slug: string } | { name: string; slug: string }[] | null;
  ticket_tiers?: CatalogTicketTier[];
}

interface EventsCatalogProps {
  events: CatalogEvent[];
  organizers?: Pick<OrganizationPublic, "id" | "name" | "slug">[];
}

// ─── Event List Card (mirrors EventListCard from mobile packages/ui) ──────────

function EventListCard({ event }: { event: CatalogEvent }) {
  const priceDisplay = event.ticket_tiers?.length
    ? getLowestPrice(event.ticket_tiers, event.currency ?? "USD")
    : null;

  const raw = event.timezone?.trim() ?? "";
  const tz = isValidIanaTimezone(raw) ? raw : DEFAULT_DISPLAY_TIMEZONE;
  const displayTime = buildTimeRange(event.starts_at, null, tz, event.city);
  const displayDate = formatDate(event.starts_at, tz);

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block w-full bg-card rounded-card p-[10px] hover:opacity-90 transition-opacity"
    >
      <div className="flex items-start gap-3">
        {/* Left: 100×100 image */}
        <div className="relative w-[100px] h-[100px] shrink-0 rounded-[8px] overflow-hidden bg-white-10">
          {event.image_url ? (
            <Image
              src={event.image_url}
              alt={event.name}
              fill
              className="object-cover"
              sizes="100px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white-30">
              <FiCalendar size={24} aria-hidden />
            </div>
          )}
          {/* RSVP badge */}
          {event.requires_rsvp && (
            <div className="absolute top-1 right-1 bg-primary rounded-badge px-[6px] py-[2px] flex items-center">
              <span className="text-white-100 font-bold font-poppins uppercase text-[9px] leading-[13px]">
                RSVP
              </span>
            </div>
          )}
        </div>

        {/* Right: Event info */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {/* Event name */}
          <p className="text-white-100 font-poppins-semibold uppercase text-base leading-[22px] m-0 truncate">
            {event.name}
          </p>

          {/* Date + time */}
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 flex items-center justify-center shrink-0 text-white-100">
              <FiCalendar size={16} aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-white-100 text-xs font-poppins-light leading-4">
                {displayDate}
              </span>
              <span className="text-white-100 text-xs font-poppins-light leading-4">
                {displayTime}
              </span>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 flex items-center justify-center shrink-0 text-white-100">
              <FiMapPin size={16} aria-hidden />
            </span>
            <span className="text-white-100 text-xs font-poppins-light leading-4 truncate">
              {event.venue}, {event.city}
            </span>
          </div>

          {/* Price */}
          {priceDisplay != null && (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 flex items-center justify-center shrink-0 text-white-100">
                <FiTag size={16} aria-hidden />
              </span>
              <span className="text-white-100 text-xs font-poppins-medium">
                {priceDisplay}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Main EventsCatalog ───────────────────────────────────────────────────────

export default function EventsCatalog({
  events = [],
  organizers = [],
}: EventsCatalogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCityState] = useState<string | null>(null);
  const [selectedOrganizer, setSelectedOrganizer] = useState<string | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);

  // Derive unique cities
  const cities = useMemo(
    () =>
      Array.from(new Set(events.map((e) => e.city).filter(Boolean))).sort() as string[],
    [events]
  );

  // W0-Q3: default the city filter to Quito on first load — but only if Quito
  // actually has events (so other markets aren't filtered to empty), and only
  // until the user touches the filter. Once touched, reset/clear broadens to
  // all cities (decision Jun 3, 2026) — no "return to Quito".
  const hasUserInteractedRef = useRef(false);
  const hasAppliedDefaultRef = useRef(false);
  const setSelectedCity = useCallback((city: string | null) => {
    hasUserInteractedRef.current = true;
    setSelectedCityState(city);
  }, []);
  useEffect(() => {
    if (
      !hasAppliedDefaultRef.current &&
      !hasUserInteractedRef.current &&
      cities.includes(DEFAULT_CATALOG_CITY)
    ) {
      hasAppliedDefaultRef.current = true;
      setSelectedCityState(DEFAULT_CATALOG_CITY);
    }
  }, [cities]);

  // Filter events — matches mobile EventsScreen filter logic exactly
  const filteredEvents = useMemo(() => {
    let result = events;

    if (selectedCity) {
      result = result.filter((e) => e.city === selectedCity);
    }
    if (selectedOrganizer) {
      result = result.filter((e) =>
        Array.isArray(e.organizations)
          ? e.organizations.some((o) => o.slug === selectedOrganizer)
          : e.organizations?.slug === selectedOrganizer
      );
    }
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q) ||
          e.city.toLowerCase().includes(q)
      );
    }
    return result;
  }, [events, selectedCity, selectedOrganizer, searchQuery]);

  return (
    <main className="pt-16 min-h-screen bg-background">
      <div className="max-w-[800px] mx-auto">

        {/* ── EventsHero — title + subtitle + search bar (matches EventsScreenBody) ── */}
        <div className="w-full px-4 pt-[51px] pb-4">
          {/* Centered title + subtitle */}
          <div className="flex flex-col items-center gap-[11px] mb-[23px]">
            <h1 className="text-white-100 font-poppins-medium text-center text-2xl m-0">
              Discover Events
            </h1>
            <p className="text-white-100 text-center text-sm font-poppins max-w-[311px] m-0">
              Find extraordinary moments happening near you
            </p>
          </div>

          {/* Search bar + filter button */}
          <div className="flex gap-[10px] items-center">
            <div className="flex-1 flex items-center bg-white-5 border border-white-10 rounded-pill px-4 py-2.5 gap-2">
              <FiSearch
                size={18}
                className="shrink-0 text-white-50"
                aria-hidden
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by event name"
                aria-label="Search events by name"
                className="flex-1 bg-transparent text-sm text-white-100 placeholder:text-white-50 outline-none font-poppins"
              />
            </div>
            {/* W0-Q3: a "📍 {city}" pill (matches mobile EventsHero) so the
                active filter is visible next to the search bar; tap it to open
                the filter pills and change/clear. White when a city is set,
                translucent "All cities" otherwise. */}
            <button
              type="button"
              onClick={() => setFilterVisible(!filterVisible)}
              className={`h-11 rounded-full flex items-center justify-center shrink-0 gap-1 px-4 transition-colors ${
                selectedCity
                  ? "bg-white-100 hover:opacity-90"
                  : "bg-white-10 hover:bg-white-20"
              }`}
              aria-label={selectedCity ? `Filtering by ${selectedCity} — change filter` : "Filter events — all cities"}
            >
              <FiMapPin
                size={16}
                className={`shrink-0 ${selectedCity ? "text-dark" : "text-white-80"}`}
                aria-hidden
              />
              <span
                className={`text-xs leading-4 font-poppins-medium whitespace-nowrap ${
                  selectedCity ? "text-dark" : "text-white-80"
                }`}
              >
                {selectedCity ?? "All cities"}
              </span>
            </button>
          </div>
        </div>

        {/* ── Filter pills — city + organizer chips ── */}
        {filterVisible && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {/* City filter */}
            {cities.length > 0 && (
              <div>
                <p className="text-white-50 text-xs font-poppins mb-2">City</p>
                <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <button
                    type="button"
                    onClick={() => setSelectedCity(null)}
                    className={`shrink-0 px-4 py-2 rounded-pill text-sm font-poppins transition-colors ${
                      selectedCity === null
                        ? "bg-white-100 text-dark"
                        : "bg-white-10 text-white-50 hover:bg-white-20 hover:text-white-100"
                    }`}
                  >
                    All
                  </button>
                  {cities.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() =>
                        setSelectedCity(city === selectedCity ? null : city)
                      }
                      className={`shrink-0 px-4 py-2 rounded-pill text-sm font-poppins transition-colors ${
                        selectedCity === city
                          ? "bg-white-100 text-dark"
                          : "bg-white-10 text-white-50 hover:bg-white-20 hover:text-white-100"
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Organizer filter */}
            {organizers.length > 0 && (
              <div>
                <p className="text-white-50 text-xs font-poppins mb-2">
                  Organizer
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <button
                    type="button"
                    onClick={() => setSelectedOrganizer(null)}
                    className={`shrink-0 px-4 py-2 rounded-pill text-sm font-poppins transition-colors ${
                      selectedOrganizer === null
                        ? "bg-white-100 text-dark"
                        : "bg-white-10 text-white-50 hover:bg-white-20 hover:text-white-100"
                    }`}
                  >
                    All
                  </button>
                  {organizers.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() =>
                        setSelectedOrganizer(
                          org.slug === selectedOrganizer ? null : org.slug
                        )
                      }
                      className={`shrink-0 px-4 py-2 rounded-pill text-sm font-poppins transition-colors ${
                        selectedOrganizer === org.slug
                          ? "bg-white-100 text-dark"
                          : "bg-white-10 text-white-50 hover:bg-white-20 hover:text-white-100"
                      }`}
                    >
                      {org.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Vertical event list (matches EventsList from mobile) ── */}
        <div className="px-4 pb-8 mt-[50px]">
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <p className="text-white-50 text-center font-poppins">
                {searchQuery || selectedCity || selectedOrganizer
                  ? "No events match your filters."
                  : "No events available right now. Check back soon!"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 items-center">
              {filteredEvents.map((event) => (
                <div key={event.id} className="w-full max-w-[358px]">
                  <EventListCard event={event} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
