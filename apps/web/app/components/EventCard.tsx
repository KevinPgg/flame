"use client";

import { useRouter } from "next/navigation";
import {
  getLowestPrice,
} from "@project-flame/lib";
import { LinkifiedText } from "../lib/utils/linkify-text";

interface EventCardTicketStage {
  price_cents?: number;
  quantity?: number;
  sold_quantity?: number;
}

interface EventCardTicketTier {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  per_user_limit: number | null;
  sales_start: string | null;
  sales_end: string | null;
  ticket_stages?: EventCardTicketStage[];
}

interface EventCardProps {
  event: {
    // Old JSON format
    id?: number | string;
    title?: string;
    description?: string;
    date?: string;
    time?: string;
    color?: string;
    imageUrl?: string;
    // New database format
    name?: string;
    slug?: string;
    city?: string;
    venue?: string;
    starts_at?: string;
    ends_at?: string;
    image_url?: string;
    requires_rsvp?: boolean;
    currency?: string;
    organizations?: {
      name: string;
      slug: string;
    };
    ticket_tiers?: EventCardTicketTier[];
  };
}

export default function EventCard({ event }: EventCardProps) {
  const router = useRouter();

  // Check if this is old format or new format
  const isOldFormat = "title" in event && "date" in event;

  const handleCardClick = () => {
    if (!isOldFormat && event.slug) {
      router.push(`/events/${event.slug}`);
    }
  };

  // Format the date to be more readable
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get display values based on format
  const title = isOldFormat ? event.title : event.name;
  const description = event.description;
  const imageUrl = isOldFormat ? event.imageUrl : event.image_url;
  const displayDate = isOldFormat
    ? event.date
      ? formatDate(event.date)
      : ""
    : event.starts_at
    ? formatDate(event.starts_at)
    : "";
  const displayTime = isOldFormat
    ? event.time
    : event.starts_at
    ? formatTime(event.starts_at)
    : "";
  const location = isOldFormat ? null : `${event.venue}, ${event.city}`;
  const organizer = isOldFormat ? null : event.organizations?.name;
  const price = isOldFormat ? null : getLowestPrice(event.ticket_tiers || [], event.currency ?? "USD");

  return (
    <button
      type="button"
      className="group w-full text-left bg-card border border-white-30 rounded-card overflow-hidden h-full flex flex-col transition-transform hover:-translate-y-1"
      onClick={handleCardClick}
    >
      {/* Image */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-t-card">
        {!isOldFormat && event.requires_rsvp && (
          <div className="absolute top-2 right-2 bg-primary text-white-100 px-2 py-1 text-xs font-poppins-medium uppercase rounded-badge z-10">
            RSVP
          </div>
        )}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white-10 text-white-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M8 2V5M16 2V5M3.5 9.09H20.5M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="mb-2">
          <h3 className="text-white-100 font-poppins-semibold text-base m-0 mb-1">
            {title}
          </h3>
          <div className="flex gap-2 items-center text-white-50 text-sm">
            <span>{displayDate}</span>
            <span>{displayTime}</span>
          </div>
        </div>

        <p className="text-white-80 text-sm line-clamp-3 mb-3 flex-1">
          <LinkifiedText text={description || "Join us for this amazing event!"} />
        </p>

        {!isOldFormat && (location || organizer) && (
          <div className="flex flex-col gap-1 mb-3">
            {location && (
              <div className="flex items-center gap-2 text-white-80 text-xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white-50">
                  <path
                    d="M12 13.43A3.43 3.43 0 1 0 8.57 10A3.43 3.43 0 0 0 12 13.43Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                <span>{location}</span>
              </div>
            )}
            {organizer && (
              <div className="flex items-center gap-2 text-white-80 text-xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white-50">
                  <path
                    d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M20.5901 22C20.5901 18.13 16.7402 15 12.0002 15C7.26015 15 3.41016 18.13 3.41016 22"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                <span>By {organizer || "FLAME"}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-white-20">
          {!isOldFormat && price && (
            <span className="text-white-80 text-sm font-poppins-medium">
              {typeof price === "string" ? price : `From ${price}`}
            </span>
          )}
          <div className="flex items-center justify-center w-8 h-8 text-white-50 group-hover:text-primary transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M7 17L17 7M17 7H7M17 7V17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </button>
  );
}
