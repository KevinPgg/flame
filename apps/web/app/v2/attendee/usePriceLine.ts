"use client";

import { formatCentsAsPrice, priceSummary, type PriceableTier } from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";

/** Price line of an event card ("From $15.00", "Free", "Sold out"…), same rules everywhere. */
export function usePriceLine() {
  const { t } = useI18n();
  return (e: { ticket_tiers: PriceableTier[]; currency?: string | null }): string | null => {
    const p = priceSummary(e.ticket_tiers);
    if (!p) return null;
    const money = (cents: number) => formatCentsAsPrice(cents, e.currency ?? "USD");
    if (p.kind === "free") return t("common.free");
    if (p.kind === "price") return money(p.cents);
    if (p.kind === "from") return t("common.from", { price: money(p.cents) });
    return p.kind === "soldOut" ? t("home.soldOut") : t("home.notYet");
  };
}
