"use client";

/**
 * Flame 2.0 QR ticket on the web (fase 2.3) — same screen as the app: full page over the flyer's
 * blurred colors, white ticket with a big QR (click → full screen on white), Directions and Help,
 * price / venue / organizer.
 *
 * Kevin's ask: every ticket of the event loads once and you move between them WITHOUT reloading
 * — a scroll-snap strip (swipe on a phone; arrows, "Ticket 2" chips or ←/→ on a computer). The
 * address follows along with history.replaceState (no navigation), so a refresh reopens the
 * same ticket. Rules: packages/lib utils/wallet (the courtesy QR keeps v1's exact content).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  directionsUrl,
  eventTicketSlides,
  formatCentsAsPrice,
  ticketPrice,
  ticketQr,
  ticketStage,
  walletDayTime,
  walletOrganizer,
  type TicketQr,
  type UserTicket,
} from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { useUserTickets } from "../../../../lib/hooks/useUserTickets";
import { Icon } from "../../../components/Icon";
import { ErrorBox } from "../../../components/ErrorBox";

/** QR as an image source: purchased tickets already have one; courtesy ones are drawn here. */
function useQrSrc(qr: TicketQr): string {
  const [src, setSrc] = useState("");
  const value = qr?.kind === "value" ? qr.value : null;
  const uri = qr?.kind === "image" ? qr.uri : null;
  useEffect(() => {
    if (uri) return setSrc(uri);
    if (!value) return setSrc("");
    let alive = true;
    QRCode.toDataURL(value, { width: 640, margin: 1, errorCorrectionLevel: "M" })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [uri, value]);
  return src;
}

function QrImg({ qr, className }: { qr: TicketQr; className: string }) {
  const src = useQrSrc(qr);
  // eslint-disable-next-line @next/next/no-img-element -- data URL / storage URL
  return src ? <img src={src} alt="QR" className={className} /> : <span className={`block animate-pulse bg-[#eee] ${className}`} />;
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <small className="block text-[11.5px] font-v2-ui-medium text-[#777]">{label}</small>
      <b className="block truncate text-[14px] font-v2-ui-semibold">{value || "—"}</b>
    </div>
  );
}

function TicketCard({ ticket, rows, onZoom }: { ticket: UserTicket; rows: UserTicket[]; onZoom: () => void }) {
  const { t, locale } = useI18n();
  const e = ticket.ticket_tier?.event;
  const when = e ? walletDayTime(e.starts_at, e.timezone, locale) : null;
  const qr = ticketQr(ticket, rows);
  return (
    <div className="overflow-hidden rounded-[22px] bg-white text-black shadow-[0_30px_70px_rgba(0,0,0,0.5)]">
      <div className="h-[120px] overflow-hidden bg-v2-ink3">
        {e?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote flyer
          <img src={e.image_url} alt="" className="h-full w-full object-cover object-[center_30%]" />
        ) : null}
      </div>
      <div className="px-[18px] pb-[18px] pt-4">
        <b className="block font-v2-display-bold text-[24px] leading-[1.05] tracking-[-0.035em]">{e?.name ?? t("ticket.title")}</b>
        <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Cell label={t("ticket.date")} value={when?.day ?? ""} />
          <Cell label={t("ticket.starts")} value={when?.time ?? ""} />
          <Cell label={t("ticket.tier")} value={[ticket.ticket_tier?.name, ticketStage(ticket)].filter(Boolean).join(" · ")} />
          <Cell label={t("ticket.holder")} value={ticket.attendee_name || ticket.attendee_email || ""} />
        </div>
        <div className="relative -mx-[18px] my-4 border-t-2 border-dashed border-[#ddd]">
          <span className="absolute -left-[11px] -top-3 h-[22px] w-[22px] rounded-full bg-[#0b0b0b]" />
          <span className="absolute -right-[11px] -top-3 h-[22px] w-[22px] rounded-full bg-[#0b0b0b]" />
        </div>
        {ticket.status === "checked_in" && <p className="mb-2 text-center text-[13px] font-v2-ui-semibold text-[#1E7F4A]">{t("ticket.checkedIn")}</p>}
        {qr ? (
          <>
            <button type="button" onClick={onZoom} aria-label={t("ticket.enlarge")} className="mx-auto block w-[200px]">
              <QrImg qr={qr} className="h-[200px] w-[200px]" />
            </button>
            <p className="mt-2 text-center text-[12.5px] text-[#888]">{t("ticket.qrHint")}</p>
          </>
        ) : (
          <p className="py-6 text-center text-[14px] text-[#666]">{t("ticket.noQr")}</p>
        )}
      </div>
    </div>
  );
}

const circle = "inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(28,28,28,0.82)] text-v2-cream hover:bg-v2-ink4";

export default function TicketView({ id }: { id: string }) {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useUserTickets();
  const rows = useMemo(() => data?.tickets ?? [], [data?.tickets]);
  const found = useMemo(() => eventTicketSlides(rows, id), [rows, id]);
  const slides = useMemo(() => found?.slides ?? [], [found]);
  const [index, setIndex] = useState<number | null>(null);
  const current = Math.min(index ?? found?.index ?? 0, Math.max(0, slides.length - 1));
  const [zoom, setZoom] = useState(false);
  const [copied, setCopied] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const placed = useRef(false);

  // Open on the requested ticket (once the strip exists), without animation.
  useEffect(() => {
    const el = strip.current;
    if (!el || placed.current || !found) return;
    placed.current = true;
    el.scrollLeft = found.index * el.clientWidth;
  }, [found]);

  // Keep the address on the ticket being shown — no navigation, no reload.
  const shownId = slides[current]?.id;
  useEffect(() => {
    if (!shownId || typeof window === "undefined") return;
    const path = `/account/ticket/${shownId}`;
    if (window.location.pathname !== path) window.history.replaceState(window.history.state, "", path);
  }, [shownId]);

  // Keep the screen on at the door, where the browser allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= slides.length) return;
      setIndex(i);
      const el = strip.current;
      if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    },
    [slides.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoom) {
        if (e.key === "Escape") setZoom(false);
        return;
      }
      if (e.key === "ArrowRight") goTo(current + 1);
      if (e.key === "ArrowLeft") goTo(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, current, goTo]);

  const onScroll = () => {
    const el = strip.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i >= 0 && i < slides.length && i !== current) setIndex(i);
  };

  const ticket = slides[current];
  const e = ticket?.ticket_tier?.event;

  const share = async () => {
    if (!e?.slug) return;
    const url = `${window.location.origin}/events/${e.slug}`;
    try {
      if (typeof navigator.share === "function") return void (await navigator.share({ title: e.name, url }));
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* closed or not allowed */
    }
  };

  const top = (
    <header className="relative z-10 mx-auto flex h-16 max-w-[520px] items-center justify-between px-4">
      <Link href="/account" aria-label={t("common.back")} className={circle}>
        <Icon name="back" size={20} />
      </Link>
      {e?.slug && (
        <button type="button" onClick={() => void share()} aria-label={t("common.share")} className={circle}>
          <Icon name="share" size={19} />
        </button>
      )}
    </header>
  );

  if (!ticket) {
    return (
      <div className="min-h-[100dvh] bg-black">
        {top}
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 px-6 pt-20 text-center">
          {isLoading ? (
            <p className="text-[14px] text-v2-c70">{t("common.loading")}</p>
          ) : isError ? (
            <ErrorBox message={t("ticket.loadError")} onRetry={() => void refetch()} />
          ) : (
            <>
              <h1 className="font-v2-display-bold text-[20px]">{t("ticket.notFound")}</h1>
              <p className="mb-2 text-[14.5px] text-v2-c70">{t("ticket.notFoundBody")}</p>
              <Link href="/account" className="inline-flex h-9 items-center rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink">
                {t("ticket.toWallet")}
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const price = ticketPrice(ticket);
  const priceText =
    price.kind === "complimentary" ? t("ticket.complimentary") : price.kind === "free" ? t("common.free") : price.kind === "amount" ? formatCentsAsPrice(price.cents, e?.currency) : "";
  const maps = e ? directionsUrl(e) : null;
  const info = [
    [t("ticket.price"), priceText],
    [t("ticket.venue"), [e?.venue, e?.city].filter(Boolean).join(", ")],
    [t("ticket.organizer"), walletOrganizer(e) ?? ""],
  ].filter(([, v]) => !!v);
  const zoomQr = ticketQr(ticket, rows);
  const many = slides.length > 1;

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-black text-v2-cream">
      {e?.image_url && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-[-60px] scale-[1.2] bg-cover bg-center brightness-[.45] saturate-[1.3] blur-[50px]"
          style={{ backgroundImage: `url("${e.image_url}")` }}
        />
      )}
      {top}
      <main className="relative z-[1] mx-auto max-w-[520px] pb-12">
        {many && (
          <div className="mb-3.5 flex flex-col items-center gap-2 px-4">
            <div role="tablist" aria-label={t("ticket.title")} className="flex max-w-full gap-1 overflow-x-auto rounded-v2-pill bg-[#1A1A1A] p-1">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === current}
                  onClick={() => goTo(i)}
                  className={`h-[30px] shrink-0 rounded-v2-pill px-3.5 text-[13px] font-v2-ui-semibold ${i === current ? "bg-v2-cream text-v2-ink" : "text-v2-c70 hover:text-v2-cream"}`}
                >
                  {t("ticket.pick", { n: i + 1 })}
                </button>
              ))}
            </div>
            <p className="text-[12.5px] text-v2-c70" aria-live="polite">
              {t("ticket.of", { n: current + 1, total: slides.length })}
            </p>
          </div>
        )}

        <div className="relative">
          <div
            ref={strip}
            onScroll={onScroll}
            data-testid="ticket-strip"
            className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {slides.map((s) => (
              <div key={s.id} className="w-full shrink-0 snap-center px-5" aria-hidden={s.id !== ticket.id}>
                <TicketCard ticket={s} rows={rows} onZoom={() => setZoom(true)} />
              </div>
            ))}
          </div>
          {many && (
            <>
              <button
                type="button"
                onClick={() => goTo(current - 1)}
                disabled={current === 0}
                aria-label={t("ticket.prev")}
                className={`${circle} absolute -left-12 top-1/2 hidden -translate-y-1/2 disabled:opacity-30 md:inline-flex`}
              >
                <Icon name="back" size={20} />
              </button>
              <button
                type="button"
                onClick={() => goTo(current + 1)}
                disabled={current === slides.length - 1}
                aria-label={t("ticket.next")}
                className={`${circle} absolute -right-12 top-1/2 hidden -translate-y-1/2 disabled:opacity-30 md:inline-flex`}
              >
                <Icon name="chev" size={20} />
              </button>
            </>
          )}
        </div>

        <div className="mt-[18px] flex justify-center gap-10 px-5">
          {maps && (
            <a href={maps} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-[12.5px] text-v2-c90 hover:text-v2-cream">
              <span className={`${circle} h-[50px] w-[50px]`}>
                <Icon name="map" size={21} />
              </span>
              {t("ticket.directions")}
            </a>
          )}
          <Link href="/contact" className="flex flex-col items-center gap-2 text-[12.5px] text-v2-c90 hover:text-v2-cream">
            <span className={`${circle} h-[50px] w-[50px]`}>
              <Icon name="help" size={21} />
            </span>
            {t("ticket.help")}
          </Link>
        </div>

        {info.length > 0 && (
          <dl className="mx-5 mt-[22px] rounded-[16px] bg-[rgba(20,20,20,0.8)] px-4 py-1.5">
            {info.map(([k, v], i) => (
              <div key={k} className={`flex justify-between gap-4 py-2.5 text-[13.5px] ${i > 0 ? "border-t border-v2-c06" : ""}`}>
                <dt className="text-v2-c50">{k}</dt>
                <dd className="text-right font-v2-ui-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {copied && <p className="mt-4 text-center text-[13px] text-v2-c70">{t("home.copied")}</p>}
      </main>

      {zoom && zoomQr && (
        <div
          role="dialog"
          aria-label={t("ticket.enlarge")}
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-white px-8 text-center text-black"
        >
          <b className="font-v2-display-bold text-[20px]">{e?.name}</b>
          <small className="mb-6 mt-1 text-[14px] text-[#666]">{[many ? t("ticket.pick", { n: current + 1 }) : null, ticket.ticket_tier?.name].filter(Boolean).join(" · ")}</small>
          <QrImg qr={zoomQr} className="h-[min(80vw,360px)] w-[min(80vw,360px)]" />
          <p className="mt-6 text-[13px] text-[#888]">{t("ticket.closeHint")}</p>
        </div>
      )}
    </div>
  );
}
