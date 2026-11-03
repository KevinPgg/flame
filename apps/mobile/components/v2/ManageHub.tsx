/**
 * "Manage organization" — the prototype's hub (OW_SCREENS.manage): everything about running the
 * organization that isn't a specific event. Every org-level tool added later is a new row here,
 * never a new tab. Owner/admin only. Finance added 2026-11-02; Communications from the prototype
 * comes in a later delivery.
 */
import { Pressable, ScrollView, Text, View } from "react-native";
import { Redirect, useRouter, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { balanceRows, canAccessOrgSettings, flameV2Colors as c, formatCentsAsPrice, type StripeMoney } from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import { apiGet } from "../../lib/api";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { useOrganizerModel } from "../../hooks/v2/useOrganizerModel";
import { routes } from "../../lib/v2/routes";
import type { MyOrganization } from "../../lib/v2/organizer-api";
import { OrganizerShell, TABBAR_SPACE } from "./OrganizerShell";
import { Icon, Skeleton, type IconName } from "./ui";

type PayoutSummary =
  | { connected: false }
  | { connected: true; defaultCurrency?: string; balance?: { available?: StripeMoney[]; pending?: StripeMoney[] } };

export function ManageHub({ organization }: { organization: MyOrganization }) {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useOptionalAuth();
  const { model } = useOrganizerModel(organization);
  const allowed = canAccessOrgSettings(organization.role);

  const members = useQuery<{ members: unknown[] }>({
    queryKey: ["v2", "team-members", organization.id],
    queryFn: () => apiGet(`/api/organizations/${organization.id}/members`, getToken),
    enabled: allowed,
    staleTime: 60_000,
  });
  const payouts = useQuery<PayoutSummary>({
    queryKey: ["v2", "payouts-summary", organization.id],
    queryFn: () => apiGet(`/api/organizer/payouts/summary?organizationId=${encodeURIComponent(organization.id)}`, getToken),
    enabled: allowed,
    staleTime: 60_000,
  });

  if (!allowed) return <Redirect href={routes.dashboard(organization) as Href} />;

  const payoutLine = (() => {
    const p = payouts.data;
    if (!p) return payouts.isError ? "" : null;
    if (!p.connected) return t("manage.connectStripe");
    const row = balanceRows(p.balance, p.defaultCurrency ?? "USD")[0];
    return t("manage.available", { amount: formatCentsAsPrice(Math.max(0, row?.available ?? 0), row?.currency ?? "USD") });
  })();
  const membersLine = members.data ? t("manage.members", { count: members.data.members.length }) : members.isError ? "" : null;

  const rows: Array<{ key: string; icon: IconName; title: string; sub: string | null; href: string }> = [
    { key: "team", icon: "users", title: t("manage.team"), sub: membersLine, href: routes.team(organization) },
    { key: "payouts", icon: "bank", title: t("manage.payouts"), sub: payoutLine, href: routes.payouts(organization) },
    { key: "finance", icon: "chart", title: t("manage.finance"), sub: t("manage.financeSub"), href: routes.finance(organization) },
    { key: "settings", icon: "settings", title: t("manage.settings"), sub: t("manage.settingsSub"), href: routes.settings(organization) },
  ];

  return (
    <OrganizerShell
      organization={organization}
      pending={model?.pending ?? 0}
      section="manage"
      title={t("manage.title")}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.dashboard(organization) as Href))}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: TABBAR_SPACE + insets.bottom }}>
        <Text className="mb-2 font-v2-ui text-[15px] leading-[21px] text-v2-c70">{t("manage.lede", { org: organization.name })}</Text>
        {rows.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => router.push(r.href as Href)}
            accessibilityRole="button"
            accessibilityLabel={r.title}
            className="flex-row items-center gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 active:bg-white/[0.08]"
          >
            <Icon name={r.icon} size={20} color={c.c70} />
            <View className="min-w-0 flex-1">
              <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{r.title}</Text>
              {r.sub === null ? (
                <View className="mt-1">
                  <Skeleton width={110} height={11} />
                </View>
              ) : r.sub ? (
                <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{r.sub}</Text>
              ) : null}
            </View>
            <Icon name="chev" size={16} color="#555" />
          </Pressable>
        ))}
      </ScrollView>
    </OrganizerShell>
  );
}
