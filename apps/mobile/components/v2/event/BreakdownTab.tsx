/**
 * Breakdown tab (same as the web v2): card (Stripe) vs bank transfer vs free tickets, what buyers
 * paid, service fees, what the organizer gets, sales by tier and by promoter. Only from
 * /api/organizer/data.
 */
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import {
  eventBreakdown,
  formatCentsAsPrice,
  promoterLeaderboard,
  salesByTier,
  type BankTransferRow,
  type CompRow,
  type PromoterLinkRow,
  type PurchaseRow,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import type { OrgEventV2 } from "../../../lib/v2/organizer-api";

export function BreakdownTab({ event }: { event: OrgEventV2 }) {
  const { t } = useI18n();
  const currency = event.currency ?? "USD";
  const money = (cents: number) => formatCentsAsPrice(cents, currency);
  const purchases = (event.purchases ?? []) as PurchaseRow[];
  const bank = (event.bank_transfer_orders ?? []) as unknown as BankTransferRow[];
  const comps = (event.promotional_tickets ?? []) as CompRow[];
  const b = eventBreakdown({ purchases, bankTransfers: bank, comps });
  const tiers = salesByTier(purchases, bank);
  const promoters = promoterLeaderboard((event.promoter_links ?? []) as PromoterLinkRow[]).filter((l) => (l.total_tickets_sold || 0) > 0);

  if (b.totalTickets === 0) {
    return <Text className="rounded-v2-card bg-v2-ink2 p-5 font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.breakdown.none")}</Text>;
  }

  return (
    <View className="gap-3">
      <Card title={t("eventAdmin.breakdown.card")} sub={`${t("tickets.count", { count: b.card.tickets })} · ${t("eventAdmin.breakdown.orders", { count: b.card.orders })}`}>
        <Line label={t("eventAdmin.breakdown.gross")} value={money(b.card.grossCents)} />
        <Line label={t("eventAdmin.breakdown.fees")} value={`− ${money(b.card.feesCents)}`} muted />
        <Line label={t("eventAdmin.breakdown.net")} value={money(b.card.netCents)} strong />
      </Card>
      <Card
        title={t("eventAdmin.breakdown.bankTransfer")}
        sub={`${t("tickets.count", { count: b.bankTransfer.tickets })} · ${t("eventAdmin.breakdown.orders", { count: b.bankTransfer.orders })}`}
      >
        <Line label={t("eventAdmin.breakdown.collected")} value={money(b.bankTransfer.collectedCents)} strong />
      </Card>
      <Card title={t("eventAdmin.breakdown.comps")} sub={t("tickets.count", { count: b.comps.tickets })}>
        <Line label={t("eventAdmin.breakdown.net")} value={money(0)} muted />
      </Card>

      <View className="flex-row items-center justify-between gap-3 rounded-v2-card bg-v2-ink3 px-5 py-4">
        <Text className="flex-1 font-v2-ui text-[14px] text-v2-c70">
          {t("eventAdmin.breakdown.organizerTotal")} · {t("tickets.count", { count: b.totalTickets })}
        </Text>
        <Text className="font-v2-display-bold text-[22px] text-v2-cream">{money(b.organizerTotalCents)}</Text>
      </View>

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
    </View>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <View className="rounded-v2-card bg-v2-ink2 p-5">
      <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{title}</Text>
      <Text className="mb-4 font-v2-ui text-[12px] text-v2-c50">{sub}</Text>
      <View className="gap-2">{children}</View>
    </View>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className={`font-v2-ui text-[14px] ${muted ? "text-v2-c50" : "text-v2-c70"}`}>{label}</Text>
      <Text className={`${strong ? "font-v2-ui-bold text-[16px]" : "font-v2-ui text-[14px]"} ${muted ? "text-v2-c50" : "text-v2-cream"}`}>{value}</Text>
    </View>
  );
}

function Table({ title, amountLabel, rows }: { title: string; amountLabel: string; rows: Array<{ key: string; label: string; tickets: number; amount: string }> }) {
  const { t } = useI18n();
  return (
    <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
      <Text className="border-b border-v2-c10 px-5 py-3 font-v2-ui-semibold text-[15px] text-v2-cream">{title}</Text>
      <View className="flex-row gap-3 px-5 py-2">
        <View className="flex-1" />
        <Text className="w-[64px] text-right font-v2-ui text-[11px] uppercase text-v2-c50">{t("eventAdmin.breakdown.colTickets")}</Text>
        <Text className="w-[96px] text-right font-v2-ui text-[11px] uppercase text-v2-c50">{amountLabel}</Text>
      </View>
      {rows.map((r) => (
        <View key={r.key} className="flex-row gap-3 border-t border-v2-c06 px-5 py-2.5">
          <Text numberOfLines={1} className="flex-1 font-v2-ui text-[14px] text-v2-cream">{r.label}</Text>
          <Text className="w-[64px] text-right font-v2-ui text-[14px] text-v2-cream">{r.tickets}</Text>
          <Text className="w-[96px] text-right font-v2-ui-semibold text-[14px] text-v2-cream">{r.amount}</Text>
        </View>
      ))}
    </View>
  );
}
