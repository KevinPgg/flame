"use client";

import { useI18n } from "../../lib/i18n";
import { Icon } from "./Icon";

export function ErrorBox({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 rounded-v2-card bg-v2-ink2 p-5">
      <p className="text-[14px] text-v2-c70">{message ?? t("errors.generic")}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink"
        >
          <Icon name="refresh" size={14} />
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}
