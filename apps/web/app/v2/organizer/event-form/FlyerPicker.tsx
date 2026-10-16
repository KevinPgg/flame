"use client";

import { useEffect, useRef, useState } from "react";
import { resizeImageTo4x5 } from "../../../lib/utils/image-upload.client";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { FieldError } from "./ui";

export const FLYER_MAX_BYTES = 4.5 * 1024 * 1024;

export interface FlyerValue {
  /** Resized 4:5 JPEG, uploaded once the event exists (same as v1). */
  blob: Blob;
  preview: string;
}

/**
 * Flyer slot (prototype "cf-flyer"): pick → checked, resized to 4:5 and previewed locally.
 * Edit mode: `existingUrl` is the saved flyer, shown until replaced; `onRemoveExisting` clears it.
 */
export function FlyerPicker({
  value,
  onChange,
  disabled,
  existingUrl,
  onRemoveExisting,
}: {
  value: FlyerValue | null;
  onChange: (next: FlyerValue | null) => void;
  disabled?: boolean;
  existingUrl?: string | null;
  onRemoveExisting?: () => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Free the object URL when the preview changes or the form goes away.
  useEffect(() => {
    const url = value?.preview;
    return () => {
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [value?.preview]);

  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError(t("eventForm.flyerInvalid"));
    if (file.size > FLYER_MAX_BYTES) return setError(t("eventForm.flyerTooBig"));
    setBusy(true);
    try {
      const blob = await resizeImageTo4x5(file);
      onChange({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      setError(t("eventForm.flyerFailed"));
    } finally {
      setBusy(false);
    }
  };

  const shown = value?.preview ?? existingUrl ?? null;
  const remove = value ? () => onChange(null) : existingUrl ? onRemoveExisting : undefined;

  return (
    <div>
      <div className="relative mx-auto w-[220px] sm:w-[240px]">
        <label
          htmlFor="ef-flyer"
          className={`flex aspect-[4/5] w-full cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-v2-card border border-dashed text-center ${
            shown ? "border-transparent" : "border-v2-c30 bg-v2-ink2 hover:bg-v2-ink3"
          } ${disabled ? "pointer-events-none opacity-60" : ""}`}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview / storage URL
            <img src={shown} alt={t("eventForm.flyerAdd")} className="h-full w-full object-cover" />
          ) : (
            <>
              <Icon name="camera" size={26} className="text-v2-c70" />
              <b className="text-[14px] font-v2-ui-semibold">{busy ? t("common.loading") : t("eventForm.flyerAdd")}</b>
              <small className="px-4 text-[12px] text-v2-c50">{t("eventForm.flyerHint")}</small>
            </>
          )}
          {shown ? (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-v2-pill bg-black/70 px-3 py-1.5 text-[12px] font-v2-ui-semibold backdrop-blur">
              <Icon name="camera" size={14} />
              {t("eventForm.flyerChange")}
            </span>
          ) : null}
        </label>
        {remove && !disabled ? (
          <button
            type="button"
            onClick={remove}
            aria-label={t("eventForm.flyerRemove")}
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 backdrop-blur hover:bg-black"
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
        <input
          ref={input}
          id="ef-flyer"
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      <div className="text-center">
        <FieldError message={error} />
      </div>
    </div>
  );
}
