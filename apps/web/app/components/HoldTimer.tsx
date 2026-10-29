"use client";

/**
 * Reservation countdown on the payment page (B7, brought forward 2026-10-28 at Kevin's request).
 * The tickets are held for 30 minutes from "Continue"; this shows what's left. In the last 5
 * minutes it warns; at 0 it tells the buyer the reservation expired and the page blocks Pay.
 * When the buyer taps Pay the server extends the reservation 10 minutes (B3) and the timer
 * follows the new end time.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { holdCountdown } from "@project-flame/lib";
import { useI18n } from "../lib/i18n";

export function HoldTimer({ expiresAt, eventSlug, onExpired }: { expiresAt: string; eventSlug: string; onExpired: () => void }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const c = holdCountdown(expiresAt, now);
  const expired = !!c?.expired;
  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);
  if (!c) return null;

  if (c.expired) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-card border border-error/40 bg-error/10 px-4 py-3">
        <p className="m-0 text-white-100 font-poppins-semibold text-sm">{t("checkout.holdExpired")}</p>
        <p className="m-0 text-white-70 text-sm font-poppins-light">{t("checkout.holdExpiredBody")}</p>
        <Link href={`/events/${eventSlug}`} className="self-start rounded-pill bg-white-100 px-4 py-2 text-sm font-poppins-semibold text-dark no-underline">
          {t("checkout.holdBack")}
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid="hold-timer"
      className={`sticky top-20 z-10 flex items-center gap-2 rounded-card border px-4 py-3 backdrop-blur ${
        c.warn ? "border-[#FBD68D]/50 bg-[#FBD68D]/10" : "border-white-20 bg-black/70"
      }`}
    >
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-white-100 shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span className="text-white-100 text-sm font-poppins">
        {t("checkout.holdTimer", { time: "" })}
        <b className="font-poppins-semibold tabular-nums">{c.label}</b>
      </span>
      {c.warn && <span className="ml-auto text-[#FBD68D] text-xs font-poppins-medium">{t("checkout.holdWarn")}</span>}
    </div>
  );
}
