"use client";

import Link from "next/link";
import Image from "next/image";
import { FiCalendar, FiMapPin, FiTag } from "react-icons/fi";
import type { EventCardData } from "../../lib/map-event-to-card";

/**
 * Web equivalent of mobile HomeFeedList HomeFeedEventCard.
 * aspect-square image, date badge top-left, RSVP top-right, gradient overlay,
 * title/date/location/price at bottom.
 */
export function HomeFeedEventCard({
  event,
  href,
}: {
  event: EventCardData;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-card overflow-hidden hover:opacity-95 transition-opacity"
    >
      <div className="relative aspect-square w-full overflow-hidden">
        <Image
          src={event.imageUrl}
          alt={event.title}
          fill
          className="object-cover"
          sizes="(max-width: 800px) 100vw, 800px"
        />

        {/* Date badge top-left — day number bold, month light */}
        <div className="absolute top-2 left-2 bg-black/55 rounded-badge px-[10px] py-1.5 flex flex-row items-center gap-2">
          <span className="text-white-100 text-sm font-bold font-poppins uppercase">
            {event.day}
          </span>
          <span className="text-white-100 text-sm font-poppins-light">
            {event.month}
          </span>
        </div>

        {/* RSVP badge top-right */}
        {event.isRsvp && (
          <div className="absolute top-2 right-2 bg-primary rounded-badge px-[10px] py-1.5">
            <span className="text-white-100 text-sm font-bold font-poppins uppercase">
              RSVP
            </span>
          </div>
        )}

        {/* Gradient overlay bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[60%] bg-gradient-to-t from-surface to-transparent pointer-events-none"
          aria-hidden
        />

        {/* Content overlay bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-2">
          <h3 className="text-white-100 font-poppins-semibold text-lg uppercase line-clamp-2">
            {event.title}
          </h3>
          <div className="flex flex-row gap-2 items-center">
            <FiCalendar size={14} className="text-white-100 shrink-0" />
            <div className="flex flex-row items-center gap-2 flex-1 min-w-0">
              <span className="text-white-100 text-xs font-poppins-light border-r border-white-10 pr-1">
                {event.date}
              </span>
              <span className="text-white-100 text-xs font-poppins-light truncate">
                {event.timeRange || event.time}
              </span>
            </div>
          </div>
          <div className="flex flex-row gap-2 items-center min-w-0">
            <FiMapPin size={14} className="text-white-100 shrink-0" />
            <span className="text-white-100 text-xs font-poppins-light truncate">
              {event.location}
            </span>
          </div>
          {event.priceDisplay != null && (
            <div className="flex flex-row gap-2 items-center">
              <FiTag size={14} className="text-white-100 shrink-0" />
              <span className="text-white-100 text-xs font-poppins-medium truncate">
                {event.priceDisplay}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
