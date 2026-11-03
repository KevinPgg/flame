"use client";

/**
 * Flame 2.0 event page, top part (fase 2.4). Prototype `SCREENS.event`: the flyer over its own
 * blurred colors, the organizer (logo + name → profile) above a big title, when and where (with
 * Directions), RSVP note, and the description in 3 lines with "More". Below it, the v1 purchase
 * block (EventDetail) renders unchanged until fase 3.
 */
import { useState } from "react";
import Link from "next/link";
import { directionsUrl, walletDayTime } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { LinkifiedText } from "../../../../lib/utils/linkify-text";
import { Icon } from "../../../components/Icon";
import { OrgAvatar } from "../../../components/OrgAvatar";
import { SaveButton } from "../../SaveButton";

export type EventHeaderData = {
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  venue: string | null;
  /** Google Places pick (2026-11-02): street address and place id → "Directions" opens that place. */
  venue_address?: string | null;
  venue_place_id?: string | null;
  city: string | null;
  requires_rsvp: boolean | null;
  organizations: { name: string; slug: string; logo_url?: string | null };
  cohost_org_names?: string[];
};


export function EventHeader({ event }: { event: EventHeaderData }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const start = walletDayTime(event.starts_at, event.timezone, locale);
  const end = walletDayTime(event.ends_at, event.timezone, locale);
  // Overnight events (most nights out) read as one night: "Thu, Oct 30 · 10:00 PM – 3:00 AM".
  const oneNight = Date.parse(event.ends_at) - Date.parse(event.starts_at) < 24 * 3600_000;
  const when = oneNight ? `${start.day} · ${start.time} – ${end.time}` : `${start.day} ${start.time} – ${end.day} ${end.time}`;
  const where = [event.venue, event.city].filter(Boolean).join(", ");
  const maps = directionsUrl(event);
  const hosts = [event.organizations.name, ...(event.cohost_org_names ?? [])].join(" & ");
  const long = (event.description ?? "").length > 220 || (event.description ?? "").split("\n").length > 3;

  return (
    <header className="relative -mx-4 -mt-6 overflow-hidden px-4 pb-2 pt-4">
      {event.image_url && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-80px] -z-0 scale-110 bg-cover bg-center opacity-60 brightness-[.5] saturate-[1.3] blur-[60px]"
          style={{ backgroundImage: `url("${event.image_url}")` }}
        />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-black" />
      <div className="relative">
        {/* Back and share live in EventTopBar, fixed while the page scrolls (Kevin 2026-10-28). */}
        <div aria-hidden className="mb-4 h-10" />
        <div className="mx-auto aspect-[4/5] w-full overflow-hidden rounded-[18px] bg-v2-ink3 shadow-[0_30px_70px_rgba(0,0,0,0.55)] md:max-w-[384px]">
          {event.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote flyer
            <img src={event.image_url} alt={event.name} className="h-full w-full object-cover" />
          ) : null}
        </div>

        <Link href={`/organizer/${event.organizations.slug}`} className="mt-6 flex items-center gap-2.5 hover:opacity-80">
          <OrgAvatar name={event.organizations.name} logoUrl={event.organizations.logo_url ?? null} size={34} round />
          <b className="truncate text-[15px] font-v2-ui-semibold">{hosts}</b>
        </Link>
        <h1 className="mt-2 font-v2-display-bold text-[34px] leading-[1.02] tracking-[-0.04em] md:text-[44px]">{event.name}</h1>

        <div className="mt-5 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-ink3 text-v2-c90">
              <Icon name="cal" size={18} />
            </span>
            <div className="min-w-0">
              <small className="block text-[12px] text-v2-c50">{t("event.when")}</small>
              <b className="block text-[14.5px] font-v2-ui-semibold">{when}</b>
            </div>
          </div>
          {where && (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-ink3 text-v2-c90">
                <Icon name="pin" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <small className="block text-[12px] text-v2-c50">{t("event.venue")}</small>
                <b className="block text-[14.5px] font-v2-ui-semibold">{where}</b>
                {event.venue_address ? <small className="block text-[12.5px] text-v2-c50">{event.venue_address}</small> : null}
              </div>
              {maps && (
                <a href={maps} target="_blank" rel="noreferrer" className="shrink-0 self-center rounded-v2-pill bg-v2-ink3 px-3 py-1.5 text-[12.5px] font-v2-ui-semibold hover:bg-v2-ink4">
                  {t("ticket.directions")}
                </a>
              )}
            </div>
          )}
          {event.requires_rsvp && (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-flame text-white">
                <Icon name="rsvp" size={18} />
              </span>
              <p className="self-center text-[14px] text-v2-c90">{t("event.rsvpRequired")}</p>
            </div>
          )}
        </div>

        {event.description && (
          <section className="mt-6">
            <h2 className="mb-1.5 text-[12px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50">{t("event.about")}</h2>
            <p
              className={`whitespace-pre-wrap text-[15px] leading-[1.5] text-v2-c90 [&_a]:underline ${open ? "" : "line-clamp-3"}`}
              data-testid="event-description"
            >
              <LinkifiedText text={event.description} />
            </p>
            {long && (
              <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-[14px] font-v2-ui-semibold underline hover:text-v2-c70">
                {open ? t("common.less") : t("common.more")}
              </button>
            )}
          </section>
        )}
      </div>
    </header>
  );
}

const circle = "pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(28,28,28,0.82)] text-v2-cream backdrop-blur-md hover:bg-v2-ink4";

/**
 * Back + share fixed at the top of the event page while it scrolls (Kevin 2026-10-28, prototype
 * `x-top float`), under the site bar. Heart to save next to share (fase 4.1). It takes no
 * space: the header leaves a 40px gap where the buttons sit at the start.
 */
export function EventTopBar({ id, slug, name }: { id: string; slug: string; name: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/events/${slug}`;
    try {
      if (typeof navigator.share === "function") return void (await navigator.share({ title: name, url }));
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* closed or not allowed */
    }
  };
  return (
    <div className="pointer-events-none sticky top-[72px] z-20 -mb-[53px] -mt-2 flex h-10 items-center justify-between">
      <button type="button" onClick={() => history.back()} aria-label={t("common.back")} className={circle}>
        <Icon name="back" size={20} />
      </button>
      <div className="flex items-center gap-2">
        {copied && <span className="pointer-events-auto rounded-v2-pill bg-v2-ink3 px-3 py-1.5 text-[12.5px] text-v2-c90">{t("home.copied")}</span>}
        <button type="button" onClick={() => void share()} aria-label={t("event.shareEvent")} className={circle}>
          <Icon name="share" size={19} />
        </button>
        <SaveButton event={{ id, slug, name }} variant="circle" />
      </div>
    </div>
  );
}
