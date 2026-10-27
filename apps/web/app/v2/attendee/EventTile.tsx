"use client";

/**
 * Small event card (fase 2.4–2.5): flyer 4:5, title, date · time, venue and price. Used by
 * "More from {organizer}", the organizer profile grid and Explore.
 */
import Link from "next/link";
import { feedWhen } from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import type { HomeEvent } from "../../lib/home-events";
import { usePriceLine } from "./usePriceLine";

export function EventTile({ event, past }: { event: HomeEvent; past?: boolean }) {
  const { t, locale } = useI18n();
  const price = usePriceLine()(event);
  return (
    <Link href={`/events/${event.slug}`} className="group block min-w-0">
      <span className="relative block aspect-[4/5] overflow-hidden rounded-[14px] bg-v2-ink3">
        {event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote flyers of any host
          <img src={event.image_url} alt="" loading="lazy" className={`h-full w-full object-cover transition-transform group-hover:scale-[1.02] ${past ? "opacity-70" : ""}`} />
        ) : null}
        {event.requires_rsvp && !past && (
          <span className="absolute right-2 top-2 rounded-v2-pill bg-v2-flame px-2 py-0.5 text-[10.5px] font-v2-ui-bold text-white">{t("home.rsvp")}</span>
        )}
      </span>
      <b className="mt-2 line-clamp-2 block font-v2-display-bold text-[15.5px] leading-[1.2] tracking-[-0.02em]">{event.name}</b>
      <small className="block truncate text-[12.5px] text-v2-c70">{feedWhen(event.starts_at, event.timezone, locale)}</small>
      {event.venue && <small className="block truncate text-[12.5px] text-v2-c50">{event.venue}</small>}
      {!past && price && <small className="mt-0.5 block text-[12.5px] font-v2-ui-semibold text-v2-c90">{price}</small>}
    </Link>
  );
}
