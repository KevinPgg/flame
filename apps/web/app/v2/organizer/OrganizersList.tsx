"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "../../lib/i18n";
import { useUserOrganizations } from "../../lib/hooks/useOrganizations";
import OnboardingModal from "../../components/modals/OnboardingModal";
import { Icon } from "../components/Icon";
import { OrgAvatar } from "../components/OrgAvatar";
import { Skeleton } from "../components/Skeleton";
import { StatusTag } from "../components/StatusTag";
import { routes } from "../lib/routes";

/**
 * Flame 2.0 · "My organizers" — same content as v1 /profile → My organizers
 * (logo, name, role, event count, pending approval, create new organizer), as a card grid.
 * Rendered inside the attendee frame (top bar + tabs) since 2026-11-02.
 */
export default function OrganizersList() {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useUserOrganizations();
  const [creating, setCreating] = useState(false);
  const orgs = data?.organizations ?? [];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-6 lg:px-8 lg:pt-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-v2-display-bold text-[30px] leading-none tracking-[-0.03em]">
          {t("organizer.myOrganizers")}
        </h1>
        <Link
          href="/profile"
          className="inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[14px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
        >
          <Icon name="back" size={16} />
          {t("tabs.you")}
        </Link>
      </header>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="flex items-center gap-4 rounded-v2-card bg-v2-ink2 p-4">
                  <Skeleton className="h-16 w-16 !rounded-v2-lg" />
                  <span className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-3 w-1/3" />
                  </span>
                </li>
              ))
            : orgs.map((org) => {
                const body = (
                  <>
                    <OrgAvatar name={org.name} logoUrl={org.logo_url} size={64} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-v2-display-bold text-[17px] tracking-[-0.02em]">
                        {org.name}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-v2-c50">
                        <StatusTag tone={org.role === "owner" ? "flame" : org.role === "admin" ? "warn" : "neutral"}>
                          {t(`organizer.roles.${org.role}`)}
                        </StatusTag>
                        {org.approved
                          ? t("organizer.eventsCount", { count: org.eventCount })
                          : t("organizer.pendingApproval")}
                      </span>
                    </span>
                    <Icon
                      name={org.approved ? "chev" : "clock"}
                      size={18}
                      className={org.approved ? "text-v2-c70" : "text-v2-c50"}
                    />
                  </>
                );
                return (
                  <li key={org.id}>
                    {org.approved ? (
                      <Link
                        href={routes.dashboard(org.slug)}
                        className="flex items-center gap-4 rounded-v2-card bg-v2-ink2 p-4 transition-colors hover:bg-v2-ink3"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-4 rounded-v2-card bg-v2-ink2 p-4 opacity-60">{body}</div>
                    )}
                  </li>
                );
              })}

          {!isLoading && (
            <li>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex h-full min-h-[96px] w-full items-center gap-4 rounded-v2-card border border-dashed border-v2-c16 p-4 text-left text-v2-c70 transition-colors hover:border-v2-c30 hover:text-v2-cream"
              >
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-v2-lg bg-v2-ink3">
                  <Icon name="plus" size={22} />
                </span>
                <span className="font-v2-ui-semibold text-[15px]">{t("organizer.createOrganizer")}</span>
              </button>
            </li>
          )}
        </ul>
      )}

      {!isLoading && !isError && orgs.length === 0 && (
        <p className="mt-6 text-[14px] text-v2-c50">{t("organizer.noOrganizers")}</p>
      )}

      {/* v1 modal reused until the create-organizer flow is redesigned. */}
      <OnboardingModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onSuccess={() => {
          setCreating(false);
          refetch();
        }}
      />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-3 rounded-v2-card bg-v2-ink2 p-5">
      <p className="text-[14px] text-v2-c70">{t("errors.generic")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink"
      >
        <Icon name="refresh" size={14} />
        {t("common.retry")}
      </button>
    </div>
  );
}
