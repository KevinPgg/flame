"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  canManageAssignedEvents,
  formatCentsAsPrice,
  formatEventDateTime,
  summarizeEventSales,
  type OrgMemberRole,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../lib/hooks/useOrganizerData";
import type { Purchase } from "../../../../lib/utils/purchase-data";
import CoHostAssignmentModal from "../../../../components/organizer/CoHostAssignmentModal";
import { useI18n } from "../../../../lib/i18n";
import { Icon } from "../../../components/Icon";
import { Kpi } from "../../../components/Kpi";
import { Skeleton } from "../../../components/Skeleton";
import { ErrorBox } from "../../../components/ErrorBox";
import { routes } from "../../../lib/routes";
import { OrganizerShell, type ShellUser } from "../../OrganizerShell";
import { useOrganizerModel, type Org } from "../../useOrganizerModel";
import TiersTab from "./tabs/TiersTab";
import PurchasesTab from "./tabs/PurchasesTab";
import BreakdownTab from "./tabs/BreakdownTab";
import PromotersTab from "./tabs/PromotersTab";
import PromotionsTab from "./tabs/PromotionsTab";
import SendTab from "./tabs/SendTab";

const TABS = ["tiers", "purchases", "breakdown", "promoters", "promotions", "send"] as const;
export type EventTab = (typeof TABS)[number];

/**
 * Flame 2.0 · event management. Same data as v1 (organizer-data cache); v1's four unlabeled
 * icon buttons with stacked panels become named tabs, one tool at a time (prototype notes).
 */
export default function EventAdmin({
  eventId,
  organization,
  role,
  organizations,
  me = null,
}: {
  eventId: string;
  organization: Org;
  role: OrgMemberRole | null;
  organizations: Org[];
  me?: ShellUser | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data, model, loading, failed, refetch, invalidate } = useOrganizerModel(organization, role);
  const [cohostOpen, setCohostOpen] = useState(false);

  const requested = params.get("tab");
  const tab: EventTab = (TABS as readonly string[]).includes(requested ?? "") ? (requested as EventTab) : "tiers";
  // Keep the active tab visible in the scrollable tab bar (phones).
  const tabBar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabBar.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);
  const setTab = (next: EventTab) => {
    const q = new URLSearchParams(params.toString());
    q.set("tab", next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  // Owned events first, then co-hosted (same lookup order as v1).
  const found = useMemo(() => {
    if (!data) return null;
    const owned = data.events?.find((e) => e.id === eventId);
    if (owned) return { event: owned, ownerName: null as string | null };
    const c = data.cohost_events?.find((x) => x.event.id === eventId);
    return c ? { event: c.event as OrganizerEvent, ownerName: c.owner_org_name } : null;
  }, [data, eventId]);

  const event = found?.event ?? null;
  const isOwnerOrg = Boolean(event && event.organization_id === organization.id);
  const canEdit = isOwnerOrg && canManageAssignedEvents(role);

  // Same key + endpoint as v1 so the modal and the count share the cache.
  const cohostsQuery = useQuery<Array<{ id: string }>>({
    queryKey: ["cohost-assignments", organization.id, eventId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organization.id}/cohost-assignments?event_id=${eventId}`);
      if (!res.ok) throw new Error("cohosts");
      const json = await res.json();
      return Array.isArray(json) ? json : (json.assignments ?? []);
    },
    enabled: isOwnerOrg,
  });

  const purchases = (event?.purchases ?? []) as Purchase[];
  const stats = event
    ? summarizeEventSales({ tiers: event.ticket_tiers ?? [], purchases, pendingRsvps: event.pending_rsvps })
    : null;
  const ended = event ? new Date(event.ends_at).getTime() < Date.now() : false;
  const when = event ? formatEventDateTime(event.starts_at, event.timezone, locale) : null;
  const currency = event?.currency ?? "USD";

  const shell = (children: React.ReactNode) => (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      activeEventId={eventId}
      title={event?.name ?? ""}
      backHref={routes.dashboard(organization.slug)}
      crumbs={[{ label: organization.name, href: routes.dashboard(organization.slug) }]}
      me={me}
    >
      {children}
    </OrganizerShell>
  );

  if (failed) return shell(<div className="mx-auto max-w-[1120px] px-4 pt-8 lg:px-10"><ErrorBox onRetry={refetch} /></div>);
  if (!loading && data && !event) {
    return shell(
      <div className="mx-auto max-w-[1120px] px-4 pt-8 lg:px-10">
        <ErrorBox message={t("eventAdmin.notFound")} />
      </div>
    );
  }

  return shell(
    <>
      {/* ---------- Header: flyer on its own blurred colors ---------- */}
      <header className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {event?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- decorative blur
            <img src={event.image_url} alt="" className="h-full w-full scale-125 object-cover opacity-45 blur-[70px]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-v2-ink" />
        </div>
        <div className="relative mx-auto max-w-[1120px] px-4 pb-6 pt-6 lg:px-10 lg:pt-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="aspect-[4/5] w-[120px] shrink-0 overflow-hidden rounded-v2-flyer bg-v2-ink3 shadow-2xl sm:w-[148px]">
              {event?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- flyer
                <img src={event.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Skeleton className="h-full w-full !rounded-none" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              {event ? (
                <>
                  <span className="mb-2 inline-flex items-center gap-2">
                    <span
                      className={`rounded-v2-pill px-2.5 py-1 text-[12px] font-v2-ui-semibold ${
                        ended ? "bg-v2-ink3 text-v2-c70" : event.status === "published" ? "bg-v2-good/15 text-v2-good" : "bg-v2-warn/15 text-v2-warn"
                      }`}
                    >
                      {ended
                        ? t("eventAdmin.status.ended")
                        : event.status === "published"
                          ? t("eventAdmin.status.published")
                          : t("eventAdmin.status.draft")}
                    </span>
                    {event.requires_rsvp && (
                      <span className="rounded-v2-xs bg-v2-flame px-1.5 py-0.5 text-[11px] font-v2-ui-semibold">
                        {t("organizer.rsvp")}
                      </span>
                    )}
                  </span>
                  <h2 className="font-v2-display-bold text-[28px] leading-[1.05] tracking-[-0.03em] lg:text-[36px]">
                    {event.name}
                  </h2>
                  <p className="mt-2 text-[14px] text-v2-c70">
                    {when?.date} · {when?.time}
                    {event.venue || event.city ? ` · ${[event.venue, event.city].filter(Boolean).join(", ")}` : ""}
                  </p>
                </>
              ) : (
                <>
                  <Skeleton className="mb-3 h-6 w-24" />
                  <Skeleton className="h-9 w-3/4" />
                  <Skeleton className="mt-3 h-4 w-1/2" />
                </>
              )}
            </div>
            {event && (
              <div className="flex flex-wrap gap-2">
                {isOwnerOrg && (
                  <button
                    type="button"
                    onClick={() => setCohostOpen(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
                  >
                    <Icon name="users" size={16} />
                    {t("eventAdmin.cohosts")}
                    {cohostsQuery.data && cohostsQuery.data.length > 0 && (
                      <span className="text-v2-c50">{cohostsQuery.data.length}</span>
                    )}
                  </button>
                )}
                {event.requires_rsvp && (
                  <Link
                    href={routes.rsvpEvent(event.id, organization.slug)}
                    className="inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4"
                  >
                    <Icon name="rsvp" size={16} />
                    {t("rsvps.manage")}
                    {(event.pending_rsvps ?? 0) > 0 && <span className="text-v2-c50">{event.pending_rsvps}</span>}
                  </Link>
                )}
                {canEdit && (
                  <Link
                    href={routes.editEvent(event.id, organization.slug)}
                    className="inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper"
                  >
                    {t("eventAdmin.edit")}
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Headline numbers (v1 "Purchased Details" moved to the top) */}
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
            <Kpi label={t("eventAdmin.kpi.capacity")} loading={!stats}>{stats?.ticketQuantity}</Kpi>
            <Kpi label={t("eventAdmin.kpi.requested")} loading={!stats}>{stats?.requested}</Kpi>
            <Kpi label={t("eventAdmin.kpi.sold")} loading={!stats}>{stats?.sold}</Kpi>
            <Kpi label={t("eventAdmin.kpi.revenue")} loading={!stats}>
              {stats ? formatCentsAsPrice(stats.revenueCents, currency) : null}
            </Kpi>
          </div>
        </div>
      </header>

      {/* ---------- Tabs ---------- */}
      <div className="sticky top-0 z-10 border-b border-v2-c10 bg-black/85 backdrop-blur-xl">
        <div ref={tabBar} className="mx-auto flex max-w-[1120px] gap-1 overflow-x-auto px-4 lg:px-10" role="tablist">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`relative h-12 shrink-0 px-3 text-[14px] font-v2-ui-semibold transition-colors ${
                tab === k ? "text-v2-cream" : "text-v2-c50 hover:text-v2-c90"
              }`}
            >
              {t(`eventAdmin.tabs.${k}`)}
              {tab === k && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-v2-flame" />}
            </button>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-[1120px] px-4 pt-6 lg:px-10">
        {found?.ownerName && (
          <p className="mb-4 rounded-v2-card bg-v2-ink2 p-4 text-[13px] text-v2-c70">
            {t("eventAdmin.readOnlyCohost", { organizer: found.ownerName })}
          </p>
        )}
        {!event ? (
          <Skeleton className="h-40 w-full !rounded-v2-card" />
        ) : tab === "tiers" ? (
          <TiersTab event={event} purchases={purchases} canEdit={canEdit} slug={organization.slug} onChanged={invalidate} />
        ) : tab === "purchases" ? (
          isOwnerOrg ? <PurchasesTab event={event} purchases={purchases} slug={organization.slug} /> : <NoSales />
        ) : tab === "breakdown" ? (
          isOwnerOrg ? <BreakdownTab event={event} purchases={purchases} /> : <NoSales />
        ) : tab === "promoters" ? (
          isOwnerOrg ? <PromotersTab event={event} canEdit={canEdit} onChanged={invalidate} /> : <NoSales />
        ) : tab === "promotions" ? (
          isOwnerOrg ? <PromotionsTab event={event} canEdit={canEdit} onChanged={invalidate} /> : <NoSales />
        ) : isOwnerOrg ? (
          <SendTab event={event} canEdit={canEdit} onChanged={invalidate} />
        ) : (
          <NoSales />
        )}
      </section>

      {isOwnerOrg && event && (
        <CoHostAssignmentModal
          open={cohostOpen}
          onClose={() => setCohostOpen(false)}
          orgId={organization.id}
          eventId={event.id}
          eventName={event.name}
        />
      )}
    </>
  );
}

function NoSales() {
  const { t } = useI18n();
  return <p className="rounded-v2-card bg-v2-ink2 p-5 text-[14px] text-v2-c50">{t("eventAdmin.noSalesData")}</p>;
}
