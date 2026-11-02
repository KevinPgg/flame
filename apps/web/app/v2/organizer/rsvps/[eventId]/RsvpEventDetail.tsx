"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RSVP_TABS,
  approveAllPlan,
  canDecideRsvp,
  defaultRsvpTab,
  filterRsvps,
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
  type OrgMemberRole,
  type OrganizerRsvp,
  type RegistrationField,
  type RsvpTab,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../lib/i18n";
import { Icon } from "../../../components/Icon";
import { StatusTag } from "../../../components/StatusTag";
import { Flyer } from "../../../components/Flyer";
import { Skeleton } from "../../../components/Skeleton";
import { ErrorBox } from "../../../components/ErrorBox";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { apiErrorMessage } from "../../../lib/api-error";
import { routes } from "../../../lib/routes";
import { OrganizerShell, type ShellUser } from "../../OrganizerShell";
import { useOrganizerModel, type Org } from "../../useOrganizerModel";
import { exportPendingRsvps } from "./exportPending";

type RsvpData = { rsvps: OrganizerRsvp[]; registration_form_config: RegistrationField[] | null };
type Pending = { kind: "one"; action: "approve" | "reject"; rsvp: OrganizerRsvp } | { kind: "all" };
type Outcome = "ok" | "already" | { error: string };

/** Approving charges the card: the server captures the authorized payment (v1 flow, same endpoint). */
async function decide(rsvpId: string, action: "approve" | "reject", generic: string): Promise<Outcome> {
  const res = await fetch(`/api/organizer/rsvps/${encodeURIComponent(rsvpId)}/${action}`, { method: "PATCH" });
  if (res.status === 409) return "already";
  if (!res.ok) return { error: await apiErrorMessage(res, generic) };
  return "ok";
}

/**
 * RSVP management, step 2 (prototype "ow:rsvp"): one event's requests in tabs All / Pending /
 * Approved / Rejected with counts; approve or reject in the row after a confirmation that says
 * what happens (card charged / hold released); approve all with progress; registration details.
 */
export default function RsvpEventDetail({
  eventId,
  organization,
  organizations,
  role,
  me = null,
}: {
  eventId: string;
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  me?: ShellUser | null;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { data, model, loading: modelLoading } = useOrganizerModel(organization, role);
  const queryKey = useMemo(() => ["rsvps-poll", eventId], [eventId]);

  // Same key, endpoint and 15 s polling as v1 → one cache for both versions.
  const rsvpsQuery = useQuery<RsvpData, Error & { status?: number }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/organizer/rsvps?event_id=${encodeURIComponent(eventId)}`);
      if (!res.ok) {
        const err = new Error(await apiErrorMessage(res, t("errors.generic"))) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    refetchInterval: 15_000,
    staleTime: 15_000,
    retry: (count, err) => (err.status ?? 500) >= 500 && count < 2,
  });

  const event = useMemo(() => {
    if (!data) return null;
    const own = data.events?.find((e) => e.id === eventId);
    if (own) return own;
    return (data.cohost_events?.find((c) => c.event.id === eventId)?.event as OrganizerEvent | undefined) ?? null;
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
  const money = (c: number) => formatCentsAsPrice(c, currency);
  const tz = event?.timezone ?? null;

  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);
  const [viewing, setViewing] = useState<OrganizerRsvp | null>(null);
  const [exporting, setExporting] = useState(false);

  const markLocally = (id: string, status: string) =>
    queryClient.setQueryData<RsvpData>(queryKey, (old) =>
      old ? { ...old, rsvps: old.rsvps.map((r) => (r.id === id ? { ...r, status } : r)) } : old
    );
  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["organizer-data"], exact: false });
  };

  async function runOne(rsvp: OrganizerRsvp, action: "approve" | "reject") {
    setBusyId(rsvp.id);
    setNotice(null);
    setError(null);
    const out = await decide(rsvp.id, action, t("errors.generic"));
    const name = rsvpGuestName(rsvp.users);
    if (out === "ok") {
      markLocally(rsvp.id, action === "approve" ? "approved" : "rejected");
      setNotice(action === "approve" ? t("rsvps.approvedOk", { name }) : t("rsvps.rejectedOk", { name }));
    } else if (out === "already") {
      setNotice(t("rsvps.alreadyProcessed"));
    } else {
      setError(out.error);
    }
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
    const failed: string[] = [];
    // One at a time: each approval captures a payment; the server guards double processing (409).
    for (const [i, rsvp] of plan.rsvps.entries()) {
      if (stopRef.current) break;
      setBusyId(rsvp.id);
      const out = await decide(rsvp.id, "approve", t("errors.generic"));
      if (out === "ok") {
        ok++;
        markLocally(rsvp.id, "approved");
      } else if (out === "already") skipped++;
      else failed.push(rsvpGuestName(rsvp.users));
      setProgress({ done: i + 1, total: plan.count });
    }
    setBusyId(null);
    setProgress(null);
    setNotice(
      [t("rsvps.bulkDone", { count: ok }), skipped ? t("rsvps.bulkSkipped", { count: skipped }) : null].filter(Boolean).join(" · ")
    );
    if (failed.length) setError(t("rsvps.bulkFailed", { names: failed.join(", ") }));
    refreshAll();
  }

  function onConfirm() {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "all") void runAll();
    else void runOne(c.rsvp, c.action);
  }

  async function onExport() {
    if (!event) return;
    setExporting(true);
    try {
      await exportPendingRsvps(event);
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
        detail: plan.paidCount
          ? t("rsvps.confirmApproveAllPaid", { paid: plan.paidCount, amount: money(plan.totalCents) })
          : t("rsvps.confirmApproveAllFree"),
        label: t("rsvps.approveAll"),
      };
    }
    const r = confirm.rsvp;
    const name = rsvpGuestName(r.users);
    if (confirm.action === "reject")
      return { message: t("rsvps.confirmReject", { name }), detail: t("rsvps.confirmRejectBody"), label: t("rsvps.reject") };
    const amount = rsvpAmountCents(r);
    return {
      message: t("rsvps.confirmApprove", {
        name,
        tickets: t("tickets.count", { count: r.requested_quantity }),
        ticket: rsvpTicketLabel(r),
      }),
      detail: amount > 0 ? t("rsvps.confirmApprovePaid", { amount: money(amount) }) : t("rsvps.confirmApproveFree"),
      label: t("rsvps.approve"),
    };
  })();

  const when = event ? formatEventDateTime(event.starts_at, tz, locale) : null;
  const noAccess = rsvpsQuery.error?.status === 403 || (!modelLoading && data && !event);
  const working = busyId !== null || progress !== null;

  return (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      activeEventId={eventId}
      section="rsvps"
      title={event?.name ?? t("rsvps.title")}
      backHref={routes.rsvps(organization.slug)}
      crumbs={[
        { label: organization.name, href: routes.dashboard(organization.slug) },
        { label: t("rsvps.title"), href: routes.rsvps(organization.slug) },
      ]}
      me={me}
    >
      <section className="mx-auto max-w-[1120px] px-4 pt-5 lg:px-10 lg:pt-8">

        <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {event ? (
            <>
              <Flyer src={event.image_url} size={72} className="!rounded-v2-md" />
              <div className="min-w-0 flex-1">
                <h2 className="font-v2-display-bold text-[26px] leading-[1.05] tracking-[-0.03em] lg:text-[30px]">{event.name}</h2>
                <p className="mt-1.5 text-[13px] text-v2-c70">
                  {when?.date} · {when?.time}
                  {event.venue || event.city ? ` · ${[event.venue, event.city].filter(Boolean).join(", ")}` : ""}
                </p>
              </div>
              {counts.pending > 0 && (
                <button
                  type="button"
                  onClick={() => void onExport()}
                  disabled={exporting}
                  className="inline-flex h-10 items-center gap-2 self-start rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50 sm:self-auto"
                >
                  <Icon name="download" size={15} />
                  {exporting ? t("rsvps.exporting") : t("rsvps.export")}
                </button>
              )}
            </>
          ) : noAccess ? null : (
            <>
              <Skeleton className="h-[72px] w-[72px] !rounded-v2-md" />
              <div className="flex-1">
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/3" />
              </div>
            </>
          )}
        </header>

        {noAccess ? (
          <div className="mt-6">
            <ErrorBox message={t("rsvps.noAccess")} />
          </div>
        ) : rsvpsQuery.isError ? (
          <div className="mt-6">
            <ErrorBox onRetry={() => void rsvpsQuery.refetch()} message={rsvpsQuery.error.message} />
          </div>
        ) : (
          <>
            {ended && <p className="mt-5 rounded-v2-card bg-v2-ink2 p-4 text-[13px] text-v2-c70">{t("rsvps.ended")}</p>}

            <div className="sticky top-0 z-10 -mx-4 mt-5 border-b border-v2-c10 bg-black/85 px-4 backdrop-blur-xl lg:-mx-10 lg:px-10">
              <div className="flex gap-1 overflow-x-auto" role="tablist">
                {RSVP_TABS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === k}
                    onClick={() => setTab(k)}
                    className={`relative inline-flex h-12 shrink-0 items-center gap-2 px-3 text-[14px] font-v2-ui-semibold ${
                      activeTab === k ? "text-v2-cream" : "text-v2-c50 hover:text-v2-c90"
                    }`}
                  >
                    {t(`rsvps.tabs.${k}`)}
                    <span className="rounded-v2-pill bg-v2-ink3 px-1.5 text-[11px] tabular-nums text-v2-c70">{rsvpsQuery.data ? counts[k] : "–"}</span>
                    {activeTab === k && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-v2-flame" />}
                  </button>
                ))}
              </div>
            </div>

            {(notice || error || progress) && (
              <div className="mt-4 flex flex-col gap-2">
                {progress && (
                  <p role="status" className="flex items-center justify-between gap-3 rounded-v2-card bg-v2-ink2 px-4 py-3 text-[14px]">
                    <span>{t("rsvps.approving", { done: progress.done, total: progress.total })}</span>
                    <button
                      type="button"
                      onClick={() => (stopRef.current = true)}
                      className="h-8 rounded-v2-pill bg-v2-ink4 px-3 text-[12px] font-v2-ui-semibold"
                    >
                      {t("rsvps.stop")}
                    </button>
                  </p>
                )}
                {notice && !progress && (
                  <p role="status" className="flex items-center gap-2 rounded-v2-card bg-v2-good/15 px-4 py-3 text-[14px] text-v2-good">
                    <Icon name="check" size={16} strokeWidth={2.4} />
                    {notice}
                  </p>
                )}
                {error && <p className="rounded-v2-card bg-v2-flame/25 px-4 py-3 text-[14px] text-v2-errorText">{error}</p>}
              </div>
            )}

            {activeTab === "pending" && decidable.length > 1 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[13px] text-v2-c70">{t("rsvps.waiting", { count: decidable.length })}</span>
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setConfirm({ kind: "all" })}
                  className="inline-flex h-9 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink disabled:opacity-50"
                >
                  <Icon name="check" size={14} strokeWidth={2.4} />
                  {t("rsvps.approveAll")}
                </button>
              </div>
            )}

            <div className="mt-4">
              {!rsvpsQuery.data ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-[72px] w-full !rounded-v2-card" />
                  ))}
                </div>
              ) : list.length === 0 ? (
                <div className="rounded-v2-card bg-v2-ink2 px-4 py-12 text-center">
                  {activeTab === "pending" && <p className="mb-1 font-v2-display-bold text-[18px]">{t("rsvps.allDone")}</p>}
                  <p className="text-[14px] text-v2-c50">{t(`rsvps.empty.${activeTab}`)}</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-v2-card bg-v2-ink2">
                  <div className="hidden grid-cols-[minmax(0,2fr)_120px_minmax(0,1.4fr)_110px_220px] gap-4 border-b border-v2-c10 px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-v2-c50 lg:grid">
                    <span>{t("rsvps.colGuest")}</span>
                    <span>{t("rsvps.colStatus")}</span>
                    <span>{t("rsvps.colTicket")}</span>
                    <span className="text-right">{t("rsvps.colAmount")}</span>
                    <span className="text-right">{t("rsvps.colActions")}</span>
                  </div>
                  <ul>
                    {list.map((r) => {
                      const name = rsvpGuestName(r.users);
                      const cedula = formatCedula(r.users.document_id ?? null);
                      const requested = formatEventDateTime(r.requested_at, tz, locale);
                      const canAct = event ? canDecideRsvp(r, event.ends_at) : false;
                      return (
                        <li
                          key={r.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-b border-v2-c06 px-4 py-3 last:border-0 lg:grid-cols-[minmax(0,2fr)_120px_minmax(0,1.4fr)_110px_220px] lg:items-center"
                        >
                          <div className="min-w-0">
                            <b className="block truncate text-[14px] font-v2-ui-semibold">{name}</b>
                            <small className="block truncate text-[12px] text-v2-c50">
                              {cedula ? t("rsvps.idLabel", { id: cedula }) : t("rsvps.noId")} · {requested.date}
                            </small>
                          </div>
                          <div className="justify-self-end lg:justify-self-start">
                            <StatusPill status={r.status} />
                          </div>
                          <div className="min-w-0 text-[13px]">
                            <span className="block truncate">{rsvpTicketLabel(r)}</span>
                            <small className="text-[12px] text-v2-c50">{t("tickets.count", { count: r.requested_quantity })}</small>
                          </div>
                          <b className="justify-self-end text-[14px] font-v2-ui-semibold tabular-nums">{money(rsvpAmountCents(r))}</b>
                          <div className="col-span-2 flex justify-end gap-2 lg:col-span-1">
                            {canAct && (
                              <>
                                <button
                                  type="button"
                                  disabled={working}
                                  onClick={() => setConfirm({ kind: "one", action: "reject", rsvp: r })}
                                  className="h-9 rounded-v2-pill bg-v2-ink3 px-3.5 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50"
                                >
                                  {busyId === r.id ? "…" : t("rsvps.reject")}
                                </button>
                                <button
                                  type="button"
                                  disabled={working}
                                  onClick={() => setConfirm({ kind: "one", action: "approve", rsvp: r })}
                                  className="h-9 rounded-v2-pill bg-v2-cream px-3.5 text-[13px] font-v2-ui-semibold text-v2-ink disabled:opacity-50"
                                >
                                  {busyId === r.id ? "…" : t("rsvps.approve")}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => setViewing(r)}
                              aria-label={t("rsvps.view")}
                              title={t("rsvps.view")}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-v2-pill text-v2-c70 hover:bg-v2-ink3 hover:text-v2-cream"
                            >
                              <Icon name="rsvp" size={16} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirm !== null}
        message={confirmText.message}
        detail={confirmText.detail}
        confirmLabel={confirmText.label}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
      <RegistrationDialog
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

function RegistrationDialog({
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (rsvp && !d.open) d.showModal();
    if (!rsvp && d.open) d.close();
  }, [rsvp]);
  const form = rsvp ? registrationEntries(config, rsvp.registration_data ?? null) : null;
  const cedula = rsvp ? formatCedula(rsvp.users.document_id ?? null) : null;
  return (
    <dialog
      ref={ref}
      aria-label={t("rsvps.details")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[85vh] w-[min(92vw,480px)] overflow-y-auto rounded-v2-card bg-v2-ink2 p-5 text-v2-cream backdrop:bg-black/70"
    >
      {rsvp && form && (
        <>
          <h2 className="mb-4 font-v2-display-bold text-[20px]">{t("rsvps.details")}</h2>
          <div className="mb-4 flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[15px] font-v2-ui-semibold">{rsvpGuestName(rsvp.users)}</b>
              <small className="block truncate text-[12.5px] text-v2-c50">
                {rsvp.users.email} · {cedula ? t("rsvps.idLabel", { id: cedula }) : t("rsvps.noId")}
              </small>
            </span>
            <StatusPill status={rsvp.status} />
          </div>
          <dl className="divide-y divide-v2-c10 rounded-v2-md bg-v2-ink3 px-4 text-[14px]">
            <Row label={t("rsvps.ticket")} value={`${t("tickets.count", { count: rsvp.requested_quantity })} · ${rsvpTicketLabel(rsvp)}`} />
            <Row label={t("rsvps.amount")} value={amount} />
            {requested && <Row label={t("rsvps.requested")} value={`${requested.date} · ${requested.time}`} />}
            {rsvp.users.date_of_birth && <Row label={t("rsvps.dob")} value={rsvp.users.date_of_birth} />}
          </dl>
          <h3 className="mb-2 mt-5 text-[11px] uppercase tracking-[0.06em] text-v2-c50">{t("rsvps.form")}</h3>
          {form.entries.length === 0 ? (
            <p className="text-[13.5px] text-v2-c50">{t("rsvps.noForm")}</p>
          ) : (
            <>
              {!form.fromConfig && <p className="mb-2 text-[12.5px] text-v2-c50">{t("rsvps.rawForm")}</p>}
              <dl className="divide-y divide-v2-c10 rounded-v2-md bg-v2-ink3 px-4 text-[14px]">
                {form.entries.map((e) => (
                  <Row
                    key={e.key}
                    label={`${e.label}${e.required ? " *" : ""}${e.archived ? ` (${t("rsvps.archived")})` : ""}`}
                    value={
                      e.value.kind === "missing"
                        ? t("rsvps.notProvided")
                        : e.value.kind === "bool"
                          ? e.value.value
                            ? t("rsvps.yes")
                            : t("rsvps.no")
                          : e.value.text
                    }
                    muted={e.value.kind === "missing"}
                  />
                ))}
              </dl>
            </>
          )}
          {/* Fase 3.4: the other guests' answers, one block each. */}
          {rsvpGuestBlocks(config, rsvp.registration_data ?? null).map((b) => (
            <div key={b.guest} data-testid={`rsvp-guest-${b.guest}`}>
              <h3 className="mb-2 mt-5 text-[11px] uppercase tracking-[0.06em] text-v2-c50">{t("rsvps.guestN", { n: b.guest })}</h3>
              <dl className="divide-y divide-v2-c10 rounded-v2-md bg-v2-ink3 px-4 text-[14px]">
                {b.entries.map((e) => (
                  <Row
                    key={e.key}
                    label={e.label}
                    value={e.value.kind === "missing" ? t("rsvps.notProvided") : e.value.kind === "bool" ? (e.value.value ? t("rsvps.yes") : t("rsvps.no")) : e.value.text}
                    muted={e.value.kind === "missing"}
                  />
                ))}
              </dl>
            </div>
          ))}
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onClose} className="h-10 rounded-v2-pill bg-v2-ink3 px-5 text-[13px] font-v2-ui-semibold">
              {t("common.close")}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-v2-c50">{label}</dt>
      <dd className={`min-w-0 break-words text-right font-v2-ui-semibold ${muted ? "text-v2-c50" : ""}`}>{value}</dd>
    </div>
  );
}
