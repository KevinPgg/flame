"use client";

import { useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { FiCalendar, FiMapPin, FiTag, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { getLowestPrice, buildTimeRange, isValidIanaTimezone } from "@project-flame/lib";
import { formatDate, formatDay, formatMonth } from "../../lib/date-utils";
import type { DiscoverEvent } from "./types";

// ─── Event Card (matches HomeFeedEventCard / EventCard from home) ────────────

function DiscoverEventCard({ event }: { event: DiscoverEvent }) {
  const priceDisplay = event.ticket_tiers?.length
    ? getLowestPrice(event.ticket_tiers, event.currency ?? "USD")
    : null;

  const tz = isValidIanaTimezone(event.timezone ?? "") ? event.timezone! : undefined;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block rounded-card overflow-hidden w-full relative aspect-square shrink-0"
    >
      {event.image_url ? (
        <Image
          src={event.image_url}
          alt={event.name}
          fill
          className="object-cover"
          sizes="280px"
        />
      ) : (
        <div className="w-full h-full bg-white-10 flex items-center justify-center text-white-30">
          <FiCalendar size={40} aria-hidden />
        </div>
      )}

      {/* Date badge — day number and month: day bold, month light */}
      <div className="absolute top-2 left-2 bg-black/55 rounded-badge px-[10px] py-[6px] flex items-center gap-2">
        <span className="text-white-100 text-sm font-bold font-poppins uppercase leading-5">
          {formatDay(event.starts_at, tz)}
        </span>
        <span className="text-white-100 text-sm font-poppins-light leading-5">
          {formatMonth(event.starts_at, tz)}
        </span>
      </div>

      {/* RSVP badge */}
      {event.requires_rsvp && (
        <div className="absolute top-2 right-2 bg-primary rounded-badge px-[10px] py-[6px] flex items-center">
          <span className="text-white-100 text-sm font-bold font-poppins uppercase leading-5">
            RSVP
          </span>
        </div>
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-b from-transparent to-surface pointer-events-none"
        aria-hidden
      />

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-2">
        <p className="text-white-100 font-poppins-semibold uppercase text-lg leading-snug line-clamp-2 m-0">
          {event.name}
        </p>
        <div className="flex items-center gap-2">
          <FiCalendar size={14} className="shrink-0 text-white-100" aria-hidden />
          <span className="text-white-100 text-xs font-poppins-light leading-4 border-r border-white-10 pr-2">
            {formatDate(event.starts_at, tz)}
          </span>
          <span className="text-white-100 text-xs font-poppins-light leading-4">
            {buildTimeRange(event.starts_at, null, tz ?? null, event.city)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FiMapPin size={14} className="shrink-0 text-white-100" aria-hidden />
          <span className="text-white-100 text-xs font-poppins-light leading-4 truncate">
            {event.venue}, {event.city}
          </span>
        </div>
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

// ─── Events Section ──────────────────────────────────────────────────────────

interface EventsSectionProps {
  title: string;
  events: DiscoverEvent[];
}

export function EventsSection({ title, events }: EventsSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = events.length;

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!scrollRef.current || count === 0) return;
      const card = scrollRef.current.children[index] as HTMLElement | undefined;
      if (card) {
        scrollRef.current.scrollTo({
          left: card.offsetLeft - scrollRef.current.offsetLeft,
          behavior: "smooth",
        });
      }
    },
    [count]
  );

  const getCurrentIndex = useCallback(() => {
    if (!scrollRef.current || count === 0) return 0;
    const left = scrollRef.current.scrollLeft;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < count; i++) {
      const card = scrollRef.current.children[i] as HTMLElement;
      const cardLeft = card.offsetLeft - scrollRef.current.offsetLeft;
      const dist = Math.abs(left - cardLeft);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }, [count]);

  const handlePrev = useCallback(() => {
    const curr = getCurrentIndex();
    scrollToIndex(Math.max(0, curr - 1));
  }, [scrollToIndex, getCurrentIndex]);

  const handleNext = useCallback(() => {
    const curr = getCurrentIndex();
    scrollToIndex(Math.min(count - 1, curr + 1));
  }, [scrollToIndex, getCurrentIndex, count]);

  if (events.length === 0) return null;

  return (
    <div className="relative">
      <div className="px-4 mb-4 flex items-center justify-between gap-4">
        <h2 className="text-white-100 font-poppins-semibold text-lg m-0">
          {title}
        </h2>
        {count > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              className="w-9 h-9 rounded-full bg-black/40 text-white-100 flex items-center justify-center hover:bg-black/60 transition-colors"
              aria-label="Previous events"
            >
              <FiChevronLeft size={20} aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="w-9 h-9 rounded-full bg-black/40 text-white-100 flex items-center justify-center hover:bg-black/60 transition-colors"
              aria-label="Next events"
            >
              <FiChevronRight size={20} aria-hidden />
            </button>
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {events.map((event) => (
          <div key={event.id} className="shrink-0 w-[280px]">
            <DiscoverEventCard event={event} />
          </div>
        ))}
      </div>
    </div>
  );
}
