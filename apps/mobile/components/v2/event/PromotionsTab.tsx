/**
 * Discount codes (same as the web v2): one card per code with usage bar and Active / Used up;
 * validated "Add code" form; delete with confirmation. POST/DELETE /api/organizer/promotional-codes.
 */
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { flameV2Colors as c, PROMO_DISCOUNT_OPTIONS, promoCodeStatus, validatePromoCode, type PromoCodeRow } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiDelete, apiPost } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { apiErrorText, type OrgEventV2 } from "../../../lib/v2/organizer-api";
import { Button, ConfirmDialog, ErrorText, Field, Icon } from "../ui";

export function PromotionsTab({ event, canEdit, onChanged }: { event: OrgEventV2; canEdit: boolean; onChanged: () => Promise<unknown> | void }) {
  const { t } = useI18n();
  const { getToken } = useOptionalAuth();
  const codes = (event.promotional_codes ?? []) as PromoCodeRow[];
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState<number>(10);
  const [limit, setLimit] = useState("50");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PromoCodeRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function create() {
    const v = validatePromoCode(code, codes.map((x) => x.code));
    if (v.error) return setError(t(`eventAdmin.codeErrors.${v.error}`));
    const usageLimit = Number.parseInt(limit, 10);
    if (!Number.isFinite(usageLimit) || usageLimit < 1) return setError(t("eventAdmin.promotions.limitInvalid"));
    setSaving(true);
    setError(null);
    try {
      await apiPost(
        "/api/organizer/promotional-codes",
        { event_id: event.id, code: v.code, discount_percentage: discount, usage_limit: usageLimit },
        getToken,
      );
      setCode("");
      await onChanged();
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/organizer/promotional-codes/${toDelete.id}`, getToken);
      await onChanged();
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
    } finally {
      setToDelete(null);
      setDeleting(false);
    }
  }

  return (
    <View className="gap-4">
      {canEdit && (
        <View className="gap-3 rounded-v2-card bg-v2-ink2 p-4">
          <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{t("eventAdmin.promotions.add")}</Text>
          <Field
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder={t("eventAdmin.promotions.code")}
            accessibilityLabel={t("eventAdmin.promotions.code")}
            autoCapitalize="characters"
            maxLength={20}
          />
          <View className="gap-1.5">
            <Text className="font-v2-ui text-[11px] uppercase tracking-[0.5px] text-v2-c50">{t("eventAdmin.promotions.discount")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityRole="radiogroup">
              {PROMO_DISCOUNT_OPTIONS.map((d) => {
                const on = d === discount;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDiscount(d)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    className={`h-9 justify-center rounded-v2-pill px-3.5 ${on ? "bg-v2-cream" : "bg-v2-ink3"}`}
                  >
                    <Text className={`font-v2-ui-semibold text-[13px] ${on ? "text-v2-ink" : "text-v2-c70"}`}>{d}%</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View className="gap-1.5">
            <Text className="font-v2-ui text-[11px] uppercase tracking-[0.5px] text-v2-c50">{t("eventAdmin.promotions.limit")}</Text>
            <Field value={limit} onChangeText={setLimit} keyboardType="number-pad" accessibilityLabel={t("eventAdmin.promotions.limit")} className="w-[140px]" />
          </View>
          <Button label={t("eventAdmin.promotions.add")} variant="primary" onPress={create} disabled={saving || !code.trim()} />
          {error && <ErrorText>{error}</ErrorText>}
        </View>
      )}

      {codes.length === 0 ? (
        <Text className="rounded-v2-card bg-v2-ink2 px-4 py-12 text-center font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.promotions.none")}</Text>
      ) : (
        codes.map((x) => {
          const s = promoCodeStatus(x);
          return (
            <View key={x.id} className="rounded-v2-card bg-v2-ink2 p-4">
              <View className="flex-row items-start justify-between gap-2">
                <View>
                  <Text className="font-v2-display-bold text-[18px] tracking-[0.5px] text-v2-cream">{x.code}</Text>
                  <Text className="font-v2-ui text-[13px] text-v2-c70">−{x.discount_percentage}%</Text>
                </View>
                <View className={`rounded-v2-pill px-2.5 py-1 ${s.active ? "bg-[rgba(76,215,135,0.15)]" : "bg-v2-ink4"}`}>
                  <Text className={`font-v2-ui-semibold text-[12px] ${s.active ? "text-v2-good" : "text-v2-c50"}`}>
                    {s.active ? t("eventAdmin.promotions.active") : t("eventAdmin.promotions.usedUp")}
                  </Text>
                </View>
              </View>
              <View className="mt-4 h-1.5 overflow-hidden rounded-full bg-v2-ink4">
                <View className="h-full rounded-full bg-v2-flame" style={{ width: `${Math.round(s.ratio * 100)}%` }} />
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="font-v2-ui text-[12px] text-v2-c50">{t("eventAdmin.promotions.usedOf", { used: s.used, limit: s.limit })}</Text>
                {canEdit && (
                  <Pressable
                    onPress={() => setToDelete(x)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t("common.delete")} ${x.code}`}
                    hitSlop={6}
                    className="h-8 w-8 items-center justify-center rounded-v2-pill active:bg-v2-ink3"
                  >
                    <Icon name="trash" size={15} color={c.c50} />
                  </Pressable>
                )}
              </View>
            </View>
          );
        })
      )}

      <ConfirmDialog
        open={toDelete !== null}
        busy={deleting}
        message={t("eventAdmin.promotions.confirmDelete", { code: toDelete?.code ?? "" })}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </View>
  );
}
