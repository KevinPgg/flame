"use client";

import Link from "next/link";
import { feedWhen } from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../components/Icon";
import { OrgAvatar } from "../components/OrgAvatar";
import type { HomeEvent } from "../../lib/home-events";
import { usePriceLine } from "./usePriceLine";
import { SaveButton } from "./SaveButton";

/**
 * Home card, full flyer (fase 2.2; Kevin's choice). Also the upcoming events of the organizer page
 * (prototype `SCREENS.org` uses the same `bFeed`, Kevin 2026-11-05): organizer + share, the flyer at 4:5 with
 * a dark fade and title, date · time and price on it, "RSVP" tag. Heart to save (fase 4.1).
 */
export function EventFeedCard({ event, onShare }: { event: HomeEvent; onShare: (e: HomeEvent) => void }) {
  const { t, locale } = useI18n();
  const price = usePriceLine()(event);
  const org = event.organizations;
  const when = feedWhen(event.starts_at, event.timezone, locale);
  return (
    <article>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        {org ? (
          <Link href={`/organizer/${org.slug}`} className="flex min-w-0 items-center gap-2 hover:opacity-80">
            <OrgAvatar name={org.name} logoUrl={org.logo_url} size={30} />
            <b className="truncate text-[14px] font-v2-ui-semibold">{org.name}</b>
          </Link>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => onShare(event)}
          aria-label={t("home.shareEvent", { name: event.name })}
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-v2-cream hover:bg-v2-ink3"
        >
          <Icon name="send" size={19} />
        </button>
      </div>
      <div className="relative">
      <Link
        href={`/events/${event.slug}`}
        className="group relative block aspect-[4/5] overflow-hidden rounded-[16px] bg-[#111]"
        aria-label={[event.name, when, price].filter(Boolean).join(", ")}
      >
        {event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- flyer from storage
          <img src={event.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : null}
        {event.requires_rsvp && (
          <span className="absolute right-3 top-3 z-[2] rounded-v2-pill bg-v2-flame px-2.5 py-1 text-[11px] font-v2-ui-bold text-white">{t("home.rsvp")}</span>
        )}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-[linear-gradient(to_top,rgba(0,0,0,.97)_0%,rgba(0,0,0,.82)_42%,rgba(0,0,0,0)_100%)]" />
        <span className="absolute bottom-3 left-3.5 right-14 z-[2] block">
          <span className="line-clamp-2 block font-v2-display-bold text-[20px] leading-[1.15] tracking-[-0.03em] text-v2-cream">{event.name}</span>
          <span className="mt-1 block text-[14.5px] font-v2-ui-medium text-v2-c90">{when}</span>
          {price && <span className="mt-0.5 block text-[14.5px] text-v2-c70">{price}</span>}
        </span>
      </Link>
      <SaveButton event={event} className="absolute bottom-3 right-3 z-[3]" />
      </div>
    </article>
  );
}
