"use client";

/**
 * Flame 2.0 tier card on the web event page (Kevin 2026-10-28, prototype `x-tcard`): name +
 * "On sale · max N" on the left, price + "Select" on the right. Picking it turns "Select" into
 * the quantity stepper in the same card — the page doesn't move; Continue is in the bottom bar.
 */
import { formatCentsAsPrice } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Icon } from "../../../components/Icon";

export type TierState = "on" | "next" | "sold" | "ended";

export function TierCard(p: {
  title: string;
  sub?: string | null;
  desc?: string | null;
  priceCents: number;
  currency: string;
  state: TierState;
  limit?: number | null;
  unlocked?: boolean;
  isRsvp: boolean;
  selected: boolean;
  quantity: number;
  max: number;
  onSelect: () => void;
  onQuantity: (n: number) => void;
  /** Selected card: the button next to the price that opens the checkout (Kevin 2026-10-28). */
  onCheckout: () => void;
  checkoutDisabled?: boolean;
}) {
  const { t } = useI18n();
  const on = p.state === "on";
  const status = { on: t("event.onSale"), next: t("event.opensNext"), sold: t("event.soldOut"), ended: t("event.salesEnded") }[p.state];
  const dot = { on: "bg-v2-good", next: "bg-v2-c50", sold: "bg-v2-errorText", ended: "bg-v2-errorText" }[p.state];
  const price = p.priceCents === 0 ? t("common.free") : formatCentsAsPrice(p.priceCents, p.currency);
  const limit = p.limit && p.limit > 0 ? ` · ${t("event.maxPer", { n: p.limit })}` : "";

  return (
    <div
      className={`rounded-[18px] border px-4 py-3.5 transition-colors ${
        p.selected ? "border-v2-cream bg-[#0f0f0f]" : on ? "border-v2-c10 bg-[#0f0f0f] hover:border-v2-c30" : "border-v2-c06 opacity-60"
      }`}
    >
      <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={!on}
        aria-disabled={!on}
        aria-pressed={p.selected}
        onClick={() => {
          if (on && !p.selected) p.onSelect();
        }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <b className={`truncate text-[16px] font-v2-ui-semibold ${on ? "text-v2-cream" : "text-v2-c70"}`}>{p.title}</b>
            {p.unlocked && <span className="rounded-[6px] bg-v2-cream px-1.5 py-0.5 text-[11px] font-v2-ui-semibold text-v2-ink">{t("event.unlocked")}</span>}
          </span>
          {p.sub && <small className="block text-[13px] text-v2-c70">{p.sub}</small>}
          <small className="mt-1 flex items-center gap-1.5 text-[12.5px] text-v2-c70">
            <i className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
            {status}
            {limit}
          </small>
        </span>
        <b className={`shrink-0 font-v2-display-bold text-[18px] ${on ? "text-v2-cream" : "text-v2-c50"} ${p.state === "sold" ? "line-through" : ""}`}>{price}</b>
        {!p.selected && on && (
          <span className="inline-flex h-9 shrink-0 items-center rounded-v2-pill bg-v2-cream px-4 text-[14px] font-v2-ui-semibold text-v2-ink">
            {p.isRsvp ? t("event.request") : t("event.select")}
          </span>
        )}
        {p.state === "next" && (
          <span className="shrink-0 text-v2-c50">
            <Icon name="lock" size={15} />
          </span>
        )}
      </button>
      {p.selected && (
        <button
          type="button"
          onClick={p.onCheckout}
          disabled={p.checkoutDisabled}
          className="inline-flex h-9 shrink-0 items-center rounded-v2-pill bg-v2-cream px-4 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-50"
        >
          {p.isRsvp ? t("event.request") : t("event.toCheckout")}
        </button>
      )}
      </div>
      {p.desc && <p className={`mt-2 whitespace-pre-wrap text-[13px] leading-[1.4] text-v2-c50 ${p.selected ? "" : "line-clamp-2"}`}>{p.desc}</p>}
      {p.selected && (
        <div className="mt-3 flex items-center justify-between border-t border-v2-c10 pt-3">
          <small className="text-[13px] text-v2-c70">{t("checkout.limit", { n: Math.max(1, p.max) })}</small>
          <span className="flex items-center gap-1 rounded-v2-pill bg-v2-ink3 p-1">
            <button
              type="button"
              aria-label={t("checkout.decrease")}
              disabled={p.quantity <= 1}
              onClick={() => p.onQuantity(Math.max(1, p.quantity - 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[20px] text-v2-cream hover:bg-v2-ink4 disabled:opacity-30"
            >
              −
            </button>
            <span aria-live="polite" className="min-w-[24px] text-center text-[16px] font-v2-ui-semibold text-v2-cream">
              {p.quantity}
            </span>
            <button
              type="button"
              aria-label={t("checkout.increase")}
              disabled={p.quantity >= p.max}
              onClick={() => p.onQuantity(Math.min(p.max, p.quantity + 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[20px] text-v2-cream hover:bg-v2-ink4 disabled:opacity-30"
            >
              +
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** Bottom bar of the event page (prototype `x-buybar`), replacing the phone tab bar and the pill. */
export function BuyBar({ kicker, value, children }: { kicker: string; value: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#161616] bg-black/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[800px] items-center gap-3.5 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3.5">
        <span className="min-w-0 shrink">
          <small className="block truncate text-[12px] text-v2-c50">{kicker}</small>
          <b className="block truncate font-v2-display-bold text-[19px] text-v2-cream">{value}</b>
        </span>
        <span className="flex min-w-0 flex-1 justify-end">{children}</span>
      </div>
    </div>
  );
}

export const buyBtn = (tone: "white" | "dark" = "white") =>
  `inline-flex h-[52px] w-full max-w-[320px] items-center justify-center gap-2 rounded-v2-pill px-5 text-[15.5px] font-v2-ui-semibold disabled:opacity-55 ${
    tone === "white" ? "bg-v2-cream text-v2-ink hover:bg-v2-paper" : "bg-v2-ink3 text-v2-c90"
  }`;
