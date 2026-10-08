"use client";

import Link from "next/link";
import Image from "next/image";
import { FiCalendar, FiMapPin, FiTag } from "react-icons/fi";
import { getLowestPrice, buildTimeRange, isValidIanaTimezone } from "@project-flame/lib";
import { formatDate } from "../../lib/date-utils";
import type { DiscoverEvent } from "./types";

interface SpotlightCardProps {
  event: DiscoverEvent | null;
}

export function SpotlightCard({ event }: SpotlightCardProps) {
  if (!event) return null;

  const priceDisplay = event.ticket_tiers?.length
    ? getLowestPrice(event.ticket_tiers, event.currency ?? "USD")
    : null;

  const tz = isValidIanaTimezone(event.timezone ?? "") ? event.timezone! : null;

  // Check if event is today (in the event's local timezone)
  const isToday = (() => {
    try {
      const tzOpts = tz ? { timeZone: tz } : {};
      const eventDay = new Date(event.starts_at).toLocaleDateString("en-CA", tzOpts);
      const todayDay = new Date().toLocaleDateString("en-CA", tzOpts);
      return eventDay === todayDay;
    } catch {
      return false;
    }
  })();

  return (
    <div className="px-4">
      <Link
        href={`/events/${event.slug}`}
        className="block bg-white-5 rounded-card pt-4 pb-8 px-4 hover:opacity-95 transition-opacity"
      >
        {/* Hero image */}
        <div className="w-full h-[300px] rounded-card overflow-hidden relative mb-6">
          {event.image_url ? (
            <Image
              src={event.image_url}
              alt={event.name}
              fill
              className="object-cover"
              sizes="(max-width: 800px) 100vw, 760px"
            />
          ) : (
            <div className="w-full h-full bg-white-10" />
          )}
        </div>

        {/* Event details */}
        <div className="flex flex-col gap-[17px]">
          <h3 className="text-white-100 font-poppins-semibold text-lg uppercase m-0">
            {event.name}
          </h3>

          <div className="flex flex-col gap-2">
            {/* Date/time row */}
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 flex items-center justify-center shrink-0 text-white-100">
                <FiCalendar size={16} aria-hidden />
              </span>
              <div className="flex items-center gap-2">
                <span className="border-r border-white-30 pr-[6px]">
                  {isToday ? (
                    <span className="text-primary font-poppins-medium text-xs">
                      Today
                    </span>
                  ) : (
                    <span className="text-white-100 font-poppins-light text-xs">
                      {formatDate(event.starts_at, tz)}
                    </span>
                  )}
                </span>
                <span className="text-white-100 font-poppins-light text-xs">
                  {buildTimeRange(event.starts_at, null, tz, event.city)}
                </span>
              </div>
            </div>

            {/* Location row */}
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 flex items-center justify-center shrink-0 text-white-100">
                <FiMapPin size={16} aria-hidden />
              </span>
              <span className="text-white-100 font-poppins-light text-xs truncate">
                {event.venue}, {event.city}
              </span>
            </div>

            {/* Price row */}
            {priceDisplay != null && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 flex items-center justify-center shrink-0 text-white-100">
                  <FiTag size={16} aria-hidden />
                </span>
                <span className="text-white-100 font-poppins-medium text-xs">
                  {priceDisplay}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center mt-6">
          <span className="inline-flex items-center bg-white-100 text-dark px-6 py-3 rounded-pill font-poppins-medium text-sm">
            Reserve Your Spot
          </span>
        </div>
      </Link>
    </div>
  );
}
