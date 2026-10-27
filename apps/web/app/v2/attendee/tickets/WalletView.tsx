"use client";

/**
 * Flame 2.0 "My tickets" on the web (fase 2.3) — same rules as the app (packages/lib
 * utils/wallet): counters, Upcoming / Past, one card per event (flyer, when, QR button) and RSVP
 * requests with their state. Adapted to a computer: cards in a grid of 2 on wide screens.
 * Data: the existing /api/user/tickets (useUserTickets).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  buildWallet,
  walletDayTime,
  walletWhen,
  type WalletEvent,
  type WalletEventInfo,
  type WalletRequest,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { useUserTickets } from "../../../lib/hooks/useUserTickets";
import { Icon } from "../../components/Icon";
import { ErrorBox } from "../../components/ErrorBox";
import { Skeleton } from "../../components/Skeleton";

type Seg = "up" | "past";

function useWhenLabel() {
  const { t, locale } = useI18n();
  return (e: WalletEventInfo) => {
    const w = walletWhen(e);
    if (w.kind === "now") return t("wallet.now");
    if (w.kind === "today") return t("wallet.today");
    if (w.kind === "tomorrow") return t("wallet.tomorrow");
    if (w.kind === "days") return t("wallet.inDays", { count: w.days });
    return walletDayTime(e.starts_at, e.timezone, locale).day;
  };
}

function Poster({ src, className }: { src?: string | null; className: string }) {
  return (
    <span className={`block shrink-0 overflow-hidden bg-v2-ink3 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote flyers of any host
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : null}
    </span>
  );
}

const card = "flex items-center gap-3.5 rounded-[18px] bg-[#121212] p-2.5 text-left";

function EventCard({ w }: { w: WalletEvent }) {
  const { t, locale } = useI18n();
  const when = useWhenLabel();
  const e = w.event;
  const { time } = walletDayTime(e.starts_at, e.timezone, locale);
  const summary = [t("tickets.count", { count: w.tickets.length }), w.tiers.join(", ")].filter(Boolean).join(" · ");
  return (
    <Link href={`/account/ticket/${w.tickets[0]!.id}`} aria-label={t("wallet.showQr", { name: e.name })} className={`${card} hover:bg-[#181818]`}>
      <Poster src={e.image_url} className="h-[98px] w-[78px] rounded-[11px]" />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
        <span className="text-[12px] font-v2-ui-semibold uppercase tracking-[0.05em] text-v2-c70">{when(e)}</span>
        <b className="line-clamp-2 font-v2-display-bold text-[17px] leading-[1.2] tracking-[-0.02em]">{e.name}</b>
        <small className="mb-1 truncate text-[13px] text-v2-c50">{[time, e.venue].filter(Boolean).join(" · ")}</small>
        <span className="rounded-v2-pill bg-v2-ink3 px-2.5 py-1 text-[12px] font-v2-ui-semibold text-v2-c90">{summary}</span>
        {w.checkedIn > 0 && <small className="text-[12px] text-v2-c50">{t("wallet.checkedIn", { count: w.checkedIn })}</small>}
      </span>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-cream text-v2-ink">
        <Icon name="qr" size={18} />
      </span>
    </Link>
  );
}

function RequestCard({ r }: { r: WalletRequest }) {
  const { t, locale } = useI18n();
  const e = r.event;
  const { day } = walletDayTime(e.starts_at, e.timezone, locale);
  const warn = r.state === "pending" || r.state === "approved";
  return (
    <div className={card}>
      <Poster src={e.image_url} className="h-[98px] w-[78px] rounded-[11px]" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
        <span className={`text-[12px] font-v2-ui-semibold uppercase tracking-[0.05em] ${warn ? "text-v2-warn" : "text-v2-c50"}`}>{t(`wallet.request.${r.state}`)}</span>
        <b className="line-clamp-2 font-v2-display-bold text-[17px] leading-[1.2] tracking-[-0.02em]">{e.name}</b>
        <small className="truncate text-[13px] text-v2-c50">{[day, e.venue, t("tickets.count", { count: r.quantity })].filter(Boolean).join(" · ")}</small>
        <p className="text-[12.5px] leading-[1.35] text-v2-c70">{t(`wallet.requestHint.${r.state}`)}</p>
        <Link href={`/events/${e.slug}`} className="mt-1 text-[13px] font-v2-ui-semibold underline hover:text-v2-c70">
          {t("wallet.seeEvent")}
        </Link>
      </div>
    </div>
  );
}

function PastRow({ w }: { w: WalletEvent }) {
  const { t, locale } = useI18n();
  const e = w.event;
  const { day } = walletDayTime(e.starts_at, e.timezone, locale);
  return (
    <Link href={`/account/ticket/${w.tickets[0]!.id}`} aria-label={t("wallet.showQr", { name: e.name })} className="flex items-center gap-3 rounded-v2-md px-2 py-2.5 hover:bg-v2-ink2">
      <Poster src={e.image_url} className="h-[60px] w-[48px] rounded-[8px]" />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px] font-v2-ui-semibold">{e.name}</b>
        <small className="block truncate text-[13px] text-v2-c50">{day}</small>
        <small className="block truncate text-[13px] text-v2-c50">{e.venue}</small>
      </span>
      <span className="rounded-v2-pill bg-v2-ink3 px-2.5 py-1 text-[12px] font-v2-ui-semibold text-v2-c90">
        {w.checkedIn > 0 ? t("wallet.attended") : t("tickets.count", { count: w.tickets.length })}
      </span>
    </Link>
  );
}

export default function WalletView() {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useUserTickets();
  const [seg, setSeg] = useState<Seg>("up");
  const wallet = useMemo(() => buildWallet(data?.tickets ?? []), [data?.tickets]);
  const loading = isLoading && !data;

  let body;
  if (loading) {
    body = (
      <div className="grid gap-2.5 md:grid-cols-2" aria-label={t("common.loading")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={card}>
            <Skeleton className="h-[98px] w-[78px] rounded-[11px]" />
            <span className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-28" />
            </span>
          </div>
        ))}
      </div>
    );
  } else if (isError && !data) {
    body = <ErrorBox message={t("wallet.loadError")} onRetry={() => void refetch()} />;
  } else if (seg === "up") {
    body =
      wallet.upcoming.length === 0 && wallet.requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <h2 className="font-v2-display-bold text-[20px]">{t("wallet.emptyTitle")}</h2>
          <p className="mb-2 max-w-[36ch] text-[14.5px] text-v2-c70">{t("wallet.emptyBody")}</p>
          <Link href="/" className="inline-flex h-9 items-center rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper">
            {t("wallet.findEvents")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {wallet.upcoming.map((w) => (
            <EventCard key={w.event.id} w={w} />
          ))}
          {wallet.requests.map((r) => (
            <RequestCard key={r.rsvp.id} r={r} />
          ))}
        </div>
      );
  } else {
    body =
      wallet.past.length === 0 ? (
        <p className="px-6 py-14 text-center text-[14.5px] text-v2-c70">{t("wallet.emptyPast")}</p>
      ) : (
        <div className="grid gap-1 md:grid-cols-2">
          {wallet.past.map((w) => (
            <PastRow key={w.event.id} w={w} />
          ))}
        </div>
      );
  }

  const stats: Array<[string, number]> = [
    [t("wallet.total"), wallet.stats.total],
    [t("wallet.purchased"), wallet.stats.purchased],
    [t("wallet.pending"), wallet.stats.pending],
  ];

  return (
    <div className="mx-auto max-w-[900px] px-4 pt-6 lg:px-8 lg:pt-10">
      <h1 className="mb-4 font-v2-display-bold text-[28px] tracking-[-0.03em] lg:text-[34px]">{t("tickets.myTickets")}</h1>
      <div className="grid grid-cols-3 gap-2">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-[14px] bg-[#121212] px-3.5 py-3">
            <b className="block font-v2-display-bold text-[22px] tracking-[-0.02em]">{loading ? "–" : n}</b>
            <span className="text-[12px] font-v2-ui-medium text-v2-c50">{label}</span>
          </div>
        ))}
      </div>
      <div role="tablist" className="mb-4 mt-[18px] flex gap-1 rounded-v2-pill bg-[#1A1A1A] p-1 md:max-w-[360px]">
        {(["up", "past"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={seg === k}
            onClick={() => setSeg(k)}
            className={`h-9 flex-1 rounded-v2-pill text-[14px] font-v2-ui-semibold ${seg === k ? "bg-v2-cream text-v2-ink" : "text-v2-c70 hover:text-v2-cream"}`}
          >
            {k === "up" ? t("tickets.upcoming") : t("tickets.past")}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}
