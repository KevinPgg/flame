"use client";

/**
 * Floating "Purchase in progress" (Kevin 2026-10-28): when the buyer has a running reservation
 * (GET /api/holds/active — server-side, so it survives closing the tab or switching devices) and
 * isn't on the payment page, a pill shows the event, "2 × Tier · 12:34 left" and Continue →
 * /purchase?session=…. It disappears when the reservation expires, is paid or released; "Hide"
 * hides that reservation for this visit.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { holdCountdown } from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../components/Icon";

export type ActiveHold = {
  id: string;
  expires_at: string;
  quantity: number;
  tier: string;
  event: { name: string; slug: string; image_url: string | null } | null;
};

const KEY = "flame-hidden-hold";

export function PurchaseInProgress({ pathname, aboveBar }: { pathname: string; aboveBar: boolean }) {
  const { t } = useI18n();
  const [hold, setHold] = useState<ActiveHold | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // (usePathname may give the rewritten /v2 path or the public one: both count.)
  const onPayment = /^\/(v2\/attendee\/)?purchase(\/|$)/.test(pathname);

  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(KEY));
    } catch {
      /* private mode */
    }
  }, []);

  // Look again on every page change and when the tab comes back.
  useEffect(() => {
    if (onPayment) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/holds/active", { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        if (!cancelled) setHold(data?.hold ?? null);
      } catch {
        /* keep what we had */
      }
    };
    void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, onPayment]);

  useEffect(() => {
    if (!hold) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hold]);

  const cd = hold ? holdCountdown(hold.expires_at, now) : null;
  if (onPayment || !hold || !cd || cd.expired || hidden === hold.id) return null;

  const hide = () => {
    setHidden(hold.id);
    try {
      sessionStorage.setItem(KEY, hold.id);
    } catch {
      /* private mode */
    }
  };

  return (
    <div
      role="status"
      aria-label={t("checkout.inProgress")}
      className={`fixed inset-x-3 z-40 mx-auto flex max-w-[520px] items-center gap-3 rounded-[18px] border bg-[#141414]/95 p-2.5 pr-3 text-v2-cream shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
        cd.warn ? "border-v2-warn/40" : "border-v2-c10"
      } ${aboveBar ? "bottom-[100px]" : "bottom-[88px] lg:bottom-6"}`}
    >
      <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-v2-ink3">
        {hold.event?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote flyer
          <img src={hold.event.image_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <small className={`flex items-center gap-1 text-[11.5px] font-v2-ui-semibold uppercase tracking-[0.05em] ${cd.warn ? "text-v2-warn" : "text-v2-c50"}`}>
          <Icon name="clock" size={12} />
          {t("checkout.inProgress")}
        </small>
        <b className="block truncate text-[14px] font-v2-ui-semibold">{hold.event?.name}</b>
        <small className="block truncate text-[12.5px] text-v2-c70">
          {t("checkout.inProgressLine", { quantity: hold.quantity, tier: hold.tier, time: cd.label })}
        </small>
      </span>
      <Link href={`/purchase?session=${encodeURIComponent(hold.id)}`} className="inline-flex h-10 shrink-0 items-center rounded-v2-pill bg-v2-cream px-4 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper">
        {t("checkout.continue2")}
      </Link>
      <button type="button" onClick={hide} aria-label={t("checkout.hide")} className="shrink-0 text-v2-c50 hover:text-v2-cream">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
