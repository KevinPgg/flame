/**
 * Purchases tab (same as the web v2): card purchases with buyer, tier, quantity, scanned and
 * amount; search; Export XLSX (fresh data, same builder as v1 → share sheet).
 */
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { flameV2Colors as c, formatCentsAsPrice, formatEventDateTime } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiGet } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { exportPurchasesXlsx } from "../../../lib/organizer-xlsx-export";
import type { MyOrganization, OrganizerDataResponse, OrgEventV2 } from "../../../lib/v2/organizer-api";
import { Icon } from "../ui";

export function PurchasesTab({ event, organization }: { event: OrgEventV2; organization: MyOrganization }) {
  const { t, locale } = useI18n();
  const { getToken } = useOptionalAuth();
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = event.currency ?? "USD";
  const purchases = event.purchases ?? [];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sorted = [...purchases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!needle) return sorted;
    return sorted.filter((p) => [p.userName, p.email, p.tierName, p.stageName ?? ""].some((v) => v.toLowerCase().includes(needle)));
  }, [purchases, q]);

  async function exportXlsx() {
    setExporting(true);
    setError(null);
    try {
      // Fresh data, not the polled cache, so registration answers are current (same as the web).
      const fresh = await apiGet<OrganizerDataResponse>(`/api/organizer/data?org=${encodeURIComponent(organization.slug)}`, getToken);
      const e = fresh.events.find((x) => x.id === event.id);
      if (!e) throw new Error("event");
      await exportPurchasesXlsx({
        eventName: e.name || event.name,
        eventTimezone: e.timezone ?? event.timezone,
        currency: e.currency || currency,
        purchases: e.purchases ?? [],
        registrationFormConfig: e.registration_form_config ?? event.registration_form_config,
      });
    } catch {
      setError(t("errors.generic"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <View className="gap-3">
      <View className="h-10 flex-row items-center gap-2 rounded-v2-pill bg-v2-ink2 px-4">
        <Icon name="search" size={16} color={c.c50} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("eventAdmin.purchases.search")}
          placeholderTextColor={c.c50}
          accessibilityLabel={t("eventAdmin.purchases.search")}
          autoCorrect={false}
          autoCapitalize="none"
          className="flex-1 font-v2-ui text-[14px] text-v2-cream"
        />
      </View>
      <Pressable
        onPress={exportXlsx}
        disabled={exporting || purchases.length === 0}
        accessibilityRole="button"
        accessibilityState={{ disabled: exporting || purchases.length === 0 }}
        className={`h-10 flex-row items-center justify-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 active:bg-v2-ink4 ${exporting || purchases.length === 0 ? "opacity-50" : ""}`}
      >
        <Icon name="download" size={15} color={c.c90} />
        <Text className="font-v2-ui-semibold text-[13px] text-v2-c90">
          {exporting ? t("eventAdmin.purchases.exporting") : t("eventAdmin.purchases.export")}
        </Text>
      </Pressable>
      {error && <Text className="font-v2-ui text-[13px] text-v2-errorText">{error}</Text>}

      <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
        {rows.length === 0 ? (
          <Text className="px-4 py-12 text-center font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.purchases.none")}</Text>
        ) : (
          rows.map((p, i) => {
            const when = formatEventDateTime(p.createdAt, event.timezone, locale);
            return (
              <View key={p.id} className={`gap-1 px-4 py-3 ${i > 0 ? "border-t border-v2-c06" : ""}`}>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{p.userName}</Text>
                    <Text numberOfLines={1} className="font-v2-ui text-[12px] text-v2-c50">{p.email}</Text>
                  </View>
                  <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{formatCentsAsPrice(p.basePrice, currency)}</Text>
                </View>
                <View className="flex-row items-center justify-between gap-3">
                  <Text numberOfLines={1} className="min-w-0 flex-1 font-v2-ui text-[13px] text-v2-c70">
                    {p.tierName}
                    {p.stageName ? ` · ${p.stageName}` : ""} · {p.quantity}× · {when.date}
                  </Text>
                  <View className={`rounded-v2-pill px-2 py-0.5 ${p.scanned ? "bg-[rgba(76,215,135,0.15)]" : "bg-v2-ink4"}`}>
                    <Text className={`font-v2-ui-medium text-[12px] ${p.scanned ? "text-v2-good" : "text-v2-c50"}`}>
                      {p.scanned ? t("eventAdmin.purchases.scanned") : t("eventAdmin.purchases.notScanned")}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}
