/**
 * Finance v2 in the app (prototype "ow:finance", 2026-11-02) — same as the web: every event of
 * the organization added up (revenue, tickets sold, via promoters, ready to withdraw) and one row
 * per event (tap → that event's Breakdown tab). Read only; numbers from /api/organizer/data with
 * the Breakdown rule (lib organizationFinance). Owners and admins.
 */
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  balanceRows,
  canManagePayouts,
  flameV2Colors as c,
  formatCentsAsPrice,
  formatEventDateTime,
  organizationFinance,
  type FinanceEvent,
  type StripeMoney,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiGet } from "../../../lib/api";
import { routes } from "../../../lib/v2/routes";
import type { MyOrganization } from "../../../lib/v2/organizer-api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { OrganizerShell, TABBAR_SPACE } from "../OrganizerShell";
import { ErrorBox, Icon, Skeleton } from "../ui";

type PayoutSummary =
  | { connected: false }
  | { connected: true; defaultCurrency?: string; balance?: { available?: StripeMoney[]; pending?: StripeMoney[] } };

export function FinanceScreen({ organization }: { organization: MyOrganization }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useOptionalAuth();
  const allowed = canManagePayouts(organization.role);
  const { model, loading, failed, refetch, refreshing } = useOrganizerModel(organization);
  const finance = useMemo(() => (model ? organizationFinance(model.owned as unknown as FinanceEvent[]) : null), [model]);
  const payouts = useQuery<PayoutSummary>({
    queryKey: ["v2", "payouts-summary", organization.id],
    queryFn: () => apiGet(`/api/organizer/payouts/summary?organizationId=${encodeURIComponent(organization.id)}`, getToken),
    enabled: allowed,
    staleTime: 60_000,
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.manage(organization) as Href));

  const ready = (() => {
    const p = payouts.data;
    if (!p) return payouts.isError ? { value: "—", sub: "" } : null;
    if (!p.connected) return { value: "—", sub: t("finance.notConnected") };
    const row = balanceRows(p.balance, p.defaultCurrency ?? "USD")[0];
    return { value: formatCentsAsPrice(Math.max(0, row?.available ?? 0), row?.currency ?? "USD"), sub: t("finance.seePayouts") };
  })();

  let body;
  if (!allowed) body = <ErrorBox message={t("payouts.ownersOnly")} onRetry={back} retryLabel={t("common.back")} />;
  else if (failed) body = <ErrorBox message={t("finance.loadError")} onRetry={() => refetch()} />;
  else if (loading || !finance) body = <Skeleton width="100%" height={180} />;
  else {
    const [main, ...others] = finance.revenue;
    body = (
      <>
        <View className="flex-row flex-wrap gap-2.5">
          <Stat
            label={t("finance.revenue")}
            value={formatCentsAsPrice(main.cents, main.currency)}
            sub={[t("finance.events", { count: finance.events }), ...others.map((o) => formatCentsAsPrice(o.cents, o.currency))].join(" · ")}
          />
          <Stat label={t("finance.sold")} value={finance.sold.toLocaleString(locale)} />
          <Stat label={t("finance.viaPromoters")} value={finance.viaPromoters.toLocaleString(locale)} sub={t("finance.viaPromotersSub", { count: finance.viaPromoters })} />
          <Pressable
            onPress={() => router.push(routes.payouts(organization) as Href)}
            accessibilityRole="button"
            accessibilityLabel={t("finance.ready")}
            className="min-w-[46%] flex-1 rounded-v2-card bg-v2-ink2 p-4 active:bg-v2-ink3"
          >
            <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("finance.ready")}</Text>
            {ready ? (
              <>
                <Text className="mt-1 font-v2-display-bold text-[22px] text-v2-cream">{ready.value}</Text>
                {ready.sub ? <Text className="mt-0.5 font-v2-ui text-[12.5px] text-v2-c70">{ready.sub}</Text> : null}
              </>
            ) : (
              <View className="mt-2">
                <Skeleton width={90} height={22} />
              </View>
            )}
          </Pressable>
        </View>

        <Text className="mt-4 font-v2-ui-semibold text-[12.5px] uppercase tracking-[0.6px] text-v2-c50">{t("finance.byEvent")}</Text>
        {finance.rows.length === 0 ? (
          <Text className="rounded-v2-card bg-v2-ink2 p-4 font-v2-ui text-[14px] text-v2-c50">{t("finance.none")}</Text>
        ) : (
          <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
            <View className="flex-row px-4 py-2.5">
              <Text className="flex-1 font-v2-ui-semibold text-[12px] text-v2-c50">{t("finance.event")}</Text>
              <Text className="w-[64px] text-right font-v2-ui-semibold text-[12px] text-v2-c50">{t("finance.soldCol")}</Text>
              <Text className="w-[96px] text-right font-v2-ui-semibold text-[12px] text-v2-c50">{t("finance.revenueCol")}</Text>
            </View>
            {finance.rows.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(routes.event(r.id, organization, "breakdown") as Href)}
                accessibilityRole="button"
                accessibilityLabel={r.name}
                className="flex-row items-center border-t border-white/[0.06] px-4 py-3 active:bg-v2-ink3"
              >
                <View className="min-w-0 flex-1 pr-2">
                  <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{r.name}</Text>
                  <Text className="font-v2-ui text-[12px] text-v2-c50">{formatEventDateTime(r.starts_at, r.timezone, locale).date}</Text>
                </View>
                <Text className="w-[64px] text-right font-v2-ui text-[14px] text-v2-c90">{r.sold.toLocaleString(locale)}</Text>
                <Text className="w-[96px] text-right font-v2-ui-semibold text-[14px] text-v2-cream">{formatCentsAsPrice(r.revenueCents, r.currency)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text className="font-v2-ui text-[12.5px] leading-[18px] text-v2-c50">{t("finance.note")}</Text>
      </>
    );
  }

  return (
    <OrganizerShell organization={organization} pending={model?.pending ?? 0} section="manage" title={t("finance.title")} onBack={back}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: TABBAR_SPACE + insets.bottom }}
        refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={() => refetch()} tintColor={c.cream} />}
      >
        <Text className="font-v2-ui text-[14px] leading-[20px] text-v2-c70">{t("finance.lede", { org: organization.name })}</Text>
        {body}
      </ScrollView>
    </OrganizerShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View className="min-w-[46%] flex-1 rounded-v2-card bg-v2-ink2 p-4">
      <Text className="font-v2-ui text-[12.5px] text-v2-c50">{label}</Text>
      <Text className="mt-1 font-v2-display-bold text-[22px] text-v2-cream">{value}</Text>
      {sub ? <Text className="mt-0.5 font-v2-ui text-[12.5px] text-v2-c50">{sub}</Text> : null}
    </View>
  );
}
