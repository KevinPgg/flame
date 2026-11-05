"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cityCounts,
  groupCitiesByCountry,
  sameCity,
  DEFAULT_CATALOG_CITY,
  feedDayTitle,
  groupEventsByDay,
  type FeedDay,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { ErrorBox } from "../../components/ErrorBox";
import { Modal } from "../../components/Modal";
import type { HomeEvent } from "../../../lib/home-events";
import { EventFeedCard } from "../EventFeedCard";

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/**
 * Flame 2.0 Home on the web (fase 2.2). Same rules as the app (packages/lib home-feed): Quito
 * by default when it has events, never remembered; days ("Happening now", "Today"…). Adapted to
 * a computer: the cards sit in a grid (2–3 per row) instead of one long column.
 */
export default function HomeView({ events, failed }: { events: HomeEvent[]; failed: boolean }) {
  const { t, locale, language } = useI18n();
  const router = useRouter();
  const cities = useMemo(() => cityCounts(events), [events]);
  // 2026-11-02: grouped by country (catalog), spellings merged ("Lisbon" = "Lisboa").
  const groups = useMemo(() => groupCitiesByCountry(cities), [cities]);
  const [city, setCity] = useState<string | null>(() => (cities.some((c) => sameCity(c.city, DEFAULT_CATALOG_CITY)) ? DEFAULT_CATALOG_CITY : null));
  const [picking, setPicking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const shown = useMemo(() => (city ? events.filter((e) => sameCity(e.city, city)) : events), [events, city]);
  const days = useMemo(() => groupEventsByDay(shown), [shown]);

  const cityOption = (c: { city: string | null; count: number }) => {
    const on = c.city === city;
    const label = c.city ?? t("common.allCities");
    return (
      <button
        key={c.city ?? "__all"}
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={`${label}, ${t("home.events", { count: c.count })}`}
        onClick={() => {
          setCity(c.city);
          setPicking(false);
        }}
        className="flex w-full items-center gap-3 rounded-[10px] px-1 py-2.5 text-left hover:bg-v2-ink3"
      >
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] ${on ? "border-v2-cream bg-v2-cream text-v2-ink" : "border-v2-c30"}`}>
          {on && <Icon name="check" size={12} strokeWidth={3.4} />}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-v2-ui-semibold">{label}</b>
          <small className="text-[12.5px] text-v2-c50">{t("home.events", { count: c.count })}</small>
        </span>
      </button>
    );
  };
  const dayTitle = (d: FeedDay<HomeEvent>) =>
    d.when === "now" ? t("home.now") : d.when === "today" ? t("home.today") : d.when === "tomorrow" ? t("home.tomorrow") : capitalize(feedDayTitle(d, locale));

  const share = async (e: HomeEvent) => {
    const url = `${window.location.origin}/events/${e.slug}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: e.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast(t("home.copied"));
    } catch {
      /* dismissed */
    }
  };

  const cityName = city ?? t("common.allCities");

  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-4 lg:px-8 lg:pt-8">
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPicking(true)}
          aria-label={t("home.cityButton", { city: cityName })}
          className="inline-flex h-10 max-w-[220px] items-center gap-1.5 rounded-v2-pill bg-[rgba(28,28,28,0.82)] pl-[11px] pr-3 text-[14px] font-v2-ui-semibold hover:bg-v2-ink4"
        >
          <Icon name="pin" size={15} />
          <span className="truncate">{cityName}</span>
          <Icon name="down" size={14} className="text-v2-c70" />
        </button>
      </div>

      {failed ? (
        <ErrorBox message={t("home.loadError")} onRetry={() => router.refresh()} />
      ) : days.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          {events.length === 0 ? (
            <>
              <h2 className="font-v2-display-bold text-[20px]">{t("home.noEvents")}</h2>
              <p className="max-w-[34ch] text-[14.5px] text-v2-c70">{t("home.noEventsBody")}</p>
            </>
          ) : (
            <>
              <h2 className="font-v2-display-bold text-[20px]">{t("home.emptyTitle", { city: city ?? "" })}</h2>
              <p className="mb-2 max-w-[34ch] text-[14.5px] text-v2-c70">{t("home.emptyBody", { city: city ?? "" })}</p>
              <button type="button" onClick={() => setCity(null)} className="rounded-v2-pill bg-v2-ink3 px-4 py-2 text-[13.5px] font-v2-ui-semibold hover:bg-v2-ink4">
                {t("home.showAllCities")}
              </button>
            </>
          )}
        </div>
      ) : (
        days.map((d) => (
          <section key={d.key} className="mb-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-v2-display-bold text-[20px] tracking-[-0.025em]">{dayTitle(d)}</h2>
              <span className="text-[13.5px] text-v2-c50">{t("home.events", { count: d.events.length })}</span>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {d.events.map((e) => (
                <EventFeedCard key={e.id} event={e} onShare={share} />
              ))}
            </div>
          </section>
        ))
      )}

      <Modal open={picking} title={t("home.cityTitle")} onClose={() => setPicking(false)} closeOnBackdrop>
        <p className="-mt-1 mb-3 text-[13.5px] text-v2-c70">{t("home.cityLead")}</p>
        <div role="radiogroup" aria-label={t("home.cityTitle")} className="flex flex-col">
          {cityOption({ city: null, count: events.length })}
          {groups.map((g) => (
            <div key={g.country?.code ?? "other"} className="mt-2">
              <div className="flex items-center gap-2 px-1 pb-1 pt-2 text-[12.5px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50">
                <span aria-hidden className="text-[16px] normal-case">{g.country?.flag ?? "🌍"}</span>
                <span className="flex-1">{g.country ? g.country.name[language] : t("home.otherCities")}</span>
                <span className="normal-case tracking-normal">{t("home.events", { count: g.count })}</span>
              </div>
              <div className="ml-[17px] border-l-2 border-[#1c1c1c] pl-2">{g.cities.map((c) => cityOption(c))}</div>
            </div>
          ))}
        </div>
      </Modal>

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-v2-pill bg-v2-cream px-4 py-2 text-[13.5px] font-v2-ui-semibold text-v2-ink lg:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}
