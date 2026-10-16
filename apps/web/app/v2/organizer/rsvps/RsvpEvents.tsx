"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEventDateTime, rsvpEventLists, type OrgMemberRole } from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { Flyer } from "../../components/Flyer";
import { Skeleton } from "../../components/Skeleton";
import { ErrorBox } from "../../components/ErrorBox";
import { routes } from "../../lib/routes";
import { OrganizerShell } from "../OrganizerShell";
import { useOrganizerModel, type Org } from "../useOrganizerModel";

/**
 * RSVP management, step 1 (prototype "ow:rsvps"): the organizer's RSVP events — own and co-hosted,
 * already scoped by role on the server — with how many requests wait on each.
 */
export default function RsvpEvents({
  organization,
  organizations,
  role,
}: {
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
}) {
  const { t, locale } = useI18n();
  const { model, loading, failed, refetch } = useOrganizerModel(organization, role);
  const [tab, setTab] = useState<"current" | "past">("current");
  const [search, setSearch] = useState("");
  const lists = model ? rsvpEventLists(model.all as OrganizerEvent[], search) : null;
  const shown = lists ? (tab === "current" ? lists.current : lists.past) : [];

  return (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      section="rsvps"
    >
      <section className="mx-auto max-w-[1120px] px-4 pt-6 lg:px-10 lg:pt-10">
        <h1 className="font-v2-display-bold text-[30px] leading-none tracking-[-0.03em] lg:text-[36px]">{t("rsvps.title")}</h1>
        <p className="mt-2 text-[14px] text-v2-c70">{t("rsvps.lede")}</p>

        <div className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2" role="tablist">
            {(["current", "past"] as const).map((k) => {
              const on = tab === k;
              const count = lists ? (k === "current" ? lists.current.length : lists.past.length) : null;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(k)}
                  className={`inline-flex h-9 items-center gap-2 rounded-v2-pill px-4 text-[13px] font-v2-ui-semibold transition-colors ${
                    on ? "bg-v2-cream text-v2-ink" : "bg-v2-ink3 text-v2-c70 hover:text-v2-cream"
                  }`}
                >
                  {k === "current" ? t("rsvps.current") : t("rsvps.past")}
                  {count !== null && <span className={on ? "text-v2-ink/50" : "text-v2-c50"}>{count}</span>}
                </button>
              );
            })}
          </div>
          <label className="flex h-10 items-center gap-2 rounded-v2-pill bg-v2-ink2 px-4 sm:w-[280px]">
            <Icon name="search" size={16} className="text-v2-c50" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("rsvps.search")}
              aria-label={t("rsvps.search")}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none"
            />
          </label>
        </div>

        {failed ? (
          <ErrorBox onRetry={refetch} />
        ) : loading || !lists ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] w-full !rounded-v2-card" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="rounded-v2-card bg-v2-ink2 px-4 py-12 text-center text-[14px] text-v2-c50">
            {search.trim() ? t("rsvps.noMatch", { query: search.trim() }) : t("rsvps.noEvents")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {shown.map((e) => {
              const when = formatEventDateTime(e.starts_at, e.timezone, locale);
              const pending = e.pending_rsvps ?? 0;
              return (
                <li key={e.id} className="min-w-0">
                  <Link
                    href={routes.rsvpEvent(e.id, organization.slug)}
                    className="flex items-center gap-4 rounded-v2-card bg-v2-ink2 p-3 transition-colors hover:bg-v2-ink3"
                  >
                    <Flyer src={e.image_url} size={72} className="!rounded-v2-md" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate font-v2-ui-semibold text-[15px]">{e.name}</b>
                      <span className="mt-1 flex items-center gap-1.5 text-[12.5px] text-v2-c70">
                        <Icon name="cal" size={13} />
                        {when.date} · {when.time}
                      </span>
                      {(e.venue || e.city) && (
                        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-v2-c50">
                          <Icon name="pin" size={13} />
                          {[e.venue, e.city].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </span>
                    <span
                      className={`flex w-16 shrink-0 flex-col items-center rounded-v2-md py-2 ${
                        pending > 0 ? "bg-v2-flame/25 text-v2-cream" : "text-v2-c50"
                      }`}
                    >
                      <b className="font-v2-display-bold text-[22px] leading-none tabular-nums">{pending}</b>
                      <small className="mt-1 text-[11px]">{t("rsvps.pendingShort")}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </OrganizerShell>
  );
}
