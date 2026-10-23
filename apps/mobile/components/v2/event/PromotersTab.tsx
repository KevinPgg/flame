/**
 * Promoter links (same as the web v2): code + optional name → generate; copy the public link;
 * delete with confirmation. Leaderboard by sales. POST/DELETE /api/organizer/promoter-links.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  flameV2Colors as c,
  formatCentsAsPrice,
  promoterLeaderboard,
  promoterLinkUrl,
  validatePromoterCode,
  type PromoterLinkRow,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiDelete, apiPost } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { apiErrorText, PUBLIC_SITE_URL, type OrgEventV2 } from "../../../lib/v2/organizer-api";
import { Button, ConfirmDialog, ErrorText, Field, Icon } from "../ui";

export function PromotersTab({ event, canEdit, onChanged }: { event: OrgEventV2; canEdit: boolean; onChanged: () => Promise<unknown> | void }) {
  const { t } = useI18n();
  const { getToken } = useOptionalAuth();
  const links = promoterLeaderboard((event.promoter_links ?? []) as PromoterLinkRow[]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PromoterLinkRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const currency = event.currency ?? "USD";

  async function create() {
    const v = validatePromoterCode(code, links.map((l) => l.promoter_code));
    if (v.error) return setError(t(`eventAdmin.codeErrors.${v.error}`));
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/organizer/promoter-links", { event_id: event.id, promoter_code: v.code, promoter_name: name.trim() || null }, getToken);
      setCode("");
      setName("");
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
      await apiDelete(`/api/organizer/promoter-links/${toDelete.id}`, getToken);
      await onChanged();
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
    } finally {
      setToDelete(null);
      setDeleting(false);
    }
  }

  async function copy(link: PromoterLinkRow) {
    await Clipboard.setStringAsync(promoterLinkUrl(PUBLIC_SITE_URL, event.slug, link.promoter_code));
    setCopied(link.id);
    setTimeout(() => setCopied((x) => (x === link.id ? null : x)), 1800);
  }

  return (
    <View className="gap-4">
      {canEdit && (
        <View className="gap-2 rounded-v2-card bg-v2-ink2 p-4">
          <Text className="mb-1 font-v2-ui-semibold text-[15px] text-v2-cream">{t("eventAdmin.promoters.create")}</Text>
          <Field
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder={t("eventAdmin.promoters.code")}
            accessibilityLabel={t("eventAdmin.promoters.code")}
            autoCapitalize="characters"
            maxLength={50}
          />
          <Field value={name} onChangeText={setName} placeholder={t("eventAdmin.promoters.name")} accessibilityLabel={t("eventAdmin.promoters.name")} />
          <Button label={t("eventAdmin.promoters.generate")} variant="primary" onPress={create} disabled={saving || !code.trim()} />
          {error && <ErrorText>{error}</ErrorText>}
        </View>
      )}

      <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
        {links.length === 0 ? (
          <Text className="px-4 py-12 text-center font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.promoters.none")}</Text>
        ) : (
          links.map((l, i) => (
            <View key={l.id} className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-v2-c06" : ""}`}>
              <Text className="w-5 text-center font-v2-display-bold text-[15px] text-v2-c50">{i + 1}</Text>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] tracking-[0.5px] text-v2-cream">{l.promoter_code}</Text>
                <Text numberOfLines={1} className="font-v2-ui text-[12px] text-v2-c50">
                  {l.promoter_name ? `${l.promoter_name} · ` : ""}
                  {formatCentsAsPrice(l.total_revenue_cents || 0, currency)} · {t("tickets.count", { count: l.total_tickets_sold || 0 })}
                </Text>
              </View>
              <Pressable
                onPress={() => copy(l)}
                accessibilityRole="button"
                accessibilityLabel={`${t("eventAdmin.promoters.copy")} ${l.promoter_code}`}
                className="h-9 flex-row items-center gap-1.5 rounded-v2-pill bg-v2-ink3 px-3 active:bg-v2-ink4"
              >
                <Icon name={copied === l.id ? "check" : "copy"} size={14} color={c.c90} />
                <Text className="font-v2-ui-semibold text-[12px] text-v2-c90">
                  {copied === l.id ? t("eventAdmin.promoters.copied") : t("eventAdmin.promoters.copy")}
                </Text>
              </Pressable>
              {canEdit && (
                <Pressable
                  onPress={() => setToDelete(l)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("common.delete")} ${l.promoter_code}`}
                  hitSlop={6}
                  className="h-9 w-9 items-center justify-center rounded-v2-pill active:bg-v2-ink3"
                >
                  <Icon name="trash" size={16} color={c.c50} />
                </Pressable>
              )}
            </View>
          ))
        )}
      </View>

      <ConfirmDialog
        open={toDelete !== null}
        busy={deleting}
        message={t("eventAdmin.promoters.confirmDelete", { code: toDelete?.promoter_code ?? "" })}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </View>
  );
}
