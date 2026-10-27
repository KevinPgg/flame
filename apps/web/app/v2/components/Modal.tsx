"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "../../lib/i18n";
import { Icon } from "./Icon";

/** Prototype "ow-modal": title, close button, body, optional footer. Native <dialog> (focus trap, Esc). */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  closeOnBackdrop = false,
}: {
  open: boolean;
  /** Clicking outside the box closes it. Off by default: forms would lose what was typed. */
  closeOnBackdrop?: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself, outside its box.
        if (!closeOnBackdrop || e.target !== ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) onClose();
      }}
      className="m-auto flex max-h-[86dvh] w-[min(94vw,460px)] flex-col overflow-hidden rounded-v2-card bg-v2-ink2 p-0 text-v2-cream backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between gap-3 border-b border-v2-c06 px-5 py-4">
        <h2 className="truncate text-[16px] font-v2-ui-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-v2-sm text-v2-c70 hover:bg-v2-c10"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-v2-c06 px-5 py-3">{footer}</div>}
    </dialog>
  );
}
