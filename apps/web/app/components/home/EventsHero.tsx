"use client";

import { FiSearch, FiSliders } from "react-icons/fi";
import Link from "next/link";

interface EventsHeroProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** If set, filter button links here. If not set, filter is hidden or no-op. */
  filterHref?: string;
}

/**
 * Web equivalent of mobile EventsHero.
 * Search bar + filter button. No title/subtitle on home (title="" subtitle="").
 */
export function EventsHero({
  searchQuery,
  onSearchChange,
  filterHref = "/events",
}: EventsHeroProps) {
  return (
    <div className="w-full px-4 pt-4 pb-2">
      <div className="flex flex-row gap-[10px] items-start">
        <div className="flex-1 flex flex-row items-center bg-white-5 border border-white-10 rounded-pill px-4 py-2.5 gap-2">
          <FiSearch size={18} className="text-white-50 shrink-0" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by event name"
            className="flex-1 bg-transparent border-0 outline-none text-sm text-white-100 font-poppins leading-[1.4] placeholder:text-white-50"
          />
        </div>
        <Link
          href={filterHref}
          className="bg-white-5 border border-white-10 hover:bg-white-10 w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors"
          aria-label="Filter events"
        >
          <FiSliders size={20} className="text-white-100" />
        </Link>
      </div>
    </div>
  );
}
