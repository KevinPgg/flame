"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCentsAsPrice, tierStats, type TierRow } from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import type { Purchase } from "../../../../../lib/utils/purchase-data";
import { useI18n } from "../../../../../lib/i18n";
import { Toggle } from "../../../../components/Toggle";
import { Icon } from "../../../../components/Icon";
import { StatusTag } from "../../../../components/StatusTag";
import { routes } from "../../../../lib/routes";
import { apiErrorMessage } from "../../../../lib/api-error";

/**
 * Tiers as their own tab (v1: buried inside Edit event). Each tier shows sold vs total,
 * pending reservations and net revenue; Sold out / Hidden are one-tap switches
 * (PATCH /api/ticket-tiers). "New tier" and "Edit" open the v2 tier editor.
 */
export default function TiersTab({
  event,
  purchases,
  canEdit,
  slug,
  onChanged,
}: {
  event: OrganizerEvent;
  purchases: Purchase[];
  canEdit: boolean;
  slug: string;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tiers = (event.ticket_tiers ?? []) as TierRow[];
  const stats = tierStats(tiers, purchases);
  const currency = event.currency ?? "USD";

  async function patch(tierId: string, body: Partial<Pick<TierRow, "is_manually_sold_out" | "is_hidden">>) {
    setBusy(tierId);
    setError(null);
    try {
      const res = await fetch("/api/ticket-tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tierId, ...body }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, t("errors.generic")));
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-v2-md bg-v2-flame/30 px-4 py-3 text-[13px] text-v2-errorText">{error}</p>}
      {stats.length === 0 && <p className="text-[14px] text-v2-c50">{t("eventAdmin.tiers.none")}</p>}
      {tiers.length > 0 && tiers.every((x) => x.is_hidden) && (
        <p role="status" className="rounded-v2-md bg-v2-warn/10 px-4 py-3 text-[13px] text-v2-warn">
          {t("eventForm.allHiddenWarning")}
        </p>
      )}
      {stats.map((s) => (
        <article key={s.tier.id} className="rounded-v2-card bg-v2-ink2 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-v2-display-bold text-[18px] tracking-[-0.02em]">{s.tier.name}</h3>
              <p className="mt-0.5 text-[14px] text-v2-c70">
                {s.tier.price_cents === 0 ? t("common.free") : formatCentsAsPrice(s.tier.price_cents, currency)}
              </p>
            </div>
            <div className="text-right">
              <div className="font-v2-ui-semibold text-[15px] tabular-nums">{formatCentsAsPrice(s.revenueCents, currency)}</div>
              <div className="text-[12px] text-v2-c50">{t("eventAdmin.kpi.revenue")}</div>
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-v2-ink4" aria-hidden>
            <div className="h-full rounded-full bg-v2-flame" style={{ width: `${Math.round(s.soldRatio * 100)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums">
            <span className="font-v2-ui-semibold">{t("eventAdmin.tiers.soldOf", { sold: s.sold, total: s.total })}</span>
            {s.reserved > 0 && <span className="text-v2-warn">{t("eventAdmin.tiers.reserved", { count: s.reserved })}</span>}
            <span className="text-v2-c50">{t("eventAdmin.tiers.remaining", { count: s.remaining })}</span>
          </div>

          {canEdit ? (
            <div className="mt-4 flex flex-wrap gap-5 border-t border-v2-c06 pt-4">
              <Toggle
                checked={Boolean(s.tier.is_manually_sold_out)}
                disabled={busy === s.tier.id}
                onChange={(v) => patch(s.tier.id, { is_manually_sold_out: v })}
                label={t("eventAdmin.tiers.soldOut")}
              />
              <Toggle
                checked={Boolean(s.tier.is_hidden)}
                disabled={busy === s.tier.id}
                onChange={(v) => patch(s.tier.id, { is_hidden: v })}
                label={t("eventAdmin.tiers.hidden")}
              />
              <Link
                href={routes.tier(event.id, slug, s.tier.id)}
                aria-label={`${t("eventAdmin.tiers.editTier")} ${s.tier.name}`}
                className="ml-auto inline-flex h-8 items-center rounded-v2-pill bg-v2-ink3 px-3.5 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
              >
                {t("eventAdmin.tiers.editTier")}
              </Link>
            </div>
          ) : (
            (s.tier.is_manually_sold_out || s.tier.is_hidden) && (
              <div className="mt-3 flex gap-2">
                {s.tier.is_manually_sold_out && <StatusTag tone="danger">{t("eventAdmin.tiers.soldOut")}</StatusTag>}
                {s.tier.is_hidden && <StatusTag>{t("eventAdmin.tiers.hidden")}</StatusTag>}
              </div>
            )
          )}
        </article>
      ))}
      {canEdit && (
        <Link
          href={routes.tier(event.id, slug, "new")}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
        >
          <Icon name="plus" size={16} />
          {t("eventAdmin.tiers.newTier")}
        </Link>
      )}
    </div>
  );
}
