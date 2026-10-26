/**
 * Organizer approvals for Flame support (W7-H1), Flame 2.0 style (fase 1b.7: "cola de aprobación
 * de soporte en estilo 2.0"). Same admin-gated web API and hooks as before
 * (hooks/useAdminOrganizations; the API is the real boundary): tabs Pending / Rejected with
 * counts, search, approve (confirm), reject with an optional reason, delete (confirm).
 */
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flameV2Colors as c, foldForSearch } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import {
  useAdminOrganizations,
  useApproveOrg,
  useDeleteOrg,
  useIsSupportAdmin,
  useRejectOrg,
  type AdminOrganization,
  type AdminOrgStatus,
} from "../../../hooks/useAdminOrganizations";
import { Button, ConfirmDialog, ErrorBox, ErrorText, Icon, Skeleton, Spinner } from "../ui";
import { Sheet } from "../Sheet";
import { Input } from "../form/ui";
import { Avatar } from "../people/PeoplePicker";

export function OrgApprovals() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, isLoading } = useIsSupportAdmin();
  const [tab, setTab] = useState<AdminOrgStatus>("pending");
  const [search, setSearch] = useState("");
  const pending = useAdminOrganizations("pending", isAdmin);
  const rejected = useAdminOrganizations("rejected", isAdmin);
  const current = tab === "pending" ? pending : rejected;
  const orgs = current.data?.organizations ?? [];
  const q = foldForSearch(search.trim());
  const shown = q ? orgs.filter((o) => foldForSearch(`${o.name} ${o.owner_email ?? ""} ${o.owner_name ?? ""}`).includes(q)) : orgs;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/profile" as Href));

  return (
    <View className="flex-1 bg-v2-ink">
      <View style={{ paddingTop: insets.top }} className="border-b border-[#141414] bg-v2-ink">
        <View className="h-14 flex-row items-center gap-1 px-2">
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={6} className="h-10 w-10 items-center justify-center rounded-v2-sm active:bg-v2-c10">
            <Icon name="back" size={22} color={c.cream} />
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={1} className="flex-1 px-1 font-v2-display-bold text-[18px] tracking-[-0.5px] text-v2-cream">{t("supportQueue.title")}</Text>
        </View>
      </View>

      {isLoading ? (
        <Spinner />
      ) : !isAdmin ? (
        <View className="px-4 pt-6">
          <ErrorBox message={t("supportQueue.notAdmin")} onRetry={back} retryLabel={t("common.back")} />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={current.isRefetching} onRefresh={() => void current.refetch()} tintColor={c.cream} />}
        >
          <Text className="font-v2-ui text-[14px] leading-[20px] text-v2-c70">{t("supportQueue.lede")}</Text>
          <View className="flex-row gap-2" accessibilityRole="tablist">
            {(["pending", "rejected"] as const).map((k) => {
              const on = tab === k;
              const n = (k === "pending" ? pending : rejected).data?.organizations.length;
              return (
                <Pressable
                  key={k}
                  onPress={() => setTab(k)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  className={`h-9 flex-row items-center gap-2 rounded-v2-pill px-4 ${on ? "bg-v2-cream" : "bg-v2-ink3"}`}
                >
                  <Text className={`font-v2-ui-semibold text-[13px] ${on ? "text-v2-ink" : "text-v2-c70"}`}>{t(`supportQueue.${k}`)}</Text>
                  {n !== undefined && <Text className={`font-v2-ui text-[13px] ${on ? "text-black/50" : "text-v2-c50"}`}>{n}</Text>}
                </Pressable>
              );
            })}
          </View>
          {orgs.length > 4 && (
            <View className="h-10 flex-row items-center gap-2 rounded-v2-pill bg-v2-ink2 px-4">
              <Icon name="search" size={16} color={c.c50} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("supportQueue.search")}
                placeholderTextColor={c.c50}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel={t("supportQueue.search")}
                className="flex-1 font-v2-ui text-[14px] text-v2-cream"
              />
            </View>
          )}

          {current.isLoading ? (
            <View className="gap-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} width="100%" height={120} radius={16} />
              ))}
            </View>
          ) : current.isError ? (
            <ErrorBox message={t("supportQueue.loadError")} onRetry={() => void current.refetch()} />
          ) : shown.length === 0 ? (
            <View className="rounded-v2-card bg-v2-ink2 px-4 py-10">
              <Text className="text-center font-v2-ui text-[14px] text-v2-c50">
                {orgs.length === 0 ? (tab === "pending" ? t("supportQueue.emptyPending") : t("supportQueue.emptyRejected")) : t("supportQueue.noMatch")}
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {shown.map((o) => (
                <OrgCard key={o.id} org={o} status={tab} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function OrgCard({ org, status }: { org: AdminOrganization; status: AdminOrgStatus }) {
  const { t, locale } = useI18n();
  const approve = useApproveOrg();
  const reject = useRejectOrg();
  const del = useDeleteOrg();
  const [ask, setAsk] = useState<"approve" | "reject" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const busy = approve.isPending || reject.isPending || del.isPending;
  const error = approve.error?.message || reject.error?.message || del.error?.message;
  let created = "";
  try {
    created = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(org.created_at));
  } catch {
    created = org.created_at.slice(0, 10);
  }

  return (
    <View className="gap-3 rounded-v2-card bg-v2-ink2 p-4">
      <View className="flex-row items-start gap-3">
        <Avatar name={org.name} size={44} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{org.name}</Text>
          <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c70">
            {org.owner_email ?? t("supportQueue.noOwnerEmail")}
            {org.owner_name ? ` · ${org.owner_name}` : ""}
          </Text>
          <Text className="mt-0.5 font-v2-ui text-[12px] text-v2-c50">{t("supportQueue.created", { date: created })}</Text>
          {status === "rejected" && org.rejection_reason ? (
            <Text className="mt-1 font-v2-ui text-[12.5px] text-v2-warn">{t("supportQueue.reason", { reason: org.rejection_reason })}</Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button small variant="danger" label={t("supportQueue.delete")} accessibilityLabel={`${t("supportQueue.delete")} ${org.name}`} onPress={() => setAsk("delete")} disabled={busy} />
        {status === "pending" && <Button small label={t("supportQueue.reject")} accessibilityLabel={`${t("supportQueue.reject")} ${org.name}`} onPress={() => setAsk("reject")} disabled={busy} />}
        <Button small variant="primary" icon="check" label={t("supportQueue.approve")} accessibilityLabel={`${t("supportQueue.approve")} ${org.name}`} onPress={() => setAsk("approve")} disabled={busy} />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <ConfirmDialog
        open={ask === "approve"}
        message={t("supportQueue.approveConfirm", { name: org.name })}
        detail={t("supportQueue.approveDetail")}
        confirmLabel={t("supportQueue.approve")}
        busy={busy}
        onConfirm={() => {
          setAsk(null);
          approve.mutate(org.id);
        }}
        onCancel={() => setAsk(null)}
      />
      <ConfirmDialog
        open={ask === "delete"}
        message={t("supportQueue.deleteConfirm", { name: org.name })}
        detail={t("supportQueue.deleteDetail")}
        confirmLabel={t("supportQueue.delete")}
        busy={busy}
        onConfirm={() => {
          setAsk(null);
          del.mutate(org.id);
        }}
        onCancel={() => setAsk(null)}
      />
      <Sheet
        open={ask === "reject"}
        title={t("supportQueue.rejectTitle", { name: org.name })}
        onClose={() => setAsk(null)}
        footer={
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label={t("common.cancel")} onPress={() => setAsk(null)} disabled={busy} />
            </View>
            <View className="flex-[2]">
              <Button
                variant="primary"
                label={t("supportQueue.reject")}
                disabled={busy}
                onPress={() =>
                  reject.mutate(
                    { orgId: org.id, reason: reason.trim() || undefined },
                    {
                      onSuccess: () => {
                        setAsk(null);
                        setReason("");
                      },
                    },
                  )
                }
              />
            </View>
          </View>
        }
      >
        <Text className="mb-1.5 font-v2-ui text-[12.5px] text-v2-c70">{t("supportQueue.reasonLabel")}</Text>
        <Input value={reason} onChangeText={setReason} placeholder={t("supportQueue.reasonPlaceholder")} accessibilityLabel={t("supportQueue.reasonLabel")} />
      </Sheet>
    </View>
  );
}

/** Entry on the Profile for support admins only (replaces the inline v1 queue). */
export function OrgApprovalsEntry() {
  const { t } = useI18n();
  const router = useRouter();
  const { isAdmin, isLoading } = useIsSupportAdmin();
  const pending = useAdminOrganizations("pending", isAdmin);
  if (isLoading || !isAdmin) return null;
  const n = pending.data?.organizations.length ?? 0;
  return (
    <View className="mt-[30px] px-4">
      <Pressable
        onPress={() => router.push("/v2/support/organizations" as Href)}
        accessibilityRole="button"
        accessibilityLabel={t("supportQueue.entry")}
        className="flex-row items-center gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 active:bg-white/[0.08]"
      >
        <View className="h-10 w-10 items-center justify-center rounded-v2-md bg-v2-ink3">
          <Icon name="check" size={18} color={c.cream} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{t("supportQueue.entry")}</Text>
          <Text className="font-v2-ui text-[12.5px] text-v2-c50">{n > 0 ? t("supportQueue.entryHint", { count: n }) : t("supportQueue.entryNone")}</Text>
        </View>
        {n > 0 ? (
          <View className="min-w-[22px] items-center rounded-v2-pill bg-v2-dot px-1.5 py-[1px]">
            <Text className="font-v2-ui-bold text-[12px] text-v2-cream">{n}</Text>
          </View>
        ) : null}
        <Icon name="chev" size={16} color={c.c50} />
      </Pressable>
    </View>
  );
}
