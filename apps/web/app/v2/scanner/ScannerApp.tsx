"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  formatEventDateTime,
  isHappeningNow,
  parseTicketQr,
  scanErrorKind,
  scanResultKind,
  scannerEventList,
  type ScanResultKind,
  type VerifiedTicket,
} from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../components/Icon";
import { Flyer } from "../components/Flyer";
import { Skeleton } from "../components/Skeleton";
import { ErrorBox } from "../components/ErrorBox";
import { routes } from "../lib/routes";
import { useQrCamera } from "./useQrCamera";

type ScanEvent = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  city: string | null;
  timezone: string | null;
  image_url: string | null;
  organization_name: string | null;
};

type Ticket = VerifiedTicket & { attendee_email?: string | null };
type Result =
  | { kind: "checking" }
  | { kind: Exclude<ScanResultKind, "error"> | "checked_in"; ticket?: Ticket; promo?: boolean; message?: string }
  | { kind: "error"; message?: string };
type LogEntry = { at: number; name: string; kind: "checked_in" | "already" | "invalid" | "wrong_event" | "error" };

const DEVICE_KEY = "qr-scanner-device-id"; // same key as the v1 scanner

function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return `web-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Door scanner v2 (prototype "ow:scanner"): pick an event you can scan → camera → big colour-coded
 * result (valid / already in / not valid / other event) → check in → recent scans. Same verify and
 * check-in endpoints as v1; access is by person (no event code needed).
 */
export default function ScannerApp() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const eventId = params.get("event");

  const eventsQuery = useQuery<{ events: ScanEvent[] }>({
    queryKey: ["scanner-events"],
    queryFn: async () => {
      const res = await fetch("/api/qr-scanner/events");
      if (!res.ok) throw new Error(`events ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
  const events = useMemo(() => scannerEventList(eventsQuery.data?.events ?? []), [eventsQuery.data]);
  const event = events.find((e) => e.id === eventId) ?? null;

  const choose = (id: string | null) => router.replace(id ? `${pathname}?event=${encodeURIComponent(id)}` : pathname);

  // Only one event on right now → open it directly.
  useEffect(() => {
    if (!eventId && events.length > 0) {
      const live = events.filter((e) => isHappeningNow(e));
      if (live.length === 1) choose(live[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, events]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-v2-ink text-v2-cream">
      <header className="sticky top-0 z-30 flex min-h-[60px] items-center gap-2 border-b border-[#141414] bg-black/85 px-4 py-3 backdrop-blur-xl">
        <Link
          href={event ? `${pathname}` : routes.organizers()}
          onClick={(e) => {
            if (event) {
              e.preventDefault();
              choose(null);
            }
          }}
          aria-label={t("common.back")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-v2-sm text-v2-c70 hover:bg-v2-c10"
        >
          <Icon name="back" size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          {event && <div className="truncate text-[12px] text-v2-c50">{t("scanner.title")}</div>}
          <h1 className="truncate font-v2-display-bold text-[18px] tracking-[-0.03em]">{event ? event.name : t("scanner.title")}</h1>
        </div>
        {event && (
          <button
            type="button"
            onClick={() => choose(null)}
            className="inline-flex h-9 shrink-0 items-center rounded-v2-pill bg-v2-ink3 px-3.5 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
          >
            {t("scanner.changeEvent")}
          </button>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1000px] flex-1 px-4 pb-10 pt-5">
        {eventsQuery.isError ? (
          <ErrorBox message={t("scanner.loadError")} onRetry={() => void eventsQuery.refetch()} />
        ) : eventsQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-v2-card" />
            ))}
          </div>
        ) : event ? (
          <ScanView key={event.id} event={event} />
        ) : (
          <EventPicker events={events} onChoose={choose} locale={locale} />
        )}
      </main>
    </div>
  );
}

function EventPicker({ events, onChoose, locale }: { events: ScanEvent[]; onChoose: (id: string) => void; locale: string }) {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-[640px]">
      <h2 className="font-v2-display-bold text-[22px] tracking-[-0.03em]">{t("scanner.pickTitle")}</h2>
      <p className="mb-5 mt-1 text-[14px] text-v2-c70">{t("scanner.pickLede")}</p>
      {events.length === 0 ? (
        <p className="rounded-v2-card bg-v2-ink2 px-5 py-10 text-center text-[14px] leading-relaxed text-v2-c70">{t("scanner.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((e) => {
            const when = formatEventDateTime(e.starts_at, e.timezone, locale);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onChoose(e.id)}
                  className="flex w-full items-center gap-3 rounded-v2-card bg-v2-ink2 p-3 text-left hover:bg-v2-ink3"
                >
                  <Flyer src={e.image_url} size={52} className="!rounded-v2-sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px] font-v2-ui-semibold">{e.name}</b>
                    <small className="block truncate text-[12.5px] text-v2-c70">
                      {when.date} · {when.time}
                      {e.venue ? ` · ${e.venue}` : ""}
                    </small>
                    {e.organization_name && <small className="block truncate text-[12px] text-v2-c50">{e.organization_name}</small>}
                  </span>
                  {isHappeningNow(e) && (
                    <span className="shrink-0 rounded-v2-pill bg-v2-good/15 px-2.5 py-1 text-[12px] font-v2-ui-semibold text-v2-good">{t("scanner.now")}</span>
                  )}
                  <Icon name="chev" size={16} className="shrink-0 text-v2-c50" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-center text-[13px]">
        <Link href={routes.scannerWithCode()} className="text-v2-c50 underline-offset-2 hover:text-v2-cream hover:underline">
          {t("scanner.codeLink")}
        </Link>
      </p>
    </section>
  );
}

function ScanView({ event }: { event: ScanEvent }) {
  const { t, locale } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const lastText = useRef<{ text: string; at: number } | null>(null);
  const device = useRef<string>("");
  useEffect(() => {
    device.current = deviceId();
  }, []);

  const addLog = (name: string, kind: LogEntry["kind"]) => setLog((l) => [{ at: Date.now(), name, kind }, ...l].slice(0, 20));
  const time = (iso: string | number) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: event.timezone || undefined }).format(new Date(iso));

  const onText = async (text: string) => {
    // One result at a time; the same QR within 3 s is the camera seeing it again.
    if (result || busy) return;
    const now = Date.now();
    if (lastText.current && lastText.current.text === text && now - lastText.current.at < 3000) return;
    const qr = parseTicketQr(text);
    if (!qr) return;
    lastText.current = { text, at: now };
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(150);
    if (qr.eventId !== event.id) {
      setResult({ kind: "wrong_event" });
      addLog("—", "wrong_event");
      return;
    }
    setResult({ kind: "checking" });
    try {
      const res = await fetch("/api/qr-scanner/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrData: qr, deviceId: device.current }),
      });
      const json = (await res.json().catch(() => null)) as { ticket?: Ticket; isPromotionalTicket?: boolean; error?: string } | null;
      if (!res.ok || !json?.ticket) {
        const kind = scanErrorKind(res.status);
        setResult(kind === "error" ? { kind, message: json?.error } : { kind, message: json?.error });
        addLog("—", kind === "already" ? "already" : kind === "invalid" ? "invalid" : "error");
        return;
      }
      const kind = scanResultKind(json.ticket);
      setResult({ kind: kind === "error" ? "invalid" : kind, ticket: json.ticket, promo: json.isPromotionalTicket === true } as Result);
      if (kind !== "valid") addLog(json.ticket.attendee_name ?? "—", kind === "already" ? "already" : "invalid");
    } catch {
      setResult({ kind: "error" });
    }
  };

  const camera = useQrCamera(video, cameraOn, (text) => void onText(text));

  const checkIn = async () => {
    if (!result || result.kind !== "valid" || !result.ticket) return;
    setBusy(true);
    try {
      const res = await fetch("/api/qr-scanner/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: result.ticket.id, deviceId: device.current, isPromotionalTicket: result.promo === true }),
      });
      const name = result.ticket.attendee_name ?? "—";
      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as { checked_in_at?: string };
        setResult({ kind: "checked_in", ticket: { ...result.ticket, checked_in_at: json.checked_in_at ?? new Date().toISOString() } });
        addLog(name, "checked_in");
      } else if (res.status === 409) {
        setResult({ kind: "already", ticket: result.ticket });
        addLog(name, "already");
      } else {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setResult({ kind: "error", message: json?.error });
        addLog(name, "error");
      }
    } catch {
      setResult({ kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const next = () => setResult(null);

  const tone =
    result?.kind === "valid" || result?.kind === "checked_in"
      ? "bg-[#0f2f1f] border-v2-good/50"
      : result?.kind === "already"
        ? "bg-[#33260e] border-v2-warn/50"
        : result?.kind === "checking"
          ? "bg-v2-ink2 border-v2-c10"
          : "bg-[#3a0a12] border-v2-flame";
  const headline = (r: Result) =>
    r.kind === "checking"
      ? t("scanner.checking")
      : r.kind === "valid"
        ? t("scanner.valid")
        : r.kind === "checked_in"
          ? t("scanner.checkedIn")
          : r.kind === "already"
            ? t("scanner.already")
            : r.kind === "wrong_event"
              ? t("scanner.wrongEvent")
              : r.kind === "invalid"
                ? t("scanner.invalid")
                : t("scanner.error");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-v2-card bg-v2-ink2">
        <div className="relative aspect-[3/4] max-h-[68dvh] w-full bg-black sm:aspect-video lg:aspect-[4/3]">
          <video ref={video} muted playsInline className={`h-full w-full object-cover ${cameraOn ? "" : "hidden"}`} />
          {cameraOn && !result && (
            <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-[58%] w-auto aspect-square rounded-v2-card border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {!cameraOn && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <Icon name="camera" size={30} className="text-v2-c70" />
                <b className="text-[16px] font-v2-ui-semibold">{t("scanner.ready")}</b>
                <small className="max-w-[280px] text-[13px] text-v2-c70">{t("scanner.readyHint")}</small>
                <button
                  type="button"
                  onClick={() => setCameraOn(true)}
                  className="mt-2 inline-flex h-11 items-center gap-2 rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink"
                >
                  {t("scanner.activate")}
                </button>
              </div>
            </div>
          )}
          {result && (
            <div role="status" aria-live="assertive" className={`absolute inset-x-3 bottom-3 rounded-v2-card border p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${tone}`}>
              <b className="block text-[20px] font-v2-display-bold tracking-[-0.02em]">{headline(result)}</b>
              {"ticket" in result && result.ticket && (
                <div className="mt-1 text-[14px] text-v2-c90">
                  <div className="font-v2-ui-semibold">{result.ticket.attendee_name}</div>
                  <div className="text-v2-c70">
                    {result.ticket.ticket_tier?.name}
                    {result.ticket.order && result.ticket.order.quantity > 1 && result.ticket.sequence_number
                      ? ` · ${t("scanner.ticketOf", { n: result.ticket.sequence_number, total: result.ticket.order.quantity })}`
                      : ""}
                  </div>
                  {result.kind === "already" && result.ticket.checked_in_at && (
                    <div className="text-v2-warn">{t("scanner.alreadyAt", { time: time(result.ticket.checked_in_at) })}</div>
                  )}
                </div>
              )}
              {"message" in result && result.message && result.kind !== "already" && (
                <div className="mt-1 text-[13px] text-v2-c70">{result.message}</div>
              )}
              {result.kind !== "checking" && (
                <div className="mt-3 flex gap-2">
                  {result.kind === "valid" && (
                    <button
                      type="button"
                      onClick={() => void checkIn()}
                      disabled={busy}
                      className="inline-flex h-12 flex-[1.5] items-center justify-center gap-2 whitespace-nowrap rounded-v2-pill bg-v2-good px-4 text-[15px] font-v2-ui-bold text-black disabled:opacity-60"
                    >
                      <Icon name="check" size={18} strokeWidth={2.6} />
                      {busy ? t("scanner.checkingIn") : t("scanner.checkIn")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={next}
                    className="inline-flex h-12 flex-1 items-center justify-center whitespace-nowrap rounded-v2-pill bg-black/40 px-4 text-[14px] font-v2-ui-semibold"
                  >
                    {t("scanner.scanNext")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {(cameraOn || camera.error) && (
          <div className="flex flex-wrap items-center gap-2 p-3">
            {camera.error && (
              <p role="alert" className="w-full text-[13px] text-v2-errorText">
                {camera.error === "https" ? t("scanner.httpsNeeded") : t("scanner.cameraError")}
              </p>
            )}
            {camera.torchSupported && (
              <button
                type="button"
                onClick={() => void camera.toggleTorch()}
                aria-pressed={camera.torch}
                className="inline-flex h-10 items-center rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold hover:bg-v2-ink4"
              >
                {camera.torch ? t("scanner.torchOff") : t("scanner.torchOn")}
              </button>
            )}
            {cameraOn && (
              <button
                type="button"
                onClick={() => {
                  setCameraOn(false);
                  setResult(null);
                }}
                className="ml-auto inline-flex h-10 items-center rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold hover:bg-v2-ink4"
              >
                {t("scanner.stop")}
              </button>
            )}
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-[12px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50">{t("scanner.recent")}</h2>
        {log.length === 0 ? (
          <p className="rounded-v2-card bg-v2-ink2 px-4 py-8 text-center text-[13px] text-v2-c50">{t("scanner.recentEmpty")}</p>
        ) : (
          <ul className="divide-y divide-v2-c06 overflow-hidden rounded-v2-card bg-v2-ink2">
            {log.map((l) => (
              <li key={l.at} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-v2-ui-semibold">{l.name}</b>
                  <small className="text-[12px] text-v2-c50">{time(l.at)}</small>
                </span>
                <span
                  className={`shrink-0 rounded-v2-pill px-2.5 py-1 text-[12px] font-v2-ui-semibold ${
                    l.kind === "checked_in" ? "bg-v2-good/15 text-v2-good" : l.kind === "already" ? "bg-v2-warn/15 text-v2-warn" : "bg-v2-flame/30 text-v2-cream"
                  }`}
                >
                  {l.kind === "checked_in"
                    ? t("scanner.checkedIn")
                    : l.kind === "already"
                      ? t("scanner.already")
                      : l.kind === "wrong_event"
                        ? t("scanner.wrongEvent")
                        : l.kind === "invalid"
                          ? t("scanner.invalid")
                          : t("scanner.error")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
