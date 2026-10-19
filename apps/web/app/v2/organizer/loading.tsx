"use client";

import { useI18n } from "../../lib/i18n";
import { Skeleton } from "../components/Skeleton";

/**
 * Shown while an organizer screen loads on the server (first visit in dev compiles for ~20 s;
 * in production it covers the data fetch). Rough shape of the shell so the page doesn't jump.
 */
export default function OrganizerLoading() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t("common.loading")} className="h-[100dvh] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden flex-col gap-3 border-r border-[#161616] bg-[#050505] px-3.5 py-[18px] lg:flex">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-14 rounded-v2-md" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 rounded-v2-sm" />
        ))}
      </aside>
      <div className="mx-auto w-full max-w-[1120px] px-4 pt-6 lg:px-10 lg:pt-10">
        <Skeleton className="mb-6 h-8 w-56" />
        <Skeleton className="mb-3 h-24 rounded-v2-card" />
        <Skeleton className="h-64 rounded-v2-card" />
      </div>
    </div>
  );
}
