"use client";

import {
  eventBreakdown,
  formatCentsAsPrice,
  promoterLeaderboard,
  salesByTier,
  type BankTransferRow,
  type CompRow,
  type PromoterLinkRow,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import type { Purchase } from "../../../../../lib/utils/purchase-data";
import { useI18n } from "../../../../../lib/i18n";

/**
 * NEW in v2 — finance view per event: card (Stripe) vs bank transfer vs free tickets,
 * what buyers paid, service fees, what the organizer gets, sales by tier and by promoter.
 * Built only from data /api/organizer/data already returns.
 */
export default function BreakdownTab({ event, purchases }: { event: OrganizerEvent; purchases: Purchase[] }) {
  const { t } = useI18n();
  const currency = event.currency ?? "USD";
  const money = (c: number) => formatCentsAsPrice(c, currency);
  const bank = (event.bank_transfer_orders ?? []) as BankTransferRow[];
  const comps = (event.promotional_tickets ?? []) as CompRow[];
  const b = eventBreakdown({ purchases, bankTransfers: bank, comps });
  const tiers = salesByTier(purchases, bank);
  const promoters = promoterLeaderboard((event.promoter_links ?? []) as PromoterLinkRow[]).filter(
    (l) => (l.total_tickets_sold || 0) > 0
  );

  if (b.totalTickets === 0) {
    return <p className="rounded-v2-card bg-v2-ink2 p-5 text-[14px] text-v2-c50">{t("eventAdmin.breakdown.none")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card title={t("eventAdmin.breakdown.card")} sub={`${t("tickets.count", { count: b.card.tickets })} · ${t("eventAdmin.breakdown.orders", { count: b.card.orders })}`}>
          <Line label={t("eventAdmin.breakdown.gross")} value={money(b.card.grossCents)} />
          <Line label={t("eventAdmin.breakdown.fees")} value={`− ${money(b.card.feesCents)}`} muted />
          <Line label={t("eventAdmin.breakdown.net")} value={money(b.card.netCents)} strong />
        </Card>
        <Card title={t("eventAdmin.breakdown.bankTransfer")} sub={`${t("tickets.count", { count: b.bankTransfer.tickets })} · ${t("eventAdmin.breakdown.orders", { count: b.bankTransfer.orders })}`}>
          <Line label={t("eventAdmin.breakdown.collected")} value={money(b.bankTransfer.collectedCents)} strong />
        </Card>
        <Card title={t("eventAdmin.breakdown.comps")} sub={t("tickets.count", { count: b.comps.tickets })}>
          <Line label={t("eventAdmin.breakdown.net")} value={money(0)} muted />
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-v2-card bg-v2-ink3 px-5 py-4">
        <span className="text-[14px] text-v2-c70">
          {t("eventAdmin.breakdown.organizerTotal")} · {t("tickets.count", { count: b.totalTickets })}
        </span>
        <span className="font-v2-display-bold text-[24px] tracking-[-0.02em] tabular-nums">{money(b.organizerTotalCents)}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Table
          title={t("eventAdmin.breakdown.byTier")}
          amountLabel={t("eventAdmin.breakdown.colAmount")}
          rows={tiers.map((r) => ({ key: r.tierName, label: r.tierName, tickets: r.tickets, amount: money(r.netCents) }))}
        />
        {promoters.length > 0 && (
          <Table
            title={t("eventAdmin.breakdown.byPromoter")}
            amountLabel={t("eventAdmin.promoters.colRevenue")}
            rows={promoters.map((l) => ({
              key: l.id,
              label: l.promoter_name ? `${l.promoter_code} · ${l.promoter_name}` : l.promoter_code,
              tickets: l.total_tickets_sold || 0,
              amount: money(l.total_revenue_cents || 0),
            }))}
          />
        )}
      </div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-v2-card bg-v2-ink2 p-5">
      <h3 className="font-v2-ui-semibold text-[15px]">{title}</h3>
      <p className="mb-4 text-[12px] text-v2-c50">{sub}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[14px]">
      <span className={muted ? "text-v2-c50" : "text-v2-c70"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-v2-ui-bold text-[16px]" : ""} ${muted ? "text-v2-c50" : ""}`}>{value}</span>
    </div>
  );
}

function Table({
  title,
  amountLabel,
  rows,
}: {
  title: string;
  amountLabel: string;
  rows: Array<{ key: string; label: string; tickets: number; amount: string }>;
}) {
  const { t } = useI18n();
  return (
    <section className="overflow-hidden rounded-v2-card bg-v2-ink2">
      <h3 className="border-b border-v2-c10 px-5 py-3 font-v2-ui-semibold text-[15px]">{title}</h3>
      <div className="grid grid-cols-[minmax(0,1fr)_72px_110px] gap-3 px-5 py-2 text-[12px] uppercase tracking-[0.04em] text-v2-c50">
        <span />
        <span className="text-right">{t("eventAdmin.breakdown.colTickets")}</span>
        <span className="text-right">{amountLabel}</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_72px_110px] gap-3 border-t border-v2-c06 px-5 py-2.5 text-[14px]">
          <span className="truncate">{r.label}</span>
          <span className="text-right tabular-nums">{r.tickets}</span>
          <span className="text-right font-v2-ui-semibold tabular-nums">{r.amount}</span>
        </div>
      ))}
    </section>
  );
}
