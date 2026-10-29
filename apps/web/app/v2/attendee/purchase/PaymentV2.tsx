"use client";

/**
 * Flame 2.0 payment screen, web (fase 3.3, Kevin 2026-10-28; 3.2 merged into it). Prototype
 * `SCREENS.checkout`: back + "Checkout", the reservation countdown (B7), the event, the order
 * (tickets + promoter ✓, or a field to add one), the discount code, the breakdown (tickets,
 * discount, service fee ⓘ, total), Stripe's card form and "Pay $X". The logic is
 * StripePurchaseFlow's (same API calls); this is only the view.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Elements } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { formatCentsAsPrice, holdCountdown, walletDayTime } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import StripePaymentForm from "../../../components/StripePaymentForm";
import { flameCheckoutElementsAppearance } from "../../../lib/stripe/checkout-elements-appearance";

export type PaymentV2Status = "loading" | "error" | "ready" | "paid" | "claimed";
type CodeStatus = "idle" | "validating" | "valid" | "invalid" | "error";

type Details = {
  mode: "hold" | "rsvp";
  event: { name: string; slug: string; starts_at: string; venue: string; city: string; image_url?: string; timezone?: string | null };
  ticket_tier: { name: string };
  stage_name?: string | null;
  quantity: number;
  secret_code?: string | null;
};

export type PaymentV2Props = {
  status: PaymentV2Status;
  error: string | null;
  details: Details | null;
  amounts: { base: number; fee: number; total: number; discount?: number; currency: string } | null;
  baseCents: number;
  holdExpiresAt: string | null;
  holdExpired: boolean;
  onHoldExpired: () => void;
  promo: { input: string; applied: string | null; busy: boolean; error: string | null; onInput: (v: string) => void; onApply: () => void; onRemove: () => void };
  promoter: { fromHold: string | null; input: string; status: CodeStatus; onInput: (v: string) => void; onApply: () => void };
  isFree: boolean;
  onClaimFree: () => void;
  onCancel?: () => void;
  cancelling: boolean;
  payment: {
    clientSecret: string;
    stripePromise: Promise<Stripe | null>;
    isRsvp: boolean;
    holdSessionId: string | null;
    paymentIntentId: string | null;
    onPaymentStarted: (end: string | null) => void;
    onSuccess: (pi: string) => void;
    onError: (msg: string) => void;
    externalError: string | null;
  } | null;
};

const field = "h-12 min-w-0 flex-1 rounded-[14px] border border-v2-c16 bg-[#1d1d1d] px-4 text-[14.5px] uppercase text-v2-cream outline-none placeholder:normal-case placeholder:text-v2-c50 focus:border-v2-c30";
const ghost = "inline-flex h-12 shrink-0 items-center justify-center rounded-v2-pill bg-v2-ink3 px-4 text-[14px] font-v2-ui-semibold text-v2-cream hover:bg-v2-ink4 disabled:opacity-50";
const okChip = "flex h-12 items-center gap-2 rounded-[14px] border border-v2-good/30 bg-v2-good/10 px-4 text-[14px] font-v2-ui-semibold text-v2-good";
const h3 = "mb-3 text-[12px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50";

function Timer({ expiresAt, onExpired }: { expiresAt: string; onExpired: () => void }) {
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
  if (!c || c.expired) return null;
  return (
    <div
      data-testid="hold-timer"
      className={`sticky top-[72px] z-20 flex items-center gap-2 rounded-v2-pill border px-4 py-2.5 backdrop-blur-xl ${
        c.warn ? "border-v2-warn/40 bg-v2-warn/10 text-v2-warn" : "border-v2-c10 bg-black/80 text-v2-cream"
      }`}
    >
      <Icon name="clock" size={17} />
      <span className="text-[14px]">
        {t("checkout.holdTimer", { time: "" })}
        <b className="font-v2-ui-semibold tabular-nums">{c.label}</b>
      </span>
      {c.warn && <span className="ml-auto text-[12.5px] font-v2-ui-semibold">{t("checkout.holdWarn")}</span>}
    </div>
  );
}

export function PaymentV2(p: PaymentV2Props) {
  const { t, locale } = useI18n();
  const [feeOpen, setFeeOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Back only navigates: the reservation keeps running ("purchase in progress" brings it back).
  // Releasing it is always an explicit, confirmed "Cancel reservation" (Kevin 2026-10-29).
  const back = useCallback(() => history.back(), []);

  if (p.status === "loading") {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-v2-c70">
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-v2-c16 border-t-v2-cream" />
        <p className="text-[14px]">{t("checkout.loading")}</p>
      </div>
    );
  }
  if (p.status === "error" || !p.details) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-[460px] flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="font-v2-display-bold text-[24px] text-v2-cream">{t("checkout.loadError")}</h1>
        <p className="text-[14px] text-v2-c70">{p.error}</p>
        <Link href="/" className="mt-2 inline-flex h-11 items-center rounded-v2-pill bg-v2-cream px-6 text-[14px] font-v2-ui-semibold text-v2-ink">
          {t("checkout.backHome")}
        </Link>
      </div>
    );
  }
  if (p.status === "paid" || p.status === "claimed") {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-[460px] flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-v2-good/15 text-v2-good">
          <Icon name="check" size={30} />
        </span>
        <h1 className="font-v2-display-bold text-[26px] text-v2-cream">{p.status === "paid" ? t("checkout.paymentReceived") : t("checkout.freeClaimed")}</h1>
        {p.status === "paid" ? (
          <p className="text-[14px] text-v2-c70">{t("checkout.redirecting")}</p>
        ) : (
          <Link href="/account" className="mt-2 inline-flex h-11 items-center rounded-v2-pill bg-v2-cream px-6 text-[14px] font-v2-ui-semibold text-v2-ink">
            {t("checkout.toMyTickets")}
          </Link>
        )}
      </div>
    );
  }

  const d = p.details;
  const cur = p.amounts?.currency ?? "USD";
  const money = (c: number) => formatCentsAsPrice(c, cur);
  const when = walletDayTime(d.event.starts_at, d.event.timezone ?? null, locale);
  const tier = [d.ticket_tier.name, d.stage_name].filter(Boolean).join(" · ");
  const promoterCode = p.promoter.fromHold || (p.promoter.status === "valid" ? p.promoter.input.trim().toUpperCase() : null);
  const total = p.amounts?.total ?? p.baseCents;
  const waitingPromoter = p.promoter.status === "validating";

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 pb-16 pt-4 text-v2-cream">
      <header className="flex items-center gap-3">
        <button type="button" onClick={back} aria-label={t("common.back")} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-v2-ink3 hover:bg-v2-ink4">
          <Icon name="back" size={20} />
        </button>
        <h1 className="font-v2-display-bold text-[22px] tracking-[-0.02em]">{t("checkout.title")}</h1>
      </header>

      {p.holdExpiresAt && !p.holdExpired && <Timer expiresAt={p.holdExpiresAt} onExpired={p.onHoldExpired} />}
      {p.holdExpired && (
        <div role="alert" className="flex flex-col gap-2 rounded-[16px] border border-v2-errorText/30 bg-v2-errorText/10 p-4">
          <b className="text-[15px] font-v2-ui-semibold">{t("checkout.holdExpired")}</b>
          <p className="text-[13.5px] text-v2-c70">{t("checkout.holdExpiredBody")}</p>
          <Link href={`/events/${d.event.slug}`} className="self-start rounded-v2-pill bg-v2-cream px-4 py-2 text-[14px] font-v2-ui-semibold text-v2-ink">
            {t("checkout.holdBack")}
          </Link>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-v2-ink3">
          {d.event.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote flyer
            <img src={d.event.image_url} alt="" className="h-full w-full object-cover" />
          ) : null}
        </span>
        <span className="min-w-0">
          <b className="block truncate text-[17px] font-v2-ui-semibold">{d.event.name}</b>
          <small className="block truncate text-[13px] text-v2-c70">{`${when.day} · ${when.time}`}</small>
          <small className="block truncate text-[13px] text-v2-c70">{[d.event.venue, d.event.city].filter(Boolean).join(", ")}</small>
        </span>
      </div>

      <section>
        <h2 className={h3}>{t("checkout.order")}</h2>
        <div className="flex flex-col gap-2 rounded-[16px] bg-[#111] p-4">
          <div className="flex items-center justify-between text-[15px]">
            <span>{`${d.quantity} × ${tier}`}</span>
            <b className="font-v2-ui-semibold">{money(p.baseCents)}</b>
          </div>
          {d.secret_code && (
            <div className="flex items-center justify-between text-[14px] text-v2-c70">
              <span>{t("accessCode.title")}</span>
              <b className="inline-flex items-center gap-1.5 text-v2-good">
                <Icon name="check" size={14} />
                {d.secret_code}
              </b>
            </div>
          )}
          {promoterCode && (
            <div className="flex items-center justify-between text-[14px] text-v2-c70" data-testid="order-promoter">
              <span>{t("checkout.promoter")}</span>
              <b className="inline-flex items-center gap-1.5 text-v2-good">
                <Icon name="check" size={14} />
                {promoterCode}
              </b>
            </div>
          )}
        </div>
        {!promoterCode && (
          <div className="mt-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (p.promoter.input.trim()) p.promoter.onApply();
              }}
            >
              <input value={p.promoter.input} onChange={(e) => p.promoter.onInput(e.target.value)} placeholder={t("checkout.promoterCode")} aria-label={t("checkout.promoterCode")} className={field} autoComplete="off" />
              <button type="submit" disabled={!p.promoter.input.trim() || waitingPromoter} className={ghost}>
                {waitingPromoter ? "…" : t("checkout.add")}
              </button>
            </form>
            {p.promoter.status === "invalid" && <p className="mt-1.5 text-[12.5px] text-v2-errorText">{t("checkout.promoterInvalid")}</p>}
            {p.promoter.status === "error" && (
              <p role="alert" className="mt-1.5 text-[12.5px] text-v2-c70">
                {t("checkout.promoterCheckFailed")} ·{" "}
                <button type="button" onClick={p.promoter.onApply} className="font-v2-ui-semibold text-v2-cream underline">
                  {t("checkout.retry")}
                </button>
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className={h3}>{t("checkout.discountCode")}</h2>
        {p.promo.applied ? (
          <div className={okChip}>
            <Icon name="check" size={16} />
            <span className="flex-1">{p.promo.applied}</span>
            <button type="button" onClick={p.promo.onRemove} disabled={p.promo.busy} className="text-[13px] underline disabled:opacity-50">
              {t("checkout.remove")}
            </button>
          </div>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (p.promo.input.trim()) p.promo.onApply();
              }}
            >
              <input value={p.promo.input} onChange={(e) => p.promo.onInput(e.target.value)} placeholder={t("checkout.discountPlaceholder")} aria-label={t("checkout.discountCode")} className={field} autoComplete="off" disabled={p.promo.busy} />
              <button type="submit" disabled={!p.promo.input.trim() || p.promo.busy} className={ghost}>
                {p.promo.busy ? "…" : t("checkout.apply")}
              </button>
            </form>
            {p.promo.error && <p className="mt-1.5 text-[12.5px] text-v2-errorText">{p.promo.error}</p>}
          </>
        )}
      </section>

      {p.amounts && (
        <section className="flex flex-col gap-2 text-[14.5px]">
          <div className="flex justify-between">
            <span className="text-v2-c70">{t("checkout.tickets")}</span>
            <span>{money(p.amounts.base)}</span>
          </div>
          {!!p.amounts.discount && p.amounts.discount > 0 && (
            <div className="flex justify-between text-v2-good">
              <span>{`${t("checkout.discount")}${p.promo.applied ? ` ${p.promo.applied}` : ""}`}</span>
              <span>−{money(p.amounts.discount)}</span>
            </div>
          )}
          {p.amounts.fee > 0 && (
            <div className="flex justify-between">
              <span className="inline-flex items-center gap-1.5 text-v2-c70">
                {t("checkout.serviceFee")}
                <button type="button" onClick={() => setFeeOpen((v) => !v)} aria-label={t("checkout.serviceFee")} aria-expanded={feeOpen} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-v2-c30 text-[11px] text-v2-c70">
                  i
                </button>
              </span>
              <span>{money(p.amounts.fee)}</span>
            </div>
          )}
          {feeOpen && <p className="text-[12.5px] text-v2-c50">{t("checkout.feeInfo")}</p>}
          <div className="my-1 h-px bg-v2-c10" />
          <div className="flex justify-between text-[18px]">
            <b className="font-v2-ui-semibold">{t("checkout.total")}</b>
            <b className="font-v2-display-bold">{money(total)}</b>
          </div>
          <p className="text-[12px] text-v2-c50">{t("checkout.finalPrice")}</p>
        </section>
      )}

      {p.isFree ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13.5px] text-v2-c70">{t("checkout.noPayment")}</p>
          <button
            type="button"
            onClick={p.onClaimFree}
            disabled={p.holdExpired || waitingPromoter}
            className="inline-flex h-[52px] w-full items-center justify-center rounded-v2-pill bg-v2-cream text-[15.5px] font-v2-ui-semibold text-v2-ink disabled:opacity-50"
          >
            {t("checkout.claimFree")}
          </button>
        </div>
      ) : p.payment ? (
        <section>
          <h2 className={h3}>{t("checkout.payment")}</h2>
          <Elements key={p.payment.clientSecret} stripe={p.payment.stripePromise} options={{ clientSecret: p.payment.clientSecret, appearance: flameCheckoutElementsAppearance }}>
            <StripePaymentForm
              variant="v2"
              payLabel={t("checkout.pay", { amount: money(total) })}
              onSuccess={p.payment.onSuccess}
              onError={p.payment.onError}
              amount={total}
              currency={cur}
              isRsvp={p.payment.isRsvp}
              holdSessionId={p.payment.holdSessionId}
              paymentIntentId={p.payment.paymentIntentId}
              onPaymentStarted={p.payment.onPaymentStarted}
              // B7: expired reservation; B2: wait for a promoter being checked.
              blocked={p.holdExpired || waitingPromoter || p.promo.busy}
              externalError={p.payment.externalError}
            />
          </Elements>
        </section>
      ) : null}

      {p.onCancel && (
        <button type="button" onClick={() => setConfirmCancel(true)} disabled={p.cancelling} className="self-center text-[13.5px] text-v2-c70 underline hover:text-v2-cream disabled:opacity-50">
          {p.cancelling ? "…" : t("checkout.cancelReservation")}
        </button>
      )}
      <ConfirmDialog
        open={confirmCancel}
        message={t("checkout.cancelReservationTitle")}
        detail={t("checkout.cancelReservationDetail")}
        confirmLabel={t("checkout.cancelReservation")}
        busy={p.cancelling}
        onConfirm={() => {
          setConfirmCancel(false);
          p.onCancel?.();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
