"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "../../lib/i18n";

/** Confirmation before destructive actions (prototype: "deleting asks for confirmation"). */
export function ConfirmDialog({
  open,
  message,
  detail,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  /** Consequence of confirming, in a second, quieter line (e.g. "their card is charged now"). */
  detail?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(92vw,400px)] rounded-v2-card bg-v2-ink2 p-5 text-v2-cream backdrop:bg-black/70"
    >
      <p className="text-[15px] leading-relaxed">{message}</p>
      {detail && <p className="mt-2 text-[13px] leading-relaxed text-v2-c70">{detail}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold text-v2-c90"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="h-9 rounded-v2-pill bg-v2-flame px-4 text-[13px] font-v2-ui-semibold text-white disabled:opacity-60"
        >
          {confirmLabel ?? t("common.delete")}
        </button>
      </div>
    </dialog>
  );
}
