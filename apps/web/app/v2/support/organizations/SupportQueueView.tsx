"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { foldForSearch } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import {
  useAdminOrganizations,
  useApproveOrg,
  useDeleteOrg,
  useIsSupportAdmin,
  useRejectOrg,
  type AdminOrganization,
  type AdminOrgStatus,
} from "../../../lib/hooks/useAdminOrganizations";
import { Icon } from "../../components/Icon";
import { OrgAvatar } from "../../components/OrgAvatar";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Modal } from "../../components/Modal";

const primary =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-v2-pill bg-v2-cream px-3.5 text-[13px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-50";
const soft = "inline-flex h-9 items-center justify-center rounded-v2-pill bg-v2-ink3 px-3.5 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50";
const danger = "inline-flex h-9 items-center justify-center rounded-v2-pill px-3.5 text-[13px] font-v2-ui-semibold text-v2-errorText hover:bg-v2-ink3 disabled:opacity-50";

/** Organizer approvals for Flame support (same as the app's OrgApprovals). */
export default function SupportQueueView() {
  const { t } = useI18n();
  const router = useRouter();
  const { isAdmin, isLoading } = useIsSupportAdmin();
  const [tab, setTab] = useState<AdminOrgStatus>("pending");
  const [search, setSearch] = useState("");
  const pending = useAdminOrganizations("pending", isAdmin);
  const rejected = useAdminOrganizations("rejected", isAdmin);
  const current = tab === "pending" ? pending : rejected;
  const orgs = current.data?.organizations ?? [];
  const q = foldForSearch(search.trim());
  const shown = q ? orgs.filter((o) => foldForSearch(`${o.name} ${o.owner_email ?? ""} ${o.owner_name ?? ""}`).includes(q)) : orgs;

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#161616] bg-v2-ink/90 px-4 backdrop-blur lg:px-10">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("common.back")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-v2-c70 hover:bg-v2-ink3 hover:text-v2-cream"
        >
          <Icon name="back" size={20} />
        </button>
        <h1 className="flex-1 truncate font-v2-display-bold text-[20px] tracking-[-0.03em]">{t("supportQueue.title")}</h1>
      </header>
      <main className="mx-auto max-w-[760px] px-4 pb-24 pt-6 lg:pt-10">
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-v2-card bg-v2-ink2" />
        ) : !isAdmin ? (
          <p className="rounded-v2-card bg-v2-ink2 px-4 py-10 text-center text-[14px] text-v2-c70">{t("supportQueue.notAdmin")}</p>
        ) : (
          <>
            <p className="mb-5 text-[14px] text-v2-c70">{t("supportQueue.lede")}</p>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2" role="tablist">
                {(["pending", "rejected"] as const).map((k) => {
                  const on = tab === k;
                  const n = (k === "pending" ? pending : rejected).data?.organizations.length;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setTab(k)}
                      className={`inline-flex h-9 items-center gap-2 rounded-v2-pill px-4 text-[13px] font-v2-ui-semibold ${on ? "bg-v2-cream text-v2-ink" : "bg-v2-ink3 text-v2-c70 hover:text-v2-cream"}`}
                    >
                      {t(`supportQueue.${k}`)}
                      {n !== undefined && <span className={on ? "text-v2-ink/50" : "text-v2-c50"}>{n}</span>}
                    </button>
                  );
                })}
              </div>
              {orgs.length > 4 && (
                <label className="flex h-10 items-center gap-2 rounded-v2-pill bg-v2-ink2 px-4 sm:w-[280px]">
                  <Icon name="search" size={16} className="text-v2-c50" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("supportQueue.search")}
                    aria-label={t("supportQueue.search")}
                    className="min-w-0 flex-1 bg-transparent text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none"
                  />
                </label>
              )}
            </div>
            {current.isLoading ? (
              <div className="h-32 animate-pulse rounded-v2-card bg-v2-ink2" />
            ) : current.isError ? (
              <p className="rounded-v2-card bg-v2-ink2 p-4 text-[13.5px] text-v2-errorText">{t("supportQueue.loadError")}</p>
            ) : shown.length === 0 ? (
              <p className="rounded-v2-card bg-v2-ink2 px-4 py-10 text-center text-[14px] text-v2-c50">
                {orgs.length === 0 ? (tab === "pending" ? t("supportQueue.emptyPending") : t("supportQueue.emptyRejected")) : t("supportQueue.noMatch")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {shown.map((o) => (
                  <OrgCard key={o.id} org={o} status={tab} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
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
  const error = (approve.error || reject.error || del.error)?.message;
  let created = "";
  try {
    created = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(org.created_at));
  } catch {
    created = org.created_at.slice(0, 10);
  }
  return (
    <li className="flex flex-col gap-3 rounded-v2-card bg-v2-ink2 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <OrgAvatar name={org.name} logoUrl={null} size={44} />
        <div className="min-w-0">
          <b className="block truncate text-[15px] font-v2-ui-semibold">{org.name}</b>
          <small className="block truncate text-[12.5px] text-v2-c70">
            {org.owner_email ?? t("supportQueue.noOwnerEmail")}
            {org.owner_name ? ` · ${org.owner_name}` : ""}
          </small>
          <small className="block text-[12px] text-v2-c50">{t("supportQueue.created", { date: created })}</small>
          {status === "rejected" && org.rejection_reason && <small className="mt-1 block text-[12.5px] text-v2-warn">{t("supportQueue.reason", { reason: org.rejection_reason })}</small>}
          {error && (
            <p role="alert" className="mt-1 text-[12.5px] text-v2-errorText">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={danger} disabled={busy} onClick={() => setAsk("delete")} aria-label={`${t("supportQueue.delete")} ${org.name}`}>
          {t("supportQueue.delete")}
        </button>
        {status === "pending" && (
          <button type="button" className={soft} disabled={busy} onClick={() => setAsk("reject")} aria-label={`${t("supportQueue.reject")} ${org.name}`}>
            {t("supportQueue.reject")}
          </button>
        )}
        <button type="button" className={primary} disabled={busy} onClick={() => setAsk("approve")} aria-label={`${t("supportQueue.approve")} ${org.name}`}>
          <Icon name="check" size={14} strokeWidth={2.4} />
          {t("supportQueue.approve")}
        </button>
      </div>

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
      {ask === "reject" && (
        <Modal
          open
          title={t("supportQueue.rejectTitle", { name: org.name })}
          onClose={() => setAsk(null)}
          footer={
            <>
              <button type="button" className={soft} onClick={() => setAsk(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={primary}
                disabled={busy}
                onClick={() =>
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
              >
                {t("supportQueue.reject")}
              </button>
            </>
          }
        >
          <label htmlFor={`rj-${org.id}`} className="mb-1.5 block text-[12.5px] text-v2-c70">
            {t("supportQueue.reasonLabel")}
          </label>
          <input
            id={`rj-${org.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("supportQueue.reasonPlaceholder")}
            className="h-11 w-full rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30"
          />
        </Modal>
      )}
    </li>
  );
}
