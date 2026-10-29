"use client";

/**
 * "You're in" after paying (fase 3.3) — and B5: the order is created by the Stripe webhook, which
 * can take a while (cold start, Stripe retries). The v1 page gave up after ~13 s and showed an
 * ERROR to someone who had paid. Here it keeps checking for ~2 minutes and, from ~10 s on, says
 * the honest thing: payment received, tickets on their way (email + My tickets). It never shows
 * an error for a slow webhook.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "../../../../lib/i18n";
import { Icon } from "../../../components/Icon";

/** Wait before the next look for the order: 1 s, 1.5 s, 2.25 s… up to 8 s. */
export function successPollDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(1.5, attempt), 8000);
}
export const SUCCESS_POLL_LIMIT_MS = 120_000;
export const SUCCESS_PREPARING_AFTER_MS = 10_000;

type Order = {
  event?: { name?: string; slug?: string } | null;
  tickets?: Array<{ id: string }> | null;
};

export function PurchaseSuccessV2() {
  const { t } = useI18n();
  const params = useSearchParams();
  const id = params?.get("order_id") || params?.get("pi") || params?.get("payment_intent");
  const [order, setOrder] = useState<Order | null>(null);
  const [preparing, setPreparing] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    if (!id) {
      setPreparing(true);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const prep = setTimeout(() => !cancelled && setPreparing(true), SUCCESS_PREPARING_AFTER_MS);
    const look = async (attempt: number) => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (!cancelled && data?.order) {
            setOrder(data.order);
            return;
          }
        }
      } catch {
        /* network blip: keep looking */
      }
      if (cancelled) return;
      if (Date.now() - started.current >= SUCCESS_POLL_LIMIT_MS) {
        setPreparing(true);
        return;
      }
      timer = setTimeout(() => void look(attempt + 1), successPollDelay(attempt));
    };
    void look(0);
    return () => {
      cancelled = true;
      clearTimeout(prep);
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const share = async () => {
    const slug = order?.event?.slug;
    if (!slug) return;
    const url = `${window.location.origin}/events/${slug}`;
    try {
      if (typeof navigator.share === "function") await navigator.share({ title: order?.event?.name ?? "Flame", url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* closed */
    }
  };

  const wrap = "mx-auto flex min-h-[60dvh] max-w-[460px] flex-col items-center justify-center gap-3 px-4 text-center text-v2-cream";
  const primary = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-v2-pill bg-v2-cream text-[15px] font-v2-ui-semibold text-v2-ink";

  if (order) {
    const first = order.tickets?.[0]?.id;
    const n = order.tickets?.length ?? 0;
    return (
      <div className={wrap}>
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-v2-good/15 text-v2-good">
          <Icon name="check" size={30} />
        </span>
        <h1 className="font-v2-display-bold text-[30px] tracking-[-0.03em]">{t("checkout.youreIn")}</h1>
        {order.event?.name && <p className="text-[15px] font-v2-ui-semibold">{order.event.name}</p>}
        <p className="text-[14px] text-v2-c70">{n > 0 ? t("tickets.count", { count: n }) : null}</p>
        <p className="text-[13.5px] text-v2-c70">{t("checkout.youreInBody")}</p>
        <div className="mt-3 flex w-full flex-col gap-2">
          <Link href={first ? `/account/ticket/${first}` : "/account"} className={primary}>
            <Icon name="qr" size={18} />
            {t("checkout.viewTickets")}
          </Link>
          <div className="flex gap-2">
            <button type="button" onClick={() => void share()} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-v2-pill bg-v2-ink3 text-[14px] font-v2-ui-semibold">
              <Icon name="share" size={16} />
              {t("checkout.share")}
            </button>
            <Link href="/" className="inline-flex h-11 flex-1 items-center justify-center rounded-v2-pill bg-v2-ink3 text-[14px] font-v2-ui-semibold">
              {t("checkout.done")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (preparing) {
    return (
      <div className={wrap} data-testid="success-preparing">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-v2-good/15 text-v2-good">
          <Icon name="check" size={30} />
        </span>
        <h1 className="font-v2-display-bold text-[26px]">{t("checkout.paymentReceived")}</h1>
        <p className="text-[14px] text-v2-c70">{t("checkout.ticketsPreparing")}</p>
        <Link href="/account" className={`${primary} mt-3`}>
          {t("checkout.toMyTickets")}
        </Link>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-v2-c16 border-t-v2-cream" />
      <p className="text-[14px] text-v2-c70">{t("checkout.paymentReceived")}…</p>
    </div>
  );
}
