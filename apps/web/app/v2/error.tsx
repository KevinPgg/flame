"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "../lib/i18n";
import { Icon } from "./components/Icon";
import { routes } from "./lib/routes";

/**
 * Error boundary for every /v2 screen (inside V2Providers, so it speaks the user's language and
 * keeps the v2 look instead of falling back to the v1 error page).
 */
export default function V2Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error("[v2] page error", { message: error.message, digest: error.digest });
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[480px] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-v2-ink3 text-v2-errorText">
        <Icon name="alert" size={26} />
      </span>
      <h1 className="font-v2-display-bold text-[22px] tracking-[-0.02em]">{t("errors.pageTitle")}</h1>
      <p className="text-[14px] leading-relaxed text-v2-c70">{t("errors.pageBody")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper"
        >
          <Icon name="refresh" size={15} />
          {t("common.retry")}
        </button>
        <Link
          href={routes.organizers()}
          className="inline-flex h-10 items-center rounded-v2-pill bg-v2-ink3 px-4 text-[14px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
        >
          {t("organizer.myOrganizers")}
        </Link>
      </div>
    </main>
  );
}
