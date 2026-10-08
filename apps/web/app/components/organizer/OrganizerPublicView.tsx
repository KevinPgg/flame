"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IoChevronForward,
  IoChevronDown,
  IoLocationOutline,
  IoLogoInstagram,
  IoSearch,
  IoShareSocialOutline,
  IoCalendarOutline,
} from "react-icons/io5";
import { FiArrowLeft } from "react-icons/fi";
import type { EventCardData } from "../../lib/map-event-to-card";

interface PublicOrg {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  instagram_handle: string | null;
  logo_url: string | null;
}

interface OrganizerPublicViewProps {
  org: PublicOrg;
  currentEvents: EventCardData[];
  pastEvents: EventCardData[];
}

export default function OrganizerPublicView({
  org,
  currentEvents,
  pastEvents,
}: OrganizerPublicViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const normalizedInstagram = (org.instagram_handle ?? "")
    .trim()
    .replace(/^@+/, "");
  const initials = org.name.charAt(0).toUpperCase();
  const hasMetaRow = Boolean(org.city || normalizedInstagram);

  const filterEvents = (list: EventCardData[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.location ?? "").toLowerCase().includes(q) ||
      (e.description ?? "").toLowerCase().includes(q),
    );
  };

  const filteredCurrent = useMemo(() => filterEvents(currentEvents), [
    currentEvents,
    search,
  ]);
  const filteredPast = useMemo(() => filterEvents(pastEvents), [
    pastEvents,
    search,
  ]);

  const handleShare = async () => {
    const base =
      process.env.NEXT_PUBLIC_BASE_URL ??
      (typeof window !== "undefined" ? window.location.origin : "https://flme.co");
    const url = `${base}/organizer/${org.slug}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: org.name, url });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error("[OrganizerPublic] copy failed", err);
    }
  };

  return (
    <div className="flex flex-col gap-[30px]">
      {/* Top row: ← Go Back */}
      <button
        type="button"
        onClick={() => router.back()}
        className="self-start flex items-center gap-2 text-white-100 hover:text-white-80 transition-colors"
      >
        <FiArrowLeft size={20} />
        <span className="text-sm font-poppins-medium">Go Back</span>
      </button>

      {/* Org header row */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-[70px] h-[70px] rounded-card bg-white-10 flex items-center justify-center overflow-hidden shrink-0">
            {org.logo_url ? (
              <Image
                src={org.logo_url}
                alt={org.name}
                width={70}
                height={70}
                sizes="70px"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-white-100 text-2xl font-poppins-semibold">
                {initials}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white-100 text-lg leading-7 font-poppins-semibold truncate">
              {org.name}
            </h1>
            {hasMetaRow && (
              <div className="flex flex-col gap-1 mt-[2px]">
                {org.city && (
                  <div className="flex items-center gap-1">
                    <IoLocationOutline size={14} className="text-white-50" />
                    <span className="text-white-50 text-xs leading-4 font-poppins">
                      {org.city}
                    </span>
                  </div>
                )}
                {normalizedInstagram && (
                  <a
                    href={`https://instagram.com/${normalizedInstagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                  >
                    <IoLogoInstagram size={14} className="text-white-50" />
                    <span className="text-white-50 text-xs leading-4 font-poppins">
                      @{normalizedInstagram}
                    </span>
                  </a>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share"
            className="w-[38px] h-[38px] rounded-full bg-white-5 hover:bg-white-10 flex items-center justify-center shrink-0 transition-colors"
          >
            <IoShareSocialOutline size={18} className="text-white-100" />
          </button>
        </div>

        {org.description && (
          <p className="text-white-80 text-sm leading-5 font-poppins mt-1">
            {org.description}
          </p>
        )}
      </div>

      {/* Events */}
      <div className="flex flex-col gap-6">
        <h2 className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase">
          Current &amp; Upcoming Events
        </h2>

        <div className="bg-white-5 border border-white-10 rounded-pill px-4 py-2.5 flex items-center gap-2">
          <IoSearch size={16} className="text-white-50 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events"
            className="flex-1 bg-transparent text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none min-w-0"
          />
        </div>

        {filteredCurrent.length === 0 ? (
          <div className="py-12 flex items-center justify-center">
            <p className="text-white-50 text-sm font-poppins text-center">
              {search.trim()
                ? "No events match your search."
                : "No current or upcoming events."}
            </p>
          </div>
        ) : (
          <EventGrid events={filteredCurrent} />
        )}

        {filteredPast.length > 0 && (
          <PastEventsAccordion count={filteredPast.length}>
            <EventGrid events={filteredPast} />
          </PastEventsAccordion>
        )}
      </div>
    </div>
  );
}

function EventGrid({ events }: { events: EventCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {events.map(event => (
        <EventGridCard key={event.id} event={event} />
      ))}
    </div>
  );
}

function EventGridCard({ event }: { event: EventCardData }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="bg-card rounded-card p-2 pb-3 block hover:opacity-90 transition-opacity"
    >
      <div className="aspect-square w-full rounded-card overflow-hidden relative bg-white-10">
        {event.imageUrl && (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            sizes="(max-width: 768px) 50vw, 400px"
            className="object-cover"
          />
        )}
        <div className="absolute top-[7px] left-[6px] rounded-badge px-[10px] py-[6px] flex items-center gap-2 bg-[rgba(0,0,0,0.55)]">
          <span className="text-white text-sm font-poppins-bold uppercase">
            {event.day}
          </span>
          <span className="text-white text-sm font-poppins-light">
            {event.month}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-white-100 text-base leading-[22px] font-poppins-semibold line-clamp-2">
          {event.title}
        </p>
        <div className="flex items-center gap-2 min-w-0">
          <IoCalendarOutline size={14} className="text-white-100 shrink-0" />
          <span className="text-white-100 text-xs leading-4 font-poppins-light truncate">
            {event.date}
          </span>
        </div>
      </div>
    </Link>
  );
}

function PastEventsAccordion({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="bg-white-5 border border-white-5 rounded-card p-3 flex items-center justify-between hover:bg-white-10 transition-colors"
      >
        <span className="text-white-100 text-sm leading-5 font-poppins-medium">
          Past events ({count})
        </span>
        {open ? (
          <IoChevronDown size={18} className="text-white-100" />
        ) : (
          <IoChevronForward size={18} className="text-white-100" />
        )}
      </button>
      {open && children}
    </div>
  );
}
