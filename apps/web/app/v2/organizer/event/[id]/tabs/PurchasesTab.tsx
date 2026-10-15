"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  buildPurchaseExportAoa,
  formatCentsAsPrice,
  formatEventDateTime,
  normalizeRegistrationExportColumns,
  purchaseExportColumnWidths,
  registrationValuesForExportColumns,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import type { Purchase } from "../../../../../lib/utils/purchase-data";
import { useI18n } from "../../../../../lib/i18n";
import { Icon } from "../../../../components/Icon";

/**
 * Purchases as a real table (buyer, tier, qty, scanned, amount, date) + Export XLSX.
 * Same list as v1 (card purchases; bank transfers live in Breakdown / Send tickets) and the
 * same XLSX builder from @project-flame/lib, fed with fresh data like v1.
 */
export default function PurchasesTab({
  event,
  purchases,
  slug,
}: {
  event: OrganizerEvent;
  purchases: Purchase[];
  slug: string;
}) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = event.currency ?? "USD";

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sorted = [...purchases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!needle) return sorted;
    return sorted.filter((p) =>
      [p.userName, p.email, p.tierName, p.stageName ?? ""].some((v) => v.toLowerCase().includes(needle))
    );
  }, [purchases, q]);

  async function exportXlsx() {
    setExporting(true);
    setError(null);
    try {
      // Fresh data, not the polled cache (v1 does the same so registration columns are current).
      const res = await fetch(`/api/organizer/data?org=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch");
      const fresh = await res.json();
      const freshEvent = (fresh?.events ?? []).find((e: { id: string }) => e.id === event.id) as
        | (OrganizerEvent & { purchases?: Purchase[] })
        | undefined;
      if (!freshEvent) throw new Error("event");
      const tz = (freshEvent.timezone ?? event.timezone ?? "").trim();
      const fmt = (d: string) => {
        try {
          return new Date(d).toLocaleString("en-US", tz ? { timeZone: tz } : undefined);
        } catch {
          return new Date(d).toLocaleString("en-US");
        }
      };
      const columns = normalizeRegistrationExportColumns(
        freshEvent.registration_form_config ?? event.registration_form_config ?? undefined
      );
      const list = [...(freshEvent.purchases ?? [])].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const name = freshEvent.name || event.name;
      const aoa = buildPurchaseExportAoa(
        name,
        list.map((p) => ({
          customer: p.userName,
          email: p.email || "",
          tier: p.tierName + (p.stageName ? ` - ${p.stageName}` : ""),
          quantity: p.quantity,
          purchasedAt: fmt(p.createdAt),
          totalCost: formatCentsAsPrice(p.basePrice, freshEvent.currency || currency),
          ...(columns.length > 0 && {
            registrationValues: registrationValuesForExportColumns(columns, p.registrationData ?? null),
          }),
        })),
        columns.length > 0 ? columns : undefined
      );
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = purchaseExportColumnWidths(columns.length > 0 ? columns : undefined);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Purchase Details");
      XLSX.writeFile(wb, `${name.replace(/[^a-z0-9]/gi, "_")}_purchases.xlsx`);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setExporting(false);
    }
  }

  const cols = "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_56px_120px_110px_120px]";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex h-10 items-center gap-2 rounded-v2-pill bg-v2-ink2 px-4 sm:w-[300px]">
          <Icon name="search" size={16} className="text-v2-c50" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("eventAdmin.purchases.search")}
            className="min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-v2-c50 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={exportXlsx}
          disabled={exporting || purchases.length === 0}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50"
        >
          <Icon name="download" size={15} />
          {exporting ? t("eventAdmin.purchases.exporting") : t("eventAdmin.purchases.export")}
        </button>
      </div>
      {error && <p className="text-[13px] text-v2-errorText">{error}</p>}

      <div className="overflow-hidden rounded-v2-card bg-v2-ink2">
        <div className={`hidden gap-4 border-b border-v2-c10 px-4 py-3 text-[12px] uppercase tracking-[0.04em] text-v2-c50 md:grid ${cols}`}>
          <span>{t("eventAdmin.purchases.colBuyer")}</span>
          <span>{t("eventAdmin.purchases.colTier")}</span>
          <span className="text-right">{t("eventAdmin.purchases.colQty")}</span>
          <span>{t("eventAdmin.purchases.colStatus")}</span>
          <span className="text-right">{t("eventAdmin.purchases.colAmount")}</span>
          <span className="text-right">{t("eventAdmin.purchases.colDate")}</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-[14px] text-v2-c50">{t("eventAdmin.purchases.none")}</p>
        ) : (
          <ul>
            {rows.map((p) => {
              const when = formatEventDateTime(p.createdAt, event.timezone, locale);
              const status = (
                <span
                  className={`inline-flex rounded-v2-pill px-2 py-0.5 text-[12px] font-v2-ui-medium ${
                    p.scanned ? "bg-v2-good/15 text-v2-good" : "bg-v2-ink4 text-v2-c50"
                  }`}
                >
                  {p.scanned ? t("eventAdmin.purchases.scanned") : t("eventAdmin.purchases.notScanned")}
                </span>
              );
              return (
                <li
                  key={p.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-v2-c06 px-4 py-3 last:border-0 md:gap-4 ${cols}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-v2-ui-semibold text-[14px]">{p.userName}</span>
                    <span className="block truncate text-[12px] text-v2-c50">{p.email}</span>
                  </span>
                  <span className="text-right font-v2-ui-semibold text-[14px] tabular-nums md:hidden">
                    {formatCentsAsPrice(p.basePrice, currency)}
                  </span>
                  <span className="truncate text-[13px] text-v2-c70">
                    {p.tierName}
                    {p.stageName ? ` · ${p.stageName}` : ""}
                    <span className="md:hidden"> · {p.quantity}×</span>
                  </span>
                  <span className="text-right md:hidden">{status}</span>
                  <span className="hidden text-right text-[14px] tabular-nums md:block">{p.quantity}</span>
                  <span className="hidden md:block">{status}</span>
                  <span className="hidden text-right font-v2-ui-semibold text-[14px] tabular-nums md:block">
                    {formatCentsAsPrice(p.basePrice, currency)}
                  </span>
                  <span className="hidden text-right text-[12px] text-v2-c50 md:block">
                    {when.date}
                    <br />
                    {when.time}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
