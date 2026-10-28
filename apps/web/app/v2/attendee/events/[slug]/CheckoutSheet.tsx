"use client";

/**
 * Flame 2.0 checkout sheet on the event page (web, Kevin 2026-10-27 — part of fase 3 brought
 * forward). The event page shows only the tiers; choosing one and "Continue" opens this sheet:
 * the event, the tier with its quantity, the promoter code and (paid tickets) the discount code,
 * the 30-minute hold note, and the before-fees total. "Continue" then runs the SAME purchase
 * logic as before (EventDetail: RSVP request / free claim / hold → /purchase), now carrying the
 * promoter (into the hold or the RSVP) and the discount (applied on /purchase).
 *
 * Paid RSVPs: the discount is entered in the card-authorization step (RsvpPaymentModal), which
 * already handles it; here only the promoter.
 */
import { useEffect, useState } from "react";
import { formatCentsAsPrice, walletDayTime } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Icon } from "../../../components/Icon";

type CodeStatus = "idle" | "validating" | "valid" | "invalid";

export type CheckoutSheetProps = {
  open: boolean;
  onClose: () => void;
  event: { name: string; image_url: string | null; starts_at: string; timezone: string | null; venue: string | null; currency: string; requires_rsvp: boolean | null };
  tier: { name: string; unitCents: number; stageName?: string | null };
  quantity: number;
  maxQuantity: number;
  onQuantity: (n: number) => void;
  accessCode: string | null;
  promoter: { input: string; status: CodeStatus; onInput: (v: string) => void; onValidate: (v: string) => void; onClear: () => void };
  discount: { applied: { code: string; amountCents: number } | null; onApply: (code: string) => Promise<string | null>; onClear: () => void };
  busy: boolean;
  error: string | null;
  onContinue: () => void;
};

const field = "h-12 min-w-0 flex-1 rounded-[14px] border border-v2-c16 bg-[#1d1d1d] px-4 text-[14.5px] uppercase text-v2-cream outline-none placeholder:normal-case placeholder:text-v2-c50 focus:border-v2-c30";
const ghost = "inline-flex h-12 shrink-0 items-center justify-center rounded-v2-pill bg-v2-ink3 px-4 text-[14px] font-v2-ui-semibold hover:bg-v2-ink4 disabled:opacity-50";
const applied = "flex h-12 items-center gap-2 rounded-[14px] border border-v2-good/30 bg-v2-good/10 px-4 text-[14px] font-v2-ui-semibold text-v2-good";

export function CheckoutSheet(p: CheckoutSheetProps) {
  const { t, locale } = useI18n();
  const [promo, setPromo] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const isFree = p.tier.unitCents === 0;
  const showDiscount = !isFree && !p.event.requires_rsvp;
  const money = (c: number) => formatCentsAsPrice(c, p.event.currency);
  const when = walletDayTime(p.event.starts_at, p.event.timezone, locale);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, p.onClose]);

  if (!p.open) return null;

  const applyPromo = async () => {
    const code = promo.trim();
    if (!code || promoBusy) return;
    setPromoBusy(true);
    setPromoError(null);
    const err = await p.discount.onApply(code);
    setPromoBusy(false);
    if (err) setPromoError(err);
    else setPromo("");
  };

  const subtotal = p.tier.unitCents * p.quantity;
  const cta = p.event.requires_rsvp ? t("checkout.requestRsvp") : isFree ? t("checkout.claimFree") : t("checkout.continue");

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="presentation">
      <button type="button" aria-label={t("common.close")} onClick={p.onClose} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-label={t("checkout.title")} className="relative w-full max-w-[460px] rounded-t-[24px] bg-[#141414] text-v2-cream shadow-[0_-20px_60px_rgba(0,0,0,0.6)] md:rounded-[24px]">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-v2-c30 md:hidden" />
        <div className="max-h-[78dvh] overflow-y-auto px-5 pb-4 pt-4">
          <div className="flex items-center gap-3">
            <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-v2-ink3">
              {p.event.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote flyer
                <img src={p.event.image_url} alt="" className="h-full w-full object-cover" />
              ) : null}
            </span>
            <span className="min-w-0">
              <b className="block truncate text-[16px] font-v2-ui-semibold">{p.event.name}</b>
              <small className="block truncate text-[13px] text-v2-c70">{[`${when.day} · ${when.time}`, p.event.venue].filter(Boolean).join(" · ")}</small>
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-[#1d1d1d] p-4">
            <span className="min-w-0">
              <b className="block truncate font-v2-display-bold text-[18px] tracking-[-0.02em]">{[p.tier.name, p.tier.stageName].filter(Boolean).join(" · ")}</b>
              <small className="block text-[13px] text-v2-c70">
                <b className="text-v2-cream">{isFree ? t("common.free") : money(p.tier.unitCents)}</b>
                {p.maxQuantity > 1 ? ` · ${t("checkout.limit", { n: p.maxQuantity })}` : ""}
              </small>
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-v2-pill bg-v2-ink3 p-1">
              <button type="button" aria-label={t("checkout.decrease")} disabled={p.quantity <= 1} onClick={() => p.onQuantity(Math.max(1, p.quantity - 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[20px] hover:bg-v2-ink4 disabled:opacity-30">
                −
              </button>
              <span aria-live="polite" className="min-w-[24px] text-center text-[16px] font-v2-ui-semibold">
                {p.quantity}
              </span>
              <button type="button" aria-label={t("checkout.increase")} disabled={p.quantity >= p.maxQuantity} onClick={() => p.onQuantity(Math.min(p.maxQuantity, p.quantity + 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[20px] hover:bg-v2-ink4 disabled:opacity-30">
                +
              </button>
            </span>
          </div>

          {p.accessCode && (
            <p className={`${applied} mt-3`}>
              <Icon name="check" size={16} />
              {t("checkout.accessApplied", { code: p.accessCode })}
            </p>
          )}

          <div className="mt-3">
            {p.promoter.status === "valid" ? (
              <p className={applied}>
                <Icon name="check" size={16} />
                <span className="flex-1">{t("checkout.promoterApplied", { code: p.promoter.input.trim().toUpperCase() })}</span>
                <button type="button" onClick={p.promoter.onClear} aria-label={`${t("checkout.remove")} ${p.promoter.input}`} className="text-v2-good hover:opacity-70">
                  <Icon name="close" size={16} />
                </button>
              </p>
            ) : (
              <>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (p.promoter.input.trim()) p.promoter.onValidate(p.promoter.input);
                  }}
                >
                  <input value={p.promoter.input} onChange={(e) => p.promoter.onInput(e.target.value)} placeholder={t("checkout.promoterCode")} aria-label={t("checkout.promoterCode")} className={field} autoComplete="off" />
                  <button type="submit" disabled={!p.promoter.input.trim() || p.promoter.status === "validating"} className={ghost}>
                    {p.promoter.status === "validating" ? "…" : t("checkout.add")}
                  </button>
                </form>
                {p.promoter.status === "invalid" && p.promoter.input.trim() && <p className="mt-1.5 text-[12.5px] text-v2-errorText">{t("checkout.promoterInvalid")}</p>}
              </>
            )}
          </div>

          {showDiscount && (
            <div className="mt-3">
              {p.discount.applied ? (
                <p className={applied}>
                  <Icon name="check" size={16} />
                  <span className="flex-1">{t("checkout.discountApplied", { code: p.discount.applied.code, amount: money(p.discount.applied.amountCents) })}</span>
                  <button type="button" onClick={p.discount.onClear} aria-label={`${t("checkout.remove")} ${p.discount.applied.code}`} className="text-v2-good hover:opacity-70">
                    <Icon name="close" size={16} />
                  </button>
                </p>
              ) : (
                <>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void applyPromo();
                    }}
                  >
                    <input
                      value={promo}
                      onChange={(e) => {
                        setPromo(e.target.value);
                        setPromoError(null);
                      }}
                      placeholder={t("checkout.discountPlaceholder")}
                      aria-label={t("checkout.discountCode")}
                      className={field}
                      autoComplete="off"
                    />
                    <button type="submit" disabled={!promo.trim() || promoBusy} className={ghost}>
                      {promoBusy ? "…" : t("checkout.apply")}
                    </button>
                  </form>
                  {promoError && <p className="mt-1.5 text-[12.5px] text-v2-errorText">{promoError}</p>}
                </>
              )}
            </div>
          )}

          {!isFree && !p.event.requires_rsvp && (
            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-v2-c70">
              <Icon name="clock" size={14} />
              {t("tickets.holdNotice", { minutes: 30 })}
            </p>
          )}
          {!isFree && p.event.requires_rsvp && <p className="mt-3 text-[12.5px] text-v2-c50">{t("checkout.discountAtPayment")}</p>}
          {p.error && <p className="mt-3 rounded-[12px] bg-v2-errorText/10 px-3 py-2 text-[13px] text-v2-errorText">{p.error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-v2-c10 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
          <span className="min-w-0">
            <small className="block truncate text-[12.5px] text-v2-c50">{t("tickets.beforeFees", { quantity: p.quantity, tier: p.tier.name })}</small>
            <b className="block font-v2-display-bold text-[22px]">
              {isFree ? t("common.free") : money(Math.max(0, subtotal - (p.discount.applied?.amountCents ?? 0)))}
            </b>
          </span>
          <button type="button" onClick={p.onContinue} disabled={p.busy} className="inline-flex h-12 shrink-0 items-center rounded-v2-pill bg-v2-cream px-7 text-[15px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-60">
            {p.busy ? "…" : cta}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Have an access code?" sheet (prototype): unlocks a private tier with the existing check. */
export function AccessCodeSheet({
  open,
  onClose,
  value,
  onChange,
  onUnlock,
  status,
  error,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
  onUnlock: (v: string) => void;
  status: CodeStatus;
  error: string | null;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  // Close once the code is accepted.
  useEffect(() => {
    if (open && status === "valid") onClose();
  }, [open, status, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="presentation">
      <button type="button" aria-label={t("common.close")} onClick={onClose} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-label={t("accessCode.title")} className="relative w-full max-w-[460px] rounded-t-[24px] bg-[#141414] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 text-v2-cream md:rounded-[24px] md:pt-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-v2-c30 md:hidden" />
        <h2 className="font-v2-display-bold text-[24px] tracking-[-0.03em]">{t("accessCode.title")}</h2>
        <p className="mt-1 text-[14px] text-v2-c70">{t("accessCode.lead")}</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onUnlock(value);
          }}
        >
          <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={t("accessCode.placeholder")} aria-label={t("accessCode.title")} className={field} autoComplete="off" />
          <button type="submit" disabled={!value.trim() || status === "validating"} className="inline-flex h-12 shrink-0 items-center justify-center rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-50">
            {status === "validating" ? "…" : t("accessCode.unlock")}
          </button>
        </form>
        {status === "invalid" && error && <p className="mt-2 text-[12.5px] text-v2-errorText">{error}</p>}
      </div>
    </div>
  );
}
