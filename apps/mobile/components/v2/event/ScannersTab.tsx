/**
 * Who scans this event (same as the web v2, decisions 2026-10-16). Two separate ways in:
 *  1. Accounts: every member of the organization (and co-hosts) by default, plus anyone added
 *     here by the e-mail of their Flame account.
 *  2. Access code: a phone without an account enters the event's code (owner/admin manage it).
 * In the app there is also a direct "Scan tickets now" (opens the v2 scanner on this event).
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { isLikelyEmail, isValidAccessCode, normalizeAccessCode, normalizeEmail, personName } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient, apiDelete, apiGet, apiPost } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { routes } from "../../../lib/v2/routes";
import { SCANNING_SUPPORTED } from "../../../lib/scanner-platform";
import type { MyOrganization, OrgEventV2 } from "../../../lib/v2/organizer-api";
import { Button, ConfirmDialog, ErrorBox, ErrorText, Field, Skeleton } from "../ui";

type Scanner = { id: string; user_id: string; email: string | null; first_name: string | null; last_name: string | null };

export function ScannersTab({
  event,
  organization,
  organizationName,
  canEdit,
  canManageCode,
  onCodeChanged,
}: {
  event: OrgEventV2;
  organization: MyOrganization;
  organizationName: string;
  canEdit: boolean;
  canManageCode: boolean;
  onCodeChanged?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();
  const key = ["v2", "event-scanners", event.id];
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Scanner | null>(null);

  const list = useQuery<{ scanners: Scanner[] }>({
    queryKey: key,
    enabled: canEdit,
    queryFn: () => apiGet(`/api/organizer/events/${event.id}/scanners`, getToken),
  });

  async function add() {
    setError(null);
    if (!isLikelyEmail(email)) return setError(t("scanners.invalidEmail"));
    setBusy(true);
    try {
      await apiPost(`/api/organizer/events/${event.id}/scanners`, { email: normalizeEmail(email) }, getToken);
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      const err = e as { code?: string; status?: number; message?: string };
      setError(
        err.code === "NOT_FOUND"
          ? t("scanners.notFound")
          : err.code === "ALREADY_MEMBER"
            ? t("scanners.alreadyMember")
            : err.code === "ALREADY_SCANNER"
              ? t("scanners.alreadyScanner")
              : err.status && err.status < 500 && err.status !== 401 && err.message
                ? err.message
                : t("errors.generic"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await apiDelete(`/api/organizer/events/${event.id}/scanners?scannerId=${encodeURIComponent(removing.id)}`, getToken);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch {
      setError(t("errors.generic"));
    } finally {
      setRemoving(null);
      setBusy(false);
    }
  }

  const name = (s: Scanner) => personName({ first_name: s.first_name, last_name: s.last_name, email: s.email ?? "—" });

  return (
    <View className="gap-7">
      {SCANNING_SUPPORTED && canEdit && (
        <Button icon="scan" variant="primary" label={t("scanners.scanNow")} onPress={() => router.push(routes.scan(organization, event.id) as Href)} />
      )}

      <View className="gap-4">
        <View>
          <Text accessibilityRole="header" className="font-v2-ui-semibold text-[17px] text-v2-cream">{t("scanners.accountsTitle")}</Text>
          <Text className="mt-1 font-v2-ui text-[13.5px] leading-[19px] text-v2-c70">{t("scanners.lede", { org: organizationName })}</Text>
        </View>
        {!canEdit ? (
          <Text className="font-v2-ui text-[13px] text-v2-c50">{t("scanners.readOnly")}</Text>
        ) : (
          <>
            <View className="gap-2">
              <Text className="font-v2-ui text-[12.5px] text-v2-c70">{t("scanners.emailLabel")}</Text>
              <View className="flex-row gap-2">
                <Field
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setError(null);
                  }}
                  placeholder={t("scanners.emailPlaceholder")}
                  accessibilityLabel={t("scanners.emailLabel")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="flex-1"
                />
                <Button icon="plus" variant="primary" label={busy && !removing ? t("scanners.adding") : t("scanners.add")} onPress={add} disabled={busy || !email.trim()} />
              </View>
              {error && <ErrorText>{error}</ErrorText>}
            </View>

            <View>
              <Text className="mb-2 font-v2-ui-semibold text-[12px] uppercase tracking-[0.6px] text-v2-c50">{t("scanners.listTitle")}</Text>
              {list.isError ? (
                <ErrorBox onRetry={() => void list.refetch()} />
              ) : list.isLoading ? (
                <Skeleton width="100%" height={64} radius={18} />
              ) : (list.data?.scanners ?? []).length === 0 ? (
                <Text className="rounded-v2-card bg-v2-ink2 px-4 py-8 text-center font-v2-ui text-[14px] text-v2-c50">{t("scanners.none")}</Text>
              ) : (
                <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
                  {(list.data?.scanners ?? []).map((s, i) => (
                    <View key={s.id} className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-v2-c06" : ""}`}>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{name(s)}</Text>
                        {s.email && <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{s.email}</Text>}
                      </View>
                      <Button small variant="danger" label={t("scanners.remove")} accessibilityLabel={`${t("scanners.remove")} ${name(s)}`} onPress={() => setRemoving(s)} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </View>

      <AccessCodeSection eventId={event.id} initialCode={event.qr_scanner_code ?? null} canManage={canManageCode} onChanged={onCodeChanged} />

      <ConfirmDialog
        open={removing !== null}
        message={removing ? t("scanners.removeConfirm", { name: name(removing) }) : ""}
        detail={t("scanners.removeDetail")}
        confirmLabel={t("scanners.remove")}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </View>
  );
}

type CodeConfirm = "regenerate" | "remove" | null;

/** The event's access code, separate from accounts: show, copy, create, replace, choose, remove. */
function AccessCodeSection({
  eventId,
  initialCode,
  canManage,
  onChanged,
}: {
  eventId: string;
  initialCode: string | null;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const { getToken } = useOptionalAuth();
  const [code, setCode] = useState<string | null>(initialCode);
  const [custom, setCustom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<CodeConfirm>(null);
  const [copied, setCopied] = useState(false);

  async function send(body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      const json = await apiClient<{ code?: string | null }>(`/api/organizer/events/${eventId}/scanner-code`, {
        method: "PUT",
        body: JSON.stringify(body),
        getToken,
      });
      setCode(json?.code ?? null);
      setCopied(false);
      onChanged?.();
      return true;
    } catch (e) {
      const err = e as { code?: string };
      setError(err.code === "CODE_TAKEN" ? t("scanners.codeTaken") : err.code === "INVALID" ? t("scanners.codeInvalid") : t("errors.generic"));
      return false;
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function saveCustom() {
    const value = normalizeAccessCode(custom ?? "");
    if (!isValidAccessCode(value)) return setError(t("scanners.codeInvalid"));
    if (await send({ action: "set", code: value })) setCustom(null);
  }

  return (
    <View className="gap-4">
      <View>
        <Text accessibilityRole="header" className="font-v2-ui-semibold text-[17px] text-v2-cream">{t("scanners.codeTitle")}</Text>
        <Text className="mt-1 font-v2-ui text-[13.5px] leading-[19px] text-v2-c70">{t("scanners.codeLede")}</Text>
      </View>

      {!canManage ? (
        <Text className="font-v2-ui text-[13px] text-v2-c50">{t("scanners.codeReadOnly")}</Text>
      ) : (
        <View className="gap-4 rounded-v2-card bg-v2-ink2 p-4">
          {code ? (
            <View className="flex-row flex-wrap items-center gap-3">
              <Text testID="access-code" selectable className="rounded-v2-md bg-v2-ink3 px-4 py-2 font-v2-display-bold text-[26px] tracking-[4px] text-v2-cream">
                {code}
              </Text>
              <Button
                small
                icon={copied ? "check" : "copy"}
                label={copied ? t("scanners.codeCopied") : t("scanners.codeCopy")}
                onPress={async () => {
                  await Clipboard.setStringAsync(code);
                  setCopied(true);
                }}
              />
            </View>
          ) : (
            <Text className="font-v2-ui text-[14px] text-v2-c70">{t("scanners.codeNone")}</Text>
          )}

          {custom !== null ? (
            <View className="gap-2">
              <Text className="font-v2-ui text-[12.5px] text-v2-c70">{t("scanners.codeCustomLabel")}</Text>
              <Field
                value={custom}
                onChangeText={(v) => {
                  setCustom(v.toUpperCase());
                  setError(null);
                }}
                maxLength={12}
                autoCapitalize="characters"
                accessibilityLabel={t("scanners.codeCustomLabel")}
                className="w-[180px] tracking-[2px]"
              />
              <View className="flex-row flex-wrap gap-2">
                <Button small variant="primary" label={busy ? t("scanners.codeSaving") : t("scanners.codeSave")} onPress={saveCustom} disabled={busy || !custom.trim()} />
                <Button
                  small
                  label={t("scanners.codeCancel")}
                  onPress={() => {
                    setCustom(null);
                    setError(null);
                  }}
                />
              </View>
              {code && <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("scanners.codeChangeDetail")}</Text>}
            </View>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {code ? (
                <Button small icon="refresh" label={t("scanners.codeRegenerate")} disabled={busy} onPress={() => setConfirm("regenerate")} />
              ) : (
                <Button
                  small
                  icon="plus"
                  variant="primary"
                  label={busy ? t("scanners.codeSaving") : t("scanners.codeGenerate")}
                  disabled={busy}
                  onPress={() => void send({ action: "generate" })}
                />
              )}
              <Button
                small
                label={t("scanners.codeCustom")}
                disabled={busy}
                onPress={() => {
                  setCustom(code ?? "");
                  setError(null);
                }}
              />
              {code && <Button small icon="trash" variant="danger" label={t("scanners.codeRemove")} disabled={busy} onPress={() => setConfirm("remove")} />}
            </View>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </View>
      )}

      <ConfirmDialog
        open={confirm !== null}
        message={confirm === "remove" ? t("scanners.codeRemoveConfirm") : t("scanners.codeChangeConfirm")}
        detail={confirm === "remove" ? t("scanners.codeRemoveDetail") : t("scanners.codeChangeDetail")}
        confirmLabel={confirm === "remove" ? t("scanners.codeRemove") : t("scanners.codeRegenerate")}
        busy={busy}
        onConfirm={() => void send({ action: confirm === "remove" ? "clear" : "generate" })}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}

