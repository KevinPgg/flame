/**
 * Tiers tab (same as the web v2): sold vs total, pending reservations, remaining, net revenue;
 * Sold out / Hidden as one-tap switches (PATCH /api/ticket-tiers). New / Edit tier open the
 * tier editor (v1 until 1b.4).
 */
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { flameV2Colors as c, formatCentsAsPrice, tierStats, type PurchaseRow, type TierRow } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiPatch } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { routes } from "../../../lib/v2/routes";
import { apiErrorText, type MyOrganization, type OrgEventV2 } from "../../../lib/v2/organizer-api";
import { Icon, StatusTag } from "../ui";

export function TiersTab({
  event,
  purchases,
  canEdit,
  organization,
  onChanged,
}: {
  event: OrgEventV2;
  purchases: PurchaseRow[];
  canEdit: boolean;
  organization: MyOrganization;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { getToken } = useOptionalAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tiers = (event.ticket_tiers ?? []) as TierRow[];
  const stats = tierStats(tiers, purchases);
  const currency = event.currency ?? "USD";

  async function patch(tierId: string, body: { is_manually_sold_out?: boolean; is_hidden?: boolean }) {
    setBusy(tierId);
    setError(null);
    try {
      await apiPatch("/api/ticket-tiers", { id: tierId, ...body }, getToken);
      await onChanged();
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="gap-3">
      {error && <Text accessibilityRole="alert" className="rounded-v2-md bg-[rgba(136,5,23,0.3)] px-4 py-3 font-v2-ui text-[13px] text-v2-errorText">{error}</Text>}
      {stats.length === 0 && <Text className="font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.tiers.none")}</Text>}
      {tiers.length > 0 && tiers.every((x) => x.is_hidden) && (
        <Text className="rounded-v2-md bg-[rgba(255,180,67,0.1)] px-4 py-3 font-v2-ui text-[13px] text-v2-warn">{t("eventForm.allHiddenWarning")}</Text>
      )}
      {stats.map((s) => (
        <View key={s.tier.id} className="rounded-v2-card bg-v2-ink2 p-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="font-v2-display-bold text-[18px] tracking-[-0.4px] text-v2-cream">{s.tier.name}</Text>
              <Text className="mt-0.5 font-v2-ui text-[14px] text-v2-c70">
                {s.tier.price_cents === 0 ? t("common.free") : formatCentsAsPrice(s.tier.price_cents, currency)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{formatCentsAsPrice(s.revenueCents, currency)}</Text>
              <Text className="font-v2-ui text-[12px] text-v2-c50">{t("eventAdmin.kpi.revenue")}</Text>
            </View>
          </View>

          <View className="mt-4 h-2 overflow-hidden rounded-full bg-v2-ink4">
            <View className="h-full rounded-full bg-v2-flame" style={{ width: `${Math.round(s.soldRatio * 100)}%` }} />
          </View>
          <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
            <Text className="font-v2-ui-semibold text-[13px] text-v2-cream">{t("eventAdmin.tiers.soldOf", { sold: s.sold, total: s.total })}</Text>
            {s.reserved > 0 && <Text className="font-v2-ui text-[13px] text-v2-warn">{t("eventAdmin.tiers.reserved", { count: s.reserved })}</Text>}
            <Text className="font-v2-ui text-[13px] text-v2-c50">{t("eventAdmin.tiers.remaining", { count: s.remaining })}</Text>
          </View>

          {canEdit ? (
            <View className="mt-4 flex-row flex-wrap items-center gap-x-5 gap-y-3 border-t border-v2-c06 pt-4">
              <SwitchLabel
                label={t("eventAdmin.tiers.soldOut")}
                value={Boolean(s.tier.is_manually_sold_out)}
                disabled={busy === s.tier.id}
                onChange={(v) => patch(s.tier.id, { is_manually_sold_out: v })}
              />
              <SwitchLabel
                label={t("eventAdmin.tiers.hidden")}
                value={Boolean(s.tier.is_hidden)}
                disabled={busy === s.tier.id}
                onChange={(v) => patch(s.tier.id, { is_hidden: v })}
              />
              <Pressable
                onPress={() => router.push(routes.tier(event.id, organization, s.tier.id) as Href)}
                accessibilityRole="button"
                accessibilityLabel={`${t("eventAdmin.tiers.editTier")} ${s.tier.name}`}
                className="ml-auto h-8 justify-center rounded-v2-pill bg-v2-ink3 px-3.5 active:bg-v2-ink4"
              >
                <Text className="font-v2-ui-semibold text-[13px] text-v2-c90">{t("eventAdmin.tiers.editTier")}</Text>
              </Pressable>
            </View>
          ) : (
            (s.tier.is_manually_sold_out || s.tier.is_hidden) && (
              <View className="mt-3 flex-row gap-2">
                {s.tier.is_manually_sold_out && <StatusTag tone="danger">{t("eventAdmin.tiers.soldOut")}</StatusTag>}
                {s.tier.is_hidden && <StatusTag>{t("eventAdmin.tiers.hidden")}</StatusTag>}
              </View>
            )
          )}
        </View>
      ))}
      {canEdit && (
        <Pressable
          onPress={() => router.push(routes.tier(event.id, organization, "new") as Href)}
          accessibilityRole="button"
          className="h-10 flex-row items-center gap-2 self-start rounded-v2-pill bg-v2-ink3 px-4 active:bg-v2-ink4"
        >
          <Icon name="plus" size={16} color={c.c90} />
          <Text className="font-v2-ui-semibold text-[13px] text-v2-c90">{t("eventAdmin.tiers.newTier")}</Text>
        </Pressable>
      )}
    </View>
  );
}

function SwitchLabel({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="flex-row items-center gap-2">
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: c.ink4, true: c.flame }}
        thumbColor={c.cream}
        ios_backgroundColor={c.ink4}
      />
      <Text className="font-v2-ui-medium text-[13px] text-v2-c90">{label}</Text>
    </View>
  );
}

