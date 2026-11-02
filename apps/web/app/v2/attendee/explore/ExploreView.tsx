"use client";

/**
 * Flame 2.0 Explore on the web (fase 2.5). Prototype `SCREENS.explore`: search on top (events
 * by name, venue, city or organizer; organizers by name — "como hoy", rules in lib/explore);
 * idle: featured events, featured organizers, "Host your own events" and FAQs. Categories were
 * dropped (2026-11-02). Fase 4.4: artists (line-up) in the search, followers on the organizer cards (most followed
 * first), recent searches (this browser only).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { addRecentSearch, artistInitials, faqs, featuredFirst, organizerCover, searchExplore, type ArtistResult } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { useUserRole } from "../../../lib/hooks/useUserRole";
import type { HomeEvent } from "../../../lib/home-events";
import type { ExploreOrganizer } from "../../../lib/explore-data";
import { Icon } from "../../components/Icon";
import { OrgAvatar } from "../../components/OrgAvatar";
import { ErrorBox } from "../../components/ErrorBox";
import { EventTile } from "../EventTile";
import { useFollowing } from "../useFollowing";

const RECENT_KEY = "flame.recentSearches";
/** Recent searches live in this browser only (prototype; nothing in the database). */
function readRecent(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
}
function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode / blocked storage: just don't remember */
  }
}

/** Artist found by the search (fase 4.4): photo or initials, name, and their next event. */
function ArtistRow({ artist, onOpen }: { artist: ArtistResult<HomeEvent>; onOpen: () => void }) {
  const { t } = useI18n();
  const next = artist.events[0]!;
  return (
    <Link href={`/events/${next.slug}`} onClick={onOpen} className="flex items-center gap-3 rounded-[16px] bg-[#121212] p-3 hover:bg-[#181818]">
      {artist.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- artist photo from our storage
        <img src={artist.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-[12px] object-cover" />
      ) : (
        <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#2A1A1F] to-[#0E0E0E] font-v2-display-bold text-[18px] text-v2-cream/90">
          {artistInitials(artist.name)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px] font-v2-ui-semibold">{artist.name}</b>
        <small className="block truncate text-[12.5px] text-v2-c50">
          {t("explore.artistNext", { event: next.name })}
          {artist.events.length > 1 ? ` · ${t("explore.artistMore", { count: artist.events.length - 1 })}` : ""}
        </small>
      </span>
      <Icon name="chev" size={16} className="text-v2-c50" />
    </Link>
  );
}

/** Background: the flyer of the organizer's next event, else its latest one, else its photo (Kevin 2026-10-28/29). */
function OrgCard({ org, wide, events }: { org: ExploreOrganizer; wide?: boolean; events: HomeEvent[] }) {
  const { t } = useI18n();
  const bg = organizerCover(org, events);
  const followers = useFollowing().followersOf(org.id, org.followers_count ?? 0);
  const cover = bg?.url;
  return (
    <Link href={`/organizer/${org.slug}`} aria-label={t("explore.seeOrganizer", { name: org.name })} className={`isolate block shrink-0 overflow-hidden rounded-[18px] bg-[#121212] hover:bg-[#181818] ${wide ? "w-full" : "w-[220px]"}`}>
      <span className="relative block h-[96px] overflow-hidden bg-v2-ink3">
        {cover && (
          <span
            aria-hidden
            data-testid="org-card-bg"
            data-kind={bg?.kind}
            className={`absolute inset-0 bg-cover bg-center ${bg?.kind === "flyer" ? "brightness-[.7]" : bg?.kind === "logo" ? "scale-125 blur-[30px] brightness-[.6]" : ""}`}
            style={{ backgroundImage: `url("${cover}")` }}
          />
        )}
      </span>
      <span className="block px-3.5 pb-3.5">
        <span className="relative z-[1] -mt-7 block w-fit rounded-[16px] border-[3px] border-[#121212]">
          <OrgAvatar name={org.name} logoUrl={org.logo_url} size={52} />
        </span>
        <b className="mt-2 block truncate text-[15px] font-v2-ui-semibold">{org.name}</b>
        <small className="block truncate text-[12.5px] text-v2-c50">
          {[org.city, t("follow.followers", { count: followers })].filter(Boolean).join(" · ")}
        </small>
      </span>
    </Link>
  );
}

function HostCard() {
  const { t } = useI18n();
  const { isSignedIn, isLoaded } = useUser();
  const role = useUserRole();
  const data = role.data;
  const approved = data?.organization?.approved === true;
  const pending = !!data?.hasOrganization && !approved;
  // Same routes as the v1 HostBanner: create an event / onboarding (create your organization).
  const href = !isSignedIn
    ? `/sign-in?redirect_url=${encodeURIComponent("/onboarding")}`
    : data?.role === "admin" || approved
      ? "/organizer?tab=create-event"
      : "/?onboarding=true";
  const waiting = !isLoaded || (isSignedIn && role.isLoading);
  return (
    <section className="flex flex-col gap-4 rounded-[20px] bg-gradient-to-br from-[#2a0b0f] to-[#121212] p-5 md:flex-row md:items-center">
      <div className="flex-1">
        <div className="text-[12px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c70">{t("explore.hostKicker")}</div>
        <h2 className="mt-1 font-v2-display-bold text-[22px] tracking-[-0.03em]">{t("explore.hostTitle")}</h2>
        <p className="mt-1 max-w-[52ch] text-[14px] text-v2-c70">{pending ? t("explore.hostPending") : t("explore.hostBody")}</p>
      </div>
      {!pending && (
        <Link
          href={href}
          aria-disabled={waiting}
          onClick={(e) => waiting && e.preventDefault()}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper"
        >
          {approved || data?.role === "admin" ? t("explore.hostCreate") : t("explore.hostCta")}
        </Link>
      )}
    </section>
  );
}

export default function ExploreView({ events, organizers, failed }: { events: HomeEvent[]; organizers: ExploreOrganizer[]; failed: boolean }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => setRecent(readRecent()), []);
  const remember = () => {
    const next = addRecentSearch(recent, q);
    setRecent(next);
    writeRecent(next);
  };
  const result = useMemo(() => searchExplore(events, organizers, q), [events, organizers, q]);
  const featured = useMemo(() => featuredFirst(events, 10), [events]);
  const searching = q.trim().length > 0;
  const count = result.events.length + result.organizers.length + result.artists.length;

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-6 lg:px-8 lg:pt-10">
      <h1 className="mb-4 font-v2-display-bold text-[28px] tracking-[-0.03em] lg:text-[34px]">{t("explore.title")}</h1>
      <label className="flex h-12 items-center gap-2.5 rounded-v2-pill bg-[#1A1A1A] px-4 text-v2-c70 focus-within:ring-1 focus-within:ring-v2-c30 md:max-w-[560px]">
        <Icon name="search" size={19} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && remember()}
          placeholder={t("explore.searchPlaceholder")}
          aria-label={t("common.search")}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-v2-cream outline-none placeholder:text-v2-c50 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label={t("explore.clear")} className="text-v2-c70 hover:text-v2-cream">
            <Icon name="close" size={17} />
          </button>
        )}
      </label>

      {failed && <div className="mt-6"><ErrorBox message={t("home.loadError")} /></div>}

      {searching ? (
        count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <h2 className="font-v2-display-bold text-[20px]">{t("explore.noResults")}</h2>
            <p className="mb-2 max-w-[40ch] text-[14.5px] text-v2-c70">{t("explore.noResultsBody", { q: q.trim() })}</p>
            <button type="button" onClick={() => setQ("")} className="inline-flex h-9 items-center rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold hover:bg-v2-ink4">
              {t("explore.clear")}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <p className="mb-4 text-[13px] text-v2-c50" aria-live="polite">{t("explore.results", { count })}</p>
            {result.artists.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 font-v2-display-bold text-[20px] tracking-[-0.02em]">{t("explore.artists")}</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {result.artists.slice(0, 9).map((a) => (
                    <ArtistRow key={a.name} artist={a} onOpen={remember} />
                  ))}
                </div>
              </section>
            )}
            {result.organizers.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 font-v2-display-bold text-[20px] tracking-[-0.02em]">{t("explore.organizers")}</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {result.organizers.map((o) => (
                    <OrgCard key={o.id} org={o} wide events={events} />
                  ))}
                </div>
              </section>
            )}
            {result.events.length > 0 && (
              <section>
                <h2 className="mb-3 font-v2-display-bold text-[20px] tracking-[-0.02em]">{t("explore.events")}</h2>
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
                  {result.events.map((e) => (
                    <EventTile key={e.id} event={e} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-10 pt-7">
          {recent.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-v2-display-bold text-[22px] tracking-[-0.03em]">{t("explore.recent")}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setRecent([]);
                    writeRecent([]);
                  }}
                  className="text-[13px] font-v2-ui-semibold text-v2-c70 underline hover:text-v2-cream"
                >
                  {t("explore.recentClear")}
                </button>
              </div>
              <ul className="flex flex-col md:max-w-[560px]">
                {recent.map((r) => (
                  <li key={r}>
                    <button type="button" onClick={() => setQ(r)} className="flex w-full items-center gap-3 border-b border-[#1A1A1A] py-3 text-left text-[15px] hover:text-v2-c70">
                      <Icon name="clock" size={18} className="text-v2-c70" />
                      <span className="min-w-0 flex-1 truncate">{r}</span>
                      <Icon name="chev" size={15} className="text-v2-c50" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {featured.length > 0 && (
            <section>
              <h2 className="mb-3 font-v2-display-bold text-[22px] tracking-[-0.03em]">{t("explore.featured")}</h2>
              <div className="v2-no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:-mx-8 lg:px-8" style={{ scrollbarWidth: "none" }}>
                {featured.map((e) => (
                  <div key={e.id} className="w-[200px] shrink-0 md:w-[230px]">
                    <EventTile event={e} />
                  </div>
                ))}
              </div>
            </section>
          )}
          {organizers.length > 0 && (
            <section>
              <h2 className="mb-3 font-v2-display-bold text-[22px] tracking-[-0.03em]">{t("explore.organizers")}</h2>
              <div className="v2-no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:-mx-8 lg:px-8" style={{ scrollbarWidth: "none" }}>
                {organizers.map((o) => (
                  <OrgCard key={o.id} org={o} events={events} />
                ))}
              </div>
            </section>
          )}
          <HostCard />
          <section>
            <h2 className="mb-3 font-v2-display-bold text-[22px] tracking-[-0.03em]">{t("explore.faqs")}</h2>
            <div className="flex flex-col gap-2 md:max-w-[760px]">
              {faqs.map((f, i) => (
                <details key={f.id} open={i === 0} className="group rounded-[14px] bg-[#121212] px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-v2-ui-semibold [&::-webkit-details-marker]:hidden">
                    {f.question}
                    <span className="shrink-0 text-v2-c50 transition-transform group-open:rotate-45">
                      <Icon name="plus" size={17} />
                    </span>
                  </summary>
                  <p className="mt-2 text-[14px] leading-[1.5] text-v2-c70">{f.answer}</p>
                </details>
              ))}
            </div>
            <Link href="/faqs" className="mt-4 inline-block text-[14px] font-v2-ui-semibold underline hover:text-v2-c70">
              {t("explore.allFaqs")}
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}
