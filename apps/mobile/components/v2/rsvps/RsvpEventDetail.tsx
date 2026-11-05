/**
 * RSVPs, step 2 — phone view of the prototype "ow:rsvp" (same as
 * apps/web/app/v2/organizer/rsvps/[eventId]): one event's requests in tabs All / Pending /
 * Approved / Rejected with counts; approve or reject after a confirmation that says what happens
 * (card charged / hold released); approve all one by one with progress and Stop; registration
 * details in a bottom sheet; export pending to XLSX (share sheet). Web API only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RSVP_TABS,
  approveAllPlan,
  canDecideRsvp,
  defaultRsvpTab,
  filterRsvps,
  flameV2Colors as c,
  formatCedula,
  formatCentsAsPrice,
  formatEventDateTime,
  registrationEntries,
  rsvpGuestBlocks,
  rsvpAmountCents,
  rsvpGuestName,
  rsvpStatusKey,
  rsvpTabCounts,
  rsvpTicketLabel,
  type OrganizerRsvp,
  type RegistrationField,
  type RsvpTab,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient, apiGet, LONG_MUTATION_TIMEOUT_MS } from "../../../lib/api";
import { routes } from "../../../lib/v2/routes";
import { apiErrorText, type MyOrganization, type OrgEventV2 } from "../../../lib/v2/organizer-api";
import { exportPendingRsvpsXlsx } from "../../../lib/organizer-xlsx-export";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { OrganizerShell, TABBAR_SPACE } from "../OrganizerShell";
import { Button, ConfirmDialog, ErrorBox, ErrorText, Flyer, Icon, Skeleton, StatusTag, SuccessNote } from "../ui";

type RsvpData = { rsvps: OrganizerRsvp[]; registration_form_config: RegistrationField[] | null };
type Pending = { kind: "one"; action: "approve" | "reject"; rsvp: OrganizerRsvp } | { kind: "all" };
/** "unsure": no answer in time (approving captures a payment and sends email) — it may have gone through. */
type Outcome = "ok" | "already" | "unsure" | { error: string };

/**
 * Approve captures the authorized payment and emails the tickets. The server route allows up to
 * 60 s (maxDuration), so the client must wait longer than that or a slow-but-successful approval
 * is reported as failed (production W7-H5) → LONG_MUTATION_TIMEOUT_MS (75 s).
 */
const DECIDE_TIMEOUT_MS = LONG_MUTATION_TIMEOUT_MS;

export function rsvpsKey(eventId: string) {
  return ["v2", "rsvps", eventId];
}

export function RsvpEventDetail({ eventId, organization }: { eventId: string; organization: MyOrganization }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getToken } = useOptionalAuth();
  const { data, model, loading: modelLoading } = useOrganizerModel(organization);
  const queryKey = useMemo(() => rsvpsKey(eventId), [eventId]);

  // Same endpoint and 15 s polling as the web.
  const rsvpsQuery = useQuery<RsvpData, Error & { status?: number }>({
    queryKey,
    queryFn: () => apiGet<RsvpData>(`/api/organizer/rsvps?event_id=${encodeURIComponent(eventId)}`, getToken),
    refetchInterval: 15_000,
    staleTime: 15_000,
    retry: (count, err) => (err.status ?? 500) >= 500 && count < 2,
  });

  const event: OrgEventV2 | null = useMemo(() => {
    if (!data) return null;
    return data.events?.find((e) => e.id === eventId) ?? data.cohost_events?.find((x) => x.event.id === eventId)?.event ?? null;
  }, [data, eventId]);

  const rsvps = useMemo(() => rsvpsQuery.data?.rsvps ?? [], [rsvpsQuery.data]);
  const counts = rsvpTabCounts(rsvps);
  const [tab, setTab] = useState<RsvpTab | null>(null);
  useEffect(() => {
    if (tab === null && rsvpsQuery.data) setTab(defaultRsvpTab(rsvpsQuery.data.rsvps));
  }, [tab, rsvpsQuery.data]);
  const activeTab: RsvpTab = tab ?? "all";
  const list = filterRsvps(rsvps, activeTab);

  const ended = event ? new Date(event.ends_at).getTime() <= Date.now() : false;
  const decidable = event ? rsvps.filter((r) => canDecideRsvp(r, event.ends_at)) : [];
  const currency = event?.currency || "USD";
  const money = (cents: number) => formatCentsAsPrice(cents, currency);
  const tz = event?.timezone ?? null;

  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);
  const [viewing, setViewing] = useState<OrganizerRsvp | null>(null);
  const [exporting, setExporting] = useState(false);

  async function decide(rsvpId: string, action: "approve" | "reject"): Promise<Outcome> {
    try {
      await apiClient(`/api/organizer/rsvps/${encodeURIComponent(rsvpId)}/${action}`, { method: "PATCH", getToken, timeoutMs: DECIDE_TIMEOUT_MS });
      return "ok";
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 409) return "already";
      if (status === 0) return "unsure";
      return { error: apiErrorText(e, t("errors.generic")) };
    }
  }

  const markLocally = (id: string, status: string) =>
    queryClient.setQueryData<RsvpData>(queryKey, (old) => (old ? { ...old, rsvps: old.rsvps.map((r) => (r.id === id ? { ...r, status } : r)) } : old));
  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["v2", "organizer-data"] });
  };

  async function runOne(rsvp: OrganizerRsvp, action: "approve" | "reject") {
    setBusyId(rsvp.id);
    setNotice(null);
    setError(null);
    const out = await decide(rsvp.id, action);
    const name = rsvpGuestName(rsvp.users);
    if (out === "ok") {
      markLocally(rsvp.id, action === "approve" ? "approved" : "rejected");
      setNotice(action === "approve" ? t("rsvps.approvedOk", { name }) : t("rsvps.rejectedOk", { name }));
    } else if (out === "already") setNotice(t("rsvps.alreadyProcessed"));
    else if (out === "unsure") setError(t("rsvps.unsure"));
    else setError(out.error);
    setBusyId(null);
    refreshAll();
  }

  async function runAll() {
    const plan = approveAllPlan(decidable);
    stopRef.current = false;
    setNotice(null);
    setError(null);
    setProgress({ done: 0, total: plan.count });
    let ok = 0;
    let skipped = 0;
    let unsure = false;
    const failed: string[] = [];
    // One at a time: each approval captures a payment; the server guards double processing (409).
    for (const [i, rsvp] of plan.rsvps.entries()) {
      if (stopRef.current) break;
      setBusyId(rsvp.id);
      const out = await decide(rsvp.id, "approve");
      if (out === "ok") {
        ok++;
        markLocally(rsvp.id, "approved");
      } else if (out === "already") skipped++;
      else if (out === "unsure") unsure = true;
      else failed.push(rsvpGuestName(rsvp.users));
      setProgress({ done: i + 1, total: plan.count });
    }
    setBusyId(null);
    setProgress(null);
    setNotice([t("rsvps.bulkDone", { count: ok }), skipped ? t("rsvps.bulkSkipped", { count: skipped }) : null].filter(Boolean).join(" · "));
    const errors = [failed.length ? t("rsvps.bulkFailed", { names: failed.join(", ") }) : null, unsure ? t("rsvps.unsure") : null].filter(Boolean);
    if (errors.length) setError(errors.join(" "));
    refreshAll();
  }

  function onConfirm() {
    const p = confirm;
    setConfirm(null);
    if (!p) return;
    if (p.kind === "all") void runAll();
    else void runOne(p.rsvp, p.action);
  }

  /** Pending requests → XLSX with fresh data (headers and answers match the current form), like the web. */
  async function onExport() {
    if (!event) return;
    setExporting(true);
    setError(null);
    try {
      const fresh = await apiGet<RsvpData>(`/api/organizer/rsvps?event_id=${encodeURIComponent(event.id)}`, getToken);
      const pending = (fresh.rsvps ?? []).filter((r) => r.status === "pending");
      if (pending.length === 0) return;
      await exportPendingRsvpsXlsx({
        eventName: event.name,
        eventTimezone: event.timezone,
        currency,
        registrationFormConfig: fresh.registration_form_config,
        rows: pending.map((r) => ({
          personName: rsvpGuestName(r.users),
          tierExportLine: rsvpTicketLabel(r).replace(" · ", " - "),
          email: r.users.email,
          priceCents: rsvpAmountCents(r),
          requestedAtIso: r.requested_at,
          registrationData: r.registration_data ?? null,
        })),
      });
    } catch {
      setError(t("errors.generic"));
    } finally {
      setExporting(false);
    }
  }

  const confirmText = (() => {
    if (!confirm) return { message: "", detail: undefined as string | undefined, label: "" };
    if (confirm.kind === "all") {
      const plan = approveAllPlan(decidable);
      return {
        message: t("rsvps.confirmApproveAll", { count: plan.count }),
        detail: plan.paidCount ? t("rsvps.confirmApproveAllPaid", { paid: plan.paidCount, amount: money(plan.totalCents) }) : t("rsvps.confirmApproveAllFree"),
        label: t("rsvps.approveAll"),
      };
    }
    const r = confirm.rsvp;
    const name = rsvpGuestName(r.users);
    if (confirm.action === "reject") return { message: t("rsvps.confirmReject", { name }), detail: t("rsvps.confirmRejectBody"), label: t("rsvps.reject") };
    const amount = rsvpAmountCents(r);
    return {
      message: t("rsvps.confirmApprove", { name, tickets: t("tickets.count", { count: r.requested_quantity }), ticket: rsvpTicketLabel(r) }),
      detail: amount > 0 ? t("rsvps.confirmApprovePaid", { amount: money(amount) }) : t("rsvps.confirmApproveFree"),
      label: t("rsvps.approve"),
    };
  })();

  const when = event ? formatEventDateTime(event.starts_at, tz, locale) : null;
  const where = event ? [event.venue, event.city].filter(Boolean).join(", ") : "";
  const noAccess = rsvpsQuery.error?.status === 403 || (!modelLoading && !!data && !event);
  const working = busyId !== null || progress !== null;
  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.rsvps(organization) as Href));

  return (
    <OrganizerShell organization={organization} pending={model?.pending ?? 0} section="rsvps" title={event?.name ?? t("rsvps.title")} onBack={back}>
      {noAccess ? (
        <View className="px-4 pt-6">
          <ErrorBox message={t("rsvps.noAccess")} onRetry={back} retryLabel={t("common.back")} />
        </View>
      ) : (
        <ScrollView
          stickyHeaderIndices={[1]}
          contentContainerStyle={{ paddingBottom: TABBAR_SPACE + insets.bottom }}
          refreshControl={<RefreshControl refreshing={rsvpsQuery.isRefetching} onRefresh={() => void rsvpsQuery.refetch()} tintColor={c.cream} />}
        >
          {/* ---------- Event header ---------- */}
          <View className="gap-3 px-4 pt-4">
            {event ? (
              <View className="flex-row items-center gap-3">
                <Flyer src={event.image_url} size={64} radius={12} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={2} className="font-v2-display-bold text-[22px] leading-[24px] tracking-[-0.6px] text-v2-cream">{event.name}</Text>
                  <Text numberOfLines={2} className="mt-1 font-v2-ui text-[12.5px] text-v2-c70">
                    {when?.date} · {when?.time}
                    {where ? ` · ${where}` : ""}
                  </Text>
                </View>
              </View>
            ) : (
              <View className="flex-row items-center gap-3">
                <Skeleton width={64} height={64} radius={12} />
                <View className="flex-1 gap-2">
                  <Skeleton width="70%" height={20} />
                  <Skeleton width="45%" height={12} />
                </View>
              </View>
            )}
            {event && counts.pending > 0 && (
              <View className="self-start">
                <Button small icon="download" label={exporting ? t("rsvps.exporting") : t("rsvps.export")} disabled={exporting} onPress={() => void onExport()} />
              </View>
            )}
            {ended && (
              <View className="rounded-v2-card bg-v2-ink2 p-4">
                <Text className="font-v2-ui text-[13px] leading-[18px] text-v2-c70">{t("rsvps.ended")}</Text>
              </View>
            )}
          </View>

          {/* ---------- Tabs with counts (sticky) ---------- */}
          <View className="mt-3 border-b border-v2-c10 bg-v2-ink">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }} accessibilityRole="tablist">
              {RSVP_TABS.map((k) => {
                const on = activeTab === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setTab(k)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${t(`rsvps.tabs.${k}`)} ${rsvpsQuery.data ? counts[k] : ""}`.trim()}
                    className="h-12 flex-row items-center gap-2 px-3"
                  >
                    <Text className={`font-v2-ui-semibold text-[14px] ${on ? "text-v2-cream" : "text-v2-c50"}`}>{t(`rsvps.tabs.${k}`)}</Text>
                    <View className="rounded-v2-pill bg-v2-ink3 px-1.5">
                      <Text className="font-v2-ui text-[11px] text-v2-c70">{rsvpsQuery.data ? counts[k] : "–"}</Text>
                    </View>
                    {on && <View className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-v2-dot" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View className="gap-3 px-4 pt-4">
            {rsvpsQuery.isError && !rsvpsQuery.data ? (
              <ErrorBox onRetry={() => void rsvpsQuery.refetch()} message={apiErrorText(rsvpsQuery.error, t("errors.generic"))} />
            ) : (
              <>
                {progress && (
                  <View accessibilityRole="alert" className="flex-row items-center justify-between gap-3 rounded-v2-card bg-v2-ink2 px-4 py-3">
                    <Text className="flex-1 font-v2-ui text-[14px] text-v2-cream">{t("rsvps.approving", { done: progress.done, total: progress.total })}</Text>
                    <Button small label={t("rsvps.stop")} onPress={() => (stopRef.current = true)} />
                  </View>
                )}
                {notice && !progress ? <SuccessNote>{notice}</SuccessNote> : null}
                {error ? <ErrorText>{error}</ErrorText> : null}

                {activeTab === "pending" && decidable.length > 1 && (
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="flex-1 font-v2-ui text-[13px] text-v2-c70">{t("rsvps.waiting", { count: decidable.length })}</Text>
                    <Button small variant="primary" icon="check" label={t("rsvps.approveAll")} disabled={working} onPress={() => setConfirm({ kind: "all" })} />
                  </View>
                )}

                {!rsvpsQuery.data ? (
                  <View className="gap-2" accessibilityLabel={t("common.loading")}>
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} width="100%" height={92} radius={16} />
                    ))}
                  </View>
                ) : list.length === 0 ? (
                  <View className="items-center gap-1 rounded-v2-card bg-v2-ink2 px-4 py-12">
                    {activeTab === "pending" && <Text className="font-v2-display-bold text-[18px] text-v2-cream">{t("rsvps.allDone")}</Text>}
                    <Text className="text-center font-v2-ui text-[14px] text-v2-c50">{t(`rsvps.empty.${activeTab}`)}</Text>
                  </View>
                ) : (
                  <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
                    {list.map((r, i) => {
                      const name = rsvpGuestName(r.users);
                      const cedula = formatCedula(r.users.document_id ?? null);
                      const requested = formatEventDateTime(r.requested_at, tz, locale);
                      const canAct = event ? canDecideRsvp(r, event.ends_at) : false;
                      return (
                        <View key={r.id} className={`gap-2.5 px-4 py-3 ${i > 0 ? "border-t border-v2-c06" : ""}`}>
                          <View className="flex-row items-start gap-3">
                            <View className="min-w-0 flex-1">
                              <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{name}</Text>
                              <Text numberOfLines={1} className="font-v2-ui text-[12px] text-v2-c50">
                                {cedula ? t("rsvps.idLabel", { id: cedula }) : t("rsvps.noId")} · {requested.date}
                              </Text>
                            </View>
                            <StatusPill status={r.status} />
                          </View>
                          <View className="flex-row items-center gap-3">
                            <Text numberOfLines={1} className="min-w-0 flex-1 font-v2-ui text-[13px] text-v2-c90">
                              {t("tickets.count", { count: r.requested_quantity })} · {rsvpTicketLabel(r)}
                            </Text>
                            <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{money(rsvpAmountCents(r))}</Text>
                          </View>
                          <View className="flex-row items-center justify-end gap-2">
                            <Button
                              small
                              variant="ghost"
                              icon="eye"
                              label=""
                              accessibilityLabel={`${t("rsvps.view")} ${name}`}
                              onPress={() => setViewing(r)}
                            />
                            {canAct && (
                              <>
                                <Button
                                  small
                                  label={busyId === r.id ? "…" : t("rsvps.reject")}
                                  accessibilityLabel={`${t("rsvps.reject")} ${name}`}
                                  disabled={working}
                                  onPress={() => setConfirm({ kind: "one", action: "reject", rsvp: r })}
                                />
                                <Button
                                  small
                                  variant="primary"
                                  label={busyId === r.id ? "…" : t("rsvps.approve")}
                                  accessibilityLabel={`${t("rsvps.approve")} ${name}`}
                                  disabled={working}
                                  onPress={() => setConfirm({ kind: "one", action: "approve", rsvp: r })}
                                />
                              </>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
      )}

      <ConfirmDialog
        open={confirm !== null}
        message={confirmText.message}
        detail={confirmText.detail}
        confirmLabel={confirmText.label}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
      <RegistrationSheet
        rsvp={viewing}
        config={rsvpsQuery.data?.registration_form_config ?? null}
        amount={viewing ? money(rsvpAmountCents(viewing)) : ""}
        requested={viewing ? formatEventDateTime(viewing.requested_at, tz, locale) : null}
        onClose={() => setViewing(null)}
      />
    </OrganizerShell>
  );
}

function StatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const key = rsvpStatusKey(status);
  const tone = key === "pending" ? "warn" : key === "approved" || key === "purchased" ? "good" : key === "rejected" ? "danger" : "neutral";
  return <StatusTag tone={tone}>{t(`rsvps.status.${key}`)}</StatusTag>;
}

/** Registration details (prototype "regdetails") as a bottom sheet. */
function RegistrationSheet({
  rsvp,
  config,
  amount,
  requested,
  onClose,
}: {
  rsvp: OrganizerRsvp | null;
  config: RegistrationField[] | null;
  amount: string;
  requested: { date: string; time: string } | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const form = rsvp ? registrationEntries(config, rsvp.registration_data ?? null) : null;
  const cedula = rsvp ? formatCedula(rsvp.users.document_id ?? null) : null;
  return (
    <Modal visible={rsvp !== null} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} accessibilityLabel={t("common.close")} />
      <View style={{ paddingBottom: insets.bottom + 12 }} className="max-h-[85%] rounded-t-v2-sheet bg-v2-ink2 px-4 pt-3">
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-v2-c30" />
        {rsvp && form && (
          <>
            <View className="flex-row items-start justify-between gap-3">
              <Text accessibilityRole="header" className="flex-1 font-v2-display-bold text-[20px] text-v2-cream">{t("rsvps.details")}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full active:bg-v2-ink3">
                <Icon name="close" size={20} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 14, paddingTop: 10, paddingBottom: 8 }}>
              <View className="flex-row items-center gap-3">
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{rsvpGuestName(rsvp.users)}</Text>
                  <Text numberOfLines={2} className="font-v2-ui text-[12.5px] text-v2-c50">
                    {rsvp.users.email} · {cedula ? t("rsvps.idLabel", { id: cedula }) : t("rsvps.noId")}
                  </Text>
                </View>
                <StatusPill status={rsvp.status} />
              </View>
              <View className="rounded-v2-md bg-v2-ink3 px-4">
                <Row first label={t("rsvps.ticket")} value={`${t("tickets.count", { count: rsvp.requested_quantity })} · ${rsvpTicketLabel(rsvp)}`} />
                <Row label={t("rsvps.amount")} value={amount} />
                {requested && <Row label={t("rsvps.requested")} value={`${requested.date} · ${requested.time}`} />}
                {rsvp.users.date_of_birth ? <Row label={t("rsvps.dob")} value={rsvp.users.date_of_birth} /> : null}
              </View>
              <Text className="font-v2-ui-semibold text-[11px] uppercase tracking-[0.6px] text-v2-c50">{t("rsvps.form")}</Text>
              {form.entries.length === 0 ? (
                <Text className="font-v2-ui text-[13.5px] text-v2-c50">{t("rsvps.noForm")}</Text>
              ) : (
                <View className="gap-2">
                  {!form.fromConfig && <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("rsvps.rawForm")}</Text>}
                  <View className="rounded-v2-md bg-v2-ink3 px-4">
                    {form.entries.map((e, i) => (
                      <Row
                        key={e.key}
                        first={i === 0}
                        label={`${e.label}${e.required ? " *" : ""}${e.archived ? ` (${t("rsvps.archived")})` : ""}`}
                        value={e.value.kind === "missing" ? t("rsvps.notProvided") : e.value.kind === "bool" ? (e.value.value ? t("rsvps.yes") : t("rsvps.no")) : e.value.text}
                        muted={e.value.kind === "missing"}
                      />
                    ))}
                  </View>
                </View>
              )}
              {/* Fase 3.4: the other guests' answers, one block each. */}
              {rsvpGuestBlocks(config, rsvp.registration_data ?? null).map((b) => (
                <View key={b.guest} className="gap-2" testID={`rsvp-guest-${b.guest}`}>
                  <Text className="font-v2-ui-semibold text-[11px] uppercase tracking-[0.6px] text-v2-c50">{t("rsvps.guestN", { n: b.guest })}</Text>
                  <View className="rounded-v2-md bg-v2-ink3 px-4">
                    {b.entries.map((e, i) => (
                      <Row
                        key={e.key}
                        first={i === 0}
                        label={e.label}
                        value={e.value.kind === "missing" ? t("rsvps.notProvided") : e.value.kind === "bool" ? (e.value.value ? t("rsvps.yes") : t("rsvps.no")) : e.value.text}
                        muted={e.value.kind === "missing"}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

function Row({ label, value, muted, first }: { label: string; value: string; muted?: boolean; first?: boolean }) {
  return (
    <View className={`flex-row justify-between gap-4 py-2.5 ${first ? "" : "border-t border-v2-c10"}`}>
      <Text className="font-v2-ui text-[14px] text-v2-c50">{label}</Text>
      <Text className={`min-w-0 flex-1 text-right font-v2-ui-semibold text-[14px] ${muted ? "text-v2-c50" : "text-v2-cream"}`}>{value}</Text>
    </View>
  );
}
