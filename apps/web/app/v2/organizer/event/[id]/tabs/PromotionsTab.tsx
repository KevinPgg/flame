"use client";

import { useState } from "react";
import {
  PROMO_DISCOUNT_OPTIONS,
  promoCodeStatus,
  validatePromoCode,
  type PromoCodeRow,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../../lib/i18n";
import { Icon } from "../../../../components/Icon";
import { StatusTag } from "../../../../components/StatusTag";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { apiErrorMessage } from "../../../../lib/api-error";

/**
 * Discount codes: each code is a card with its usage bar and Active / Used up status;
 * "Add code" is a small validated form; deleting asks first (v1: a tiny x).
 * Same endpoints and rules as v1 / the API.
 */
export default function PromotionsTab({
  event,
  canEdit,
  onChanged,
}: {
  event: OrganizerEvent;
  canEdit: boolean;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t } = useI18n();
  const codes = (event.promotional_codes ?? []) as PromoCodeRow[];
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("10");
  const [limit, setLimit] = useState("50");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PromoCodeRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const v = validatePromoCode(code, codes.map((c) => c.code));
    if (v.error) return setError(t(`eventAdmin.codeErrors.${v.error}`));
    const usageLimit = Number.parseInt(limit, 10);
    if (!Number.isFinite(usageLimit) || usageLimit < 1) return setError(t("eventAdmin.promotions.limitInvalid"));
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/organizer/promotional-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id,
          code: v.code,
          discount_percentage: Number.parseInt(discount, 10),
          usage_limit: usageLimit,
        }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, t("errors.generic")));
      setCode("");
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
      const res = await fetch(`/api/organizer/promotional-codes/${toDelete.id}`, { method: "DELETE" });
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

  const field = "h-11 rounded-v2-md bg-v2-ink3 px-4 text-[14px] placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30";

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <form onSubmit={create} className="rounded-v2-card bg-v2-ink2 p-4 sm:p-5">
          <h3 className="mb-3 font-v2-ui-semibold text-[15px]">{t("eventAdmin.promotions.add")}</h3>
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_140px_auto] sm:items-end">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("eventAdmin.promotions.code")}
              maxLength={20}
              aria-label={t("eventAdmin.promotions.code")}
              className={`${field} uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal`}
            />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.04em] text-v2-c50 sm:sr-only">{t("eventAdmin.promotions.discount")}</span>
              <select
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                aria-label={t("eventAdmin.promotions.discount")}
                className={field}
              >
                {PROMO_DISCOUNT_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}%
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.04em] text-v2-c50 sm:sr-only">{t("eventAdmin.promotions.limit")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                aria-label={t("eventAdmin.promotions.limit")}
                placeholder={t("eventAdmin.promotions.limit")}
                className={field}
              />
            </label>
            <button
              type="submit"
              disabled={saving || !code.trim()}
              className="h-11 rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink disabled:opacity-50"
            >
              {t("eventAdmin.promotions.add")}
            </button>
          </div>
          {error && <p className="mt-2 text-[13px] text-v2-errorText">{error}</p>}
        </form>
      )}

      {codes.length === 0 ? (
        <p className="rounded-v2-card bg-v2-ink2 px-4 py-12 text-center text-[14px] text-v2-c50">{t("eventAdmin.promotions.none")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {codes.map((c) => {
            const s = promoCodeStatus(c);
            return (
              <article key={c.id} className="rounded-v2-card bg-v2-ink2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-v2-display-bold text-[18px] tracking-wide">{c.code}</div>
                    <div className="text-[13px] text-v2-c70">−{c.discount_percentage}%</div>
                  </div>
                  <StatusTag tone={s.active ? "good" : "neutral"}>
                    {s.active ? t("eventAdmin.promotions.active") : t("eventAdmin.promotions.usedUp")}
                  </StatusTag>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-v2-ink4" aria-hidden>
                  <div className="h-full rounded-full bg-v2-flame" style={{ width: `${Math.round(s.ratio * 100)}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px] text-v2-c50 tabular-nums">
                  <span>{t("eventAdmin.promotions.usedOf", { used: s.used, limit: s.limit })}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setToDelete(c)}
                      aria-label={t("common.delete")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-v2-pill hover:bg-v2-ink3 hover:text-v2-cream"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        busy={deleting}
        message={t("eventAdmin.promotions.confirmDelete", { code: toDelete?.code ?? "" })}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
