"use client";

import { useState } from "react";
import {
  formatCentsAsPrice,
  promoterLeaderboard,
  promoterLinkUrl,
  validatePromoterCode,
  type PromoterLinkRow,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../../lib/i18n";
import { Icon } from "../../../../components/Icon";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { apiErrorMessage } from "../../../../lib/api-error";

/**
 * Promoter links: same flow and endpoints as v1 (code + optional name → generate; copy; delete),
 * as a leaderboard, with the API's validation up front and a confirmation before deleting.
 */
export default function PromotersTab({
  event,
  canEdit,
  onChanged,
}: {
  event: OrganizerEvent;
  canEdit: boolean;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t } = useI18n();
  const links = promoterLeaderboard((event.promoter_links ?? []) as PromoterLinkRow[]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PromoterLinkRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const currency = event.currency ?? "USD";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const v = validatePromoterCode(code, links.map((l) => l.promoter_code));
    if (v.error) return setError(t(`eventAdmin.codeErrors.${v.error}`));
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/organizer/promoter-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, promoter_code: v.code, promoter_name: name.trim() || null }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, t("errors.generic")));
      setCode("");
      setName("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/organizer/promoter-links/${toDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, t("errors.generic")));
      setToDelete(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function copy(link: PromoterLinkRow) {
    const url = promoterLinkUrl(origin, event.slug, link.promoter_code);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(link.id);
    setTimeout(() => setCopied((c) => (c === link.id ? null : c)), 1800);
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <form onSubmit={create} className="rounded-v2-card bg-v2-ink2 p-4 sm:p-5">
          <h3 className="mb-3 font-v2-ui-semibold text-[15px]">{t("eventAdmin.promoters.create")}</h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("eventAdmin.promoters.code")}
              maxLength={50}
              className="h-11 rounded-v2-md bg-v2-ink3 px-4 text-[14px] uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30 sm:w-48"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("eventAdmin.promoters.name")}
              className="h-11 w-full rounded-v2-md bg-v2-ink3 px-4 sm:w-auto sm:flex-1 text-[14px] placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30"
            />
            <button
              type="submit"
              disabled={saving || !code.trim()}
              className="h-11 rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink disabled:opacity-50"
            >
              {t("eventAdmin.promoters.generate")}
            </button>
          </div>
          {error && <p className="mt-2 text-[13px] text-v2-errorText">{error}</p>}
        </form>
      )}

      <div className="overflow-hidden rounded-v2-card bg-v2-ink2">
        {links.length === 0 ? (
          <p className="px-4 py-12 text-center text-[14px] text-v2-c50">{t("eventAdmin.promoters.none")}</p>
        ) : (
          <ul>
            {links.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 border-b border-v2-c06 px-4 py-3 last:border-0">
                <span className="w-6 shrink-0 text-center font-v2-display-bold text-[15px] text-v2-c50 tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-v2-ui-semibold text-[14px] tracking-wide">{l.promoter_code}</span>
                  <span className="block truncate text-[12px] text-v2-c50">
                    {l.promoter_name ? `${l.promoter_name} · ` : ""}/events/{event.slug}?promoter={l.promoter_code}
                  </span>
                </span>
                <span className="text-right text-[13px] tabular-nums">
                  <span className="block font-v2-ui-semibold">{formatCentsAsPrice(l.total_revenue_cents || 0, currency)}</span>
                  <span className="text-v2-c50">{t("tickets.count", { count: l.total_tickets_sold || 0 })}</span>
                </span>
                <button
                  type="button"
                  onClick={() => copy(l)}
                  aria-label={t("eventAdmin.promoters.copy")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-v2-pill bg-v2-ink3 px-3 text-[12px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
                >
                  <Icon name={copied === l.id ? "check" : "copy"} size={14} />
                  <span className="hidden sm:inline">
                    {copied === l.id ? t("eventAdmin.promoters.copied") : t("eventAdmin.promoters.copy")}
                  </span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setToDelete(l)}
                    aria-label={t("common.delete")}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-v2-pill text-v2-c50 hover:bg-v2-ink3 hover:text-v2-cream"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        busy={deleting}
        message={t("eventAdmin.promoters.confirmDelete", { code: toDelete?.promoter_code ?? "" })}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
