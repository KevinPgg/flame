"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { FiCalendar, FiMapPin, FiTag, FiSearch, FiChevronRight } from "react-icons/fi";
import { Navbar, Footer } from "./index";
import OnboardingModal from "./modals/OnboardingModal";
import { getLowestPrice, buildTimeRange, isValidIanaTimezone, DEFAULT_DISPLAY_TIMEZONE, DEFAULT_CATALOG_CITY } from "@project-flame/lib";
import { formatDate, formatDay, formatMonth } from "../lib/date-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketStage {
  id: string;
  price_cents: number;
  quantity: number;
  sold_quantity: number;
  order_index: number;
}

interface TicketTier {
  id: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  sales_start: string | null;
  sales_end: string | null;
  ticket_stages?: TicketStage[];
}

interface HomeEvent {
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
  ticket_tiers?: TicketTier[];
}

interface HomeContentProps {
  initialEvents: HomeEvent[];
}

// ─── Single Event Card (mirrors HomeFeedEventCard from mobile) ─────────────

function HomeFeedEventCard({ event }: { event: HomeEvent }) {
  const priceDisplay =
    event.ticket_tiers && event.ticket_tiers.length > 0
      ? getLowestPrice(event.ticket_tiers, event.currency ?? "USD")
      : null;

  const raw = event.timezone?.trim() ?? "";
  const tz = isValidIanaTimezone(raw) ? raw : DEFAULT_DISPLAY_TIMEZONE;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block rounded-card overflow-hidden w-full relative aspect-square"
    >
      {/* Event image */}
      {event.image_url ? (
        <Image
          src={event.image_url}
          alt={event.name}
          fill
          className="object-cover"
          sizes="(max-width: 820px) 100vw, 384px"
        />
      ) : (
        <div className="w-full h-full bg-white-10 flex items-center justify-center text-white-30">
          <FiCalendar size={40} aria-hidden />
        </div>
      )}

      {/* Date badge — top left (matches mobile: subtitle1 = text-sm, day bold, month light) */}
      <div className="absolute top-2 left-2 bg-black/55 rounded-badge px-[10px] py-[6px] flex items-center gap-2">
        <span className="text-white text-sm font-bold font-poppins uppercase leading-5">
          {formatDay(event.starts_at, tz)}
        </span>
        <span className="text-white text-sm font-poppins-light leading-5">
          {formatMonth(event.starts_at, tz)}
        </span>
      </div>

      {/* RSVP badge — top right (matches mobile: same text-sm + font-bold as date day) */}
      {event.requires_rsvp && (
        <div className="absolute top-2 right-2 bg-primary rounded-badge px-[10px] py-[6px] flex items-center">
          <span className="text-white text-sm font-bold font-poppins uppercase leading-5">
            RSVP
          </span>
        </div>
      )}

      {/* Gradient overlay — bottom 60% */}
      <div
        className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-b from-transparent to-surface pointer-events-none"
        aria-hidden
      />

      {/* Content overlay — bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-2">
        {/* Title — h4 variant: text-lg font-poppins-semibold */}
        <p className="text-white-100 font-poppins-semibold uppercase text-lg leading-snug line-clamp-2 m-0">
          {event.name}
        </p>

        {/* Date + time row */}
        <div className="flex items-center gap-2">
          <FiCalendar size={14} className="shrink-0 text-white-100" aria-hidden />
          <span className="text-white-100 text-xs font-poppins-light leading-4 border-r border-white-10 pr-2">
            {formatDate(event.starts_at, tz)}
          </span>
          <span className="text-white-100 text-xs font-poppins-light leading-4">
            {buildTimeRange(event.starts_at, null, tz, event.city)}
          </span>
        </div>

        {/* Location row */}
        <div className="flex items-center gap-2">
          <FiMapPin size={14} className="shrink-0 text-white-100" aria-hidden />
          <span className="text-white-100 text-xs font-poppins-light leading-4 truncate">
            {event.venue}, {event.city}
          </span>
        </div>

        {/* Price row — only if priceDisplay is not null */}
        {priceDisplay != null && (
          <div className="flex items-center gap-2">
            <FiTag size={14} className="shrink-0 text-white-100" aria-hidden />
            <span className="text-white-100 text-xs font-poppins-medium">
              {priceDisplay}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

// ─── "Featured events, organizers and more →" CTA (mirrors mobile) ─────────

function FeaturedEventsCta() {
  return (
    <div className="flex justify-end">
      <Link
        href="/discover"
        className="flex items-center gap-[7px] text-white-100 hover:opacity-80 transition-opacity"
      >
        <span className="text-sm font-poppins">
          Featured events, organizers and more
        </span>
        <FiChevronRight size={20} className="shrink-0" aria-hidden />
      </Link>
    </div>
  );
}

// ─── Search / filter bar (mirrors EventsHero from mobile) ─────────────────

interface SearchHeroProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onFilterClick: () => void;
  selectedCity: string | null;
}

function SearchHero({ searchQuery, onSearchChange, onFilterClick, selectedCity }: SearchHeroProps) {
  return (
    <div className="w-full px-4 pt-4 pb-2">
      <div className="flex gap-[10px] items-center">
        {/* Search input — light background matching mobile */}
        <div className="flex-1 flex items-center bg-[#F6F6F6] rounded-[90px] px-4 py-3 gap-[10px]">
          <FiSearch
            size={20}
            className="shrink-0 text-[#5D5D5D]"
            aria-hidden
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by event name"
            className="flex-1 bg-transparent text-sm text-[#5D5D5D] placeholder:text-[#5D5D5D] outline-none font-poppins"
          />
        </div>

        {/* Filter button — W0-Q3: a "📍 {city}" pill (matches mobile EventsHero)
            so the active filter is visible next to the search bar; tap it to
            open the filter panel and change/clear. White when a city is set,
            translucent "All cities" otherwise. */}
        <button
          type="button"
          onClick={onFilterClick}
          className={`h-11 rounded-full flex items-center justify-center shrink-0 gap-1 px-4 transition-colors ${
            selectedCity ? "bg-white-100 hover:opacity-90" : "bg-white-10 hover:bg-white-20"
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
  );
}

// ─── Filter panel (city filter) ───────────────────────────────────────────

interface FilterPanelProps {
  cities: string[];
  selectedCity: string | null;
  onCityChange: (city: string | null) => void;
  onClose: () => void;
}

function FilterPanel({ cities, selectedCity, onCityChange, onClose }: FilterPanelProps) {
  if (cities.length === 0) return null;
  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-white-100 font-poppins-medium text-sm">Filter by City</span>
        <button
          type="button"
          onClick={onClose}
          className="text-white-50 text-xs font-poppins hover:text-white-100 transition-colors"
        >
          Done
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => onCityChange(null)}
          className={`shrink-0 px-4 py-2 rounded-pill text-sm font-poppins transition-colors ${
            selectedCity === null
              ? "bg-white-100 text-dark"
              : "bg-white-10 text-white-50 hover:bg-white-20"
          }`}
        >
          All
        </button>
        {cities.map((city) => (
          <button
            key={city}
            type="button"
            onClick={() => onCityChange(city)}
            className={`shrink-0 px-4 py-2 rounded-pill text-sm font-poppins transition-colors ${
              selectedCity === city
                ? "bg-white-100 text-dark"
                : "bg-white-10 text-white-50 hover:bg-white-20"
            }`}
          >
            {city}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main HomeContent ─────────────────────────────────────────────────────────

export default function HomeContent({ initialEvents }: HomeContentProps) {
  const { isSignedIn, isLoaded } = useUser();
  const searchParams = useSearchParams();
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCityState] = useState<string | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);

  // Onboarding modal
  useEffect(() => {
    if (!isSignedIn || !isLoaded) return;
    if (searchParams.get("onboarding") === "true") {
      setShowOnboardingModal(true);
    }
  }, [isSignedIn, isLoaded, searchParams]);

  const handleOnboardingClose = () => {
    setShowOnboardingModal(false);
    if (searchParams.get("onboarding") === "true") {
      const url = new URL(window.location.href);
      url.searchParams.delete("onboarding");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleOnboardingSuccess = () => {
    if (searchParams.get("onboarding") === "true") {
      const url = new URL(window.location.href);
      url.searchParams.delete("onboarding");
      window.history.replaceState({}, "", url.toString());
    }
    setShowOnboardingModal(false);
  };

  // Derive cities from events
  const cities = useMemo(
    () =>
      Array.from(
        new Set(initialEvents.map((e) => e.city).filter(Boolean))
      ).sort() as string[],
    [initialEvents]
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

  // Filter events
  const filteredEvents = initialEvents.filter((event) => {
    const matchesCity = !selectedCity || event.city === selectedCity;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      event.name.toLowerCase().includes(q) ||
      event.venue.toLowerCase().includes(q) ||
      event.city.toLowerCase().includes(q);
    return matchesCity && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Main content — pt-16 to clear fixed navbar */}
      <main className="pt-16">
        <div className="max-w-[800px] mx-auto">
          {/* ── Search hero (matches EventsHero on mobile) ── */}
          <SearchHero
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onFilterClick={() => setFilterVisible(!filterVisible)}
            selectedCity={selectedCity}
          />

          {/* ── Filter panel (shows when filter button tapped) ── */}
          {filterVisible && (
            <FilterPanel
              cities={cities}
              selectedCity={selectedCity}
              onCityChange={(c) => {
                setSelectedCity(c);
              }}
              onClose={() => setFilterVisible(false)}
            />
          )}

          {/* ── "Featured events, organizers and more →" CTA ── */}
          <div className="px-4 py-2">
            <FeaturedEventsCta />
          </div>

          {/* ── Event feed: list <820px, 2-col grid ≥820px (max 384px/card, 1:1) ── */}
          <div className="flex flex-col min-[820px]:grid min-[820px]:grid-cols-2 gap-4 px-4 pb-4">
            {filteredEvents.length === 0 ? (
              <div className="flex items-center justify-center py-16 px-4 min-[820px]:col-span-2">
                <p className="text-white-50 text-center font-poppins">
                  {searchQuery || selectedCity
                    ? "No events match your search."
                    : "No events available right now. Check back soon!"}
                </p>
              </div>
            ) : (
              filteredEvents.flatMap((event, index) => {
                const card = (
                  <div key={event.id} className="min-[820px]:max-h-[384px] min-[820px]:max-w-[384px] min-[820px]:w-full min-[820px]:justify-self-center min-[820px]:aspect-square">
                    <HomeFeedEventCard event={event} />
                  </div>
                );
                const cta =
                  (index + 1) % 5 === 0 && index + 1 < filteredEvents.length ? (
                    <div key={`cta-${event.id}`} className="min-[820px]:col-span-2 pt-4">
                      <FeaturedEventsCta />
                    </div>
                  ) : null;
                return cta ? [card, cta] : [card];
              })
            )}
          </div>
        </div>
      </main>

      <Footer />

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboardingModal}
        onClose={handleOnboardingClose}
        onSuccess={handleOnboardingSuccess}
      />
    </div>
  );
}
