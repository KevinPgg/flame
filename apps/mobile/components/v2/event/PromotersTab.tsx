/**
 * Promoter links (same as the web v2): code + optional name → generate; copy the public link;
 * delete with confirmation. Leaderboard by sales. POST/DELETE /api/organizer/promoter-links.
 * 2026-11-02 (prototype): "Paste a list" → one code + link per name (POST …/promoter-links/bulk),
 * "Copy all" for WhatsApp, and a QR per row shown on screen (screenshot or share the link).
 */
import { useState } from "react";
import { Pressable, Share, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import {
  flameV2Colors as c,
  formatCentsAsPrice,
  parsePromoterNames,
  promoterLeaderboard,
  promoterLinkUrl,
  PROMOTER_BATCH_MAX,
  validatePromoterCode,
  type PromoterLinkRow,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiDelete, apiPost } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { apiErrorText, PUBLIC_SITE_URL, type OrgEventV2 } from "../../../lib/v2/organizer-api";
import { Sheet } from "../Sheet";
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
  const [mode, setMode] = useState<"one" | "list">("one");
  const [listText, setListText] = useState("");
  const [batch, setBatch] = useState<PromoterLinkRow[] | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [qrFor, setQrFor] = useState<PromoterLinkRow | null>(null);
  const currency = event.currency ?? "USD";
  const parsedNames = parsePromoterNames(listText);
  const urlFor = (l: PromoterLinkRow) => promoterLinkUrl(PUBLIC_SITE_URL, event.slug, l.promoter_code);

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

  async function createBatch() {
    if (parsedNames.length === 0) return;
    if (parsedNames.length > PROMOTER_BATCH_MAX) return setError(t("eventAdmin.promoters.listTooMany", { max: PROMOTER_BATCH_MAX }));
    setSaving(true);
    setError(null);
    try {
      const res = await apiPost<{ promoter_links: PromoterLinkRow[] }>(
        "/api/organizer/promoter-links/bulk",
        { event_id: event.id, names: parsedNames },
        getToken
      );
      setBatch(res?.promoter_links ?? []);
      setListText("");
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
    await Clipboard.setStringAsync(urlFor(link));
    setCopied(link.id);
    setTimeout(() => setCopied((x) => (x === link.id ? null : x)), 1800);
  }

  async function copyAll(rows: PromoterLinkRow[]) {
    await Clipboard.setStringAsync(rows.map((l) => `${l.promoter_name || l.promoter_code}: ${urlFor(l)}`).join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  }

  return (
    <View className="gap-4">
      {canEdit && (
        <View className="gap-2 rounded-v2-card bg-v2-ink2 p-4">
          <Text className="mb-1 font-v2-ui-semibold text-[15px] text-v2-cream">{t("eventAdmin.promoters.create")}</Text>
          <View accessibilityRole="tablist" className="mb-1 flex-row self-start rounded-v2-pill bg-v2-ink3 p-1">
            {(["one", "list"] as const).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                onPress={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`h-8 justify-center rounded-v2-pill px-3 ${mode === m ? "bg-v2-cream" : ""}`}
              >
                <Text className={`font-v2-ui-semibold text-[12.5px] ${mode === m ? "text-v2-ink" : "text-v2-c70"}`}>
                  {m === "one" ? t("eventAdmin.promoters.modeOne") : t("eventAdmin.promoters.modeList")}
                </Text>
              </Pressable>
            ))}
          </View>
          {mode === "list" ? (
            <>
              <TextInput
                value={listText}
                onChangeText={setListText}
                multiline
                textAlignVertical="top"
                autoCorrect={false}
                placeholder={t("eventAdmin.promoters.listPlaceholder")}
                placeholderTextColor={c.c50}
                accessibilityLabel={t("eventAdmin.promoters.listLabel")}
                className="min-h-[140px] rounded-v2-md bg-v2-ink3 px-4 py-3 font-v2-ui text-[14px] leading-[22px] text-v2-cream"
              />
              <Text className="font-v2-ui text-[12.5px] text-v2-c50">
                {parsedNames.length > 0
                  ? t("eventAdmin.promoters.listCount", { count: parsedNames.length })
                  : t("eventAdmin.promoters.listHint", { max: PROMOTER_BATCH_MAX })}
              </Text>
              <Button
                label={t("eventAdmin.promoters.createLinks")}
                variant="primary"
                onPress={createBatch}
                disabled={saving || parsedNames.length === 0}
              />
            </>
          ) : (
            <>
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
            </>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </View>
      )}

      {batch && batch.length > 0 && (
        <View className="gap-3 rounded-v2-card border border-[rgba(76,215,135,0.3)] bg-v2-ink2 p-4">
          <View className="flex-row items-start gap-3">
            <Icon name="check" size={18} color={c.good} />
            <View className="min-w-0 flex-1">
              <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{t("eventAdmin.promoters.batchReady", { count: batch.length })}</Text>
              <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("eventAdmin.promoters.batchHint")}</Text>
            </View>
          </View>
          <Button
            icon={copiedAll ? "check" : "copy"}
            label={copiedAll ? t("eventAdmin.promoters.copied") : t("eventAdmin.promoters.copyAll")}
            variant="primary"
            onPress={() => void copyAll(batch)}
          />
        </View>
      )}

      <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
        {links.length === 0 ? (
          <Text className="px-4 py-12 text-center font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.promoters.none")}</Text>
        ) : (
          links.map((l, i) => (
            <View key={l.id} className={`flex-row items-center gap-2 px-4 py-3 ${i > 0 ? "border-t border-v2-c06" : ""}`}>
              <Text className="w-5 text-center font-v2-display-bold text-[15px] text-v2-c50">{i + 1}</Text>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] tracking-[0.5px] text-v2-cream">{l.promoter_code}</Text>
                <Text numberOfLines={1} className="font-v2-ui text-[12px] text-v2-c50">
                  {l.promoter_name ? `${l.promoter_name} · ` : ""}
                  {formatCentsAsPrice(l.total_revenue_cents || 0, currency)} · {t("tickets.count", { count: l.total_tickets_sold || 0 })}
                </Text>
              </View>
              <Pressable
                onPress={() => setQrFor(l)}
                accessibilityRole="button"
                accessibilityLabel={`${t("eventAdmin.promoters.qr")} ${l.promoter_code}`}
                className="h-9 w-9 items-center justify-center rounded-v2-pill bg-v2-ink3 active:bg-v2-ink4"
              >
                <Icon name="qr" size={15} color={c.c90} />
              </Pressable>
              <Pressable
                onPress={() => copy(l)}
                accessibilityRole="button"
                accessibilityLabel={`${t("eventAdmin.promoters.copy")} ${l.promoter_code}`}
                className="h-9 w-9 items-center justify-center rounded-v2-pill bg-v2-ink3 active:bg-v2-ink4"
              >
                <Icon name={copied === l.id ? "check" : "copy"} size={14} color={copied === l.id ? c.good : c.c90} />
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

      {links.length > 1 && (
        <View className="self-start">
          <Button
            small
            icon={copiedAll ? "check" : "copy"}
            label={copiedAll ? t("eventAdmin.promoters.copied") : t("eventAdmin.promoters.copyAll")}
            onPress={() => void copyAll(links)}
          />
        </View>
      )}

      <Sheet
        open={qrFor !== null}
        title={qrFor?.promoter_name || qrFor?.promoter_code || ""}
        onClose={() => setQrFor(null)}
        footer={
          qrFor ? (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  icon={copied === qrFor.id ? "check" : "copy"}
                  label={copied === qrFor.id ? t("eventAdmin.promoters.copied") : t("eventAdmin.promoters.copy")}
                  onPress={() => void copy(qrFor)}
                />
              </View>
              <View className="flex-1">
                <Button
                  icon="share"
                  variant="primary"
                  label={t("eventAdmin.promoters.share")}
                  onPress={() => void Share.share({ message: urlFor(qrFor) }).catch(() => undefined)}
                />
              </View>
            </View>
          ) : null
        }
      >
        {qrFor && (
          <View className="items-center gap-3 pb-2">
            <View className="rounded-v2-md bg-white p-3">
              <QRCode value={urlFor(qrFor)} size={232} backgroundColor="#FFFFFF" color="#0B0B0C" />
            </View>
            <Text className="font-v2-display-bold text-[22px] tracking-[2.5px] text-v2-cream">{qrFor.promoter_code}</Text>
            <Text className="text-center font-v2-ui text-[12.5px] text-v2-c50">{urlFor(qrFor).replace(/^https?:\/\//, "")}</Text>
            <Text className="text-center font-v2-ui text-[12.5px] text-v2-c70">{t("eventAdmin.promoters.qrHint")}</Text>
          </View>
        )}
      </Sheet>

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
