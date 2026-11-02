"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  formatCentsAsPrice,
  parsePromoterNames,
  promoterLeaderboard,
  promoterLinkUrl,
  PROMOTER_BATCH_MAX,
  validatePromoterCode,
  type PromoterLinkRow,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../../lib/i18n";
import { Icon } from "../../../../components/Icon";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { Modal } from "../../../../components/Modal";
import { apiErrorMessage } from "../../../../lib/api-error";

/**
 * Promoter links: same flow and endpoints as v1 (code + optional name → generate; copy; delete),
 * as a leaderboard, with the API's validation up front and a confirmation before deleting.
 * 2026-11-02 (prototype): "Paste a list" → one code + link per name (POST …/promoter-links/bulk),
 * "Copy all" for WhatsApp, and a QR per row shown in-page (screenshot / share / download PNG).
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
  const [mode, setMode] = useState<"one" | "list">("one");
  const [listText, setListText] = useState("");
  const [batch, setBatch] = useState<PromoterLinkRow[] | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [qrFor, setQrFor] = useState<PromoterLinkRow | null>(null);
  const parsedNames = parsePromoterNames(listText);
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

  async function createBatch() {
    if (parsedNames.length === 0) return;
    if (parsedNames.length > PROMOTER_BATCH_MAX) return setError(t("eventAdmin.promoters.listTooMany", { max: PROMOTER_BATCH_MAX }));
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/organizer/promoter-links/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, names: parsedNames }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, t("errors.generic")));
      const { promoter_links } = (await res.json()) as { promoter_links: PromoterLinkRow[] };
      setBatch(promoter_links);
      setListText("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  const urlFor = (link: PromoterLinkRow) => promoterLinkUrl(origin, event.slug, link.promoter_code);

  async function copyAll(rows: PromoterLinkRow[]) {
    await writeClipboard(rows.map((l) => `${l.promoter_name || l.promoter_code}: ${urlFor(l)}`).join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  }

  async function copy(link: PromoterLinkRow) {
    await writeClipboard(urlFor(link));
    setCopied(link.id);
    setTimeout(() => setCopied((c) => (c === link.id ? null : c)), 1800);
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="rounded-v2-card bg-v2-ink2 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-v2-ui-semibold text-[15px]">{t("eventAdmin.promoters.create")}</h3>
            <div role="tablist" className="inline-flex rounded-v2-pill bg-v2-ink3 p-1">
              {(["one", "list"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={`h-8 rounded-v2-pill px-3 text-[12.5px] font-v2-ui-semibold ${mode === m ? "bg-v2-cream text-v2-ink" : "text-v2-c70 hover:text-v2-cream"}`}
                >
                  {m === "one" ? t("eventAdmin.promoters.modeOne") : t("eventAdmin.promoters.modeList")}
                </button>
              ))}
            </div>
          </div>
          {mode === "list" ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="pl-list" className="text-[13px] text-v2-c70">
                {t("eventAdmin.promoters.listLabel")}
              </label>
              <textarea
                id="pl-list"
                value={listText}
                onChange={(e) => setListText(e.target.value)}
                rows={6}
                placeholder={t("eventAdmin.promoters.listPlaceholder")}
                className="min-h-[140px] resize-y rounded-v2-md bg-v2-ink3 px-4 py-3 text-[14px] leading-6 placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12.5px] text-v2-c50">
                  {parsedNames.length > 0
                    ? t("eventAdmin.promoters.listCount", { count: parsedNames.length })
                    : t("eventAdmin.promoters.listHint", { max: PROMOTER_BATCH_MAX })}
                </p>
                <button
                  type="button"
                  onClick={createBatch}
                  disabled={saving || parsedNames.length === 0}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink disabled:opacity-50"
                >
                  <Icon name="link" size={16} />
                  {t("eventAdmin.promoters.createLinks")}
                </button>
              </div>
              {error && <p className="text-[13px] text-v2-errorText">{error}</p>}
            </div>
          ) : (
        <form onSubmit={create}>
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
        </div>
      )}

      {batch && batch.length > 0 && (
        <div className="flex flex-col gap-3 rounded-v2-card border border-v2-good/30 bg-v2-ink2 p-4 sm:flex-row sm:items-center">
          <span className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-0.5 text-v2-good">
              <Icon name="check" size={18} />
            </span>
            <span className="min-w-0">
              <b className="block font-v2-ui-semibold text-[14px]">{t("eventAdmin.promoters.batchReady", { count: batch.length })}</b>
              <small className="block text-[12.5px] text-v2-c50">{t("eventAdmin.promoters.batchHint")}</small>
            </span>
          </span>
          <button
            type="button"
            onClick={() => copyAll(batch)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink"
          >
            <Icon name={copiedAll ? "check" : "copy"} size={15} />
            {copiedAll ? t("eventAdmin.promoters.copied") : t("eventAdmin.promoters.copyAll")}
          </button>
        </div>
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
                  onClick={() => setQrFor(l)}
                  aria-label={`${t("eventAdmin.promoters.qr")} ${l.promoter_code}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-v2-pill bg-v2-ink3 px-3 text-[12px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
                >
                  <Icon name="qr" size={14} />
                  <span className="hidden sm:inline">{t("eventAdmin.promoters.qr")}</span>
                </button>
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

      {links.length > 1 && (
        <button
          type="button"
          onClick={() => copyAll(links)}
          className="inline-flex h-10 items-center gap-2 self-start rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
        >
          <Icon name={copiedAll ? "check" : "copy"} size={15} />
          {copiedAll ? t("eventAdmin.promoters.copied") : t("eventAdmin.promoters.copyAll")}
        </button>
      )}

      {qrFor && <PromoterQrModal link={qrFor} url={urlFor(qrFor)} onClose={() => setQrFor(null)} />}

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

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/** QR of a promoter link, rendered in-page so it can be shown, screenshotted, shared or saved. */
function PromoterQrModal({ link, url, onClose }: { link: PromoterLinkRow; url: string; onClose: () => void }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0B0B0C", light: "#FFFFFF" } })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [url]);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const fileName = `qr-${link.promoter_code}.png`;
  return (
    <Modal
      open
      closeOnBackdrop
      title={link.promoter_name || link.promoter_code}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={async () => {
              await writeClipboard(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
          >
            <Icon name={copied ? "check" : "copy"} size={15} />
            {copied ? t("eventAdmin.promoters.copied") : t("eventAdmin.promoters.copy")}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={() => navigator.share({ title: link.promoter_name || link.promoter_code, url }).catch(() => undefined)}
              className="inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
            >
              <Icon name="share" size={15} />
              {t("eventAdmin.promoters.share")}
            </button>
          )}
          {src && (
            <a
              href={src}
              download={fileName}
              className="inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink"
            >
              <Icon name="download" size={15} />
              {t("eventAdmin.promoters.downloadQr")}
            </a>
          )}
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="aspect-square w-full max-w-[280px] overflow-hidden rounded-v2-md bg-white p-2">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, so it can be long-pressed/saved
            <img src={src} alt={`QR ${link.promoter_code}`} className="h-full w-full" />
          ) : (
            <div className="h-full w-full animate-pulse bg-v2-c06" />
          )}
        </div>
        <b className="font-v2-display-bold text-[22px] tracking-[0.12em]">{link.promoter_code}</b>
        <small className="break-all text-[12.5px] text-v2-c50">{url.replace(/^https?:\/\//, "")}</small>
        <small className="text-[12.5px] text-v2-c70">{t("eventAdmin.promoters.qrHint")}</small>
      </div>
    </Modal>
  );
}
