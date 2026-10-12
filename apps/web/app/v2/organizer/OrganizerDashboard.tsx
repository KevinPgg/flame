"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  buildOrganizerEventList,
  canAccessOrgSettings,
  canCreateEvents,
  canManageMembers,
  canManagePayouts,
  canViewAllEvents,
  formatCentsAsPrice,
  formatEventDateTime,
  revenueByCurrency,
  searchEventsByName,
  splitEventsByTime,
  totalPendingRsvps,
  type OrgMemberRole,
} from "@project-flame/lib";
import type { OrganizerData, Event as OrganizerEvent } from "../../lib/hooks/useOrganizerData";
import { useStripeConnectStatus } from "../../lib/hooks/useStripeConnectStatus";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";
import { useI18n } from "../../lib/i18n";
import { Icon, type IconName } from "../components/Icon";
import { OrgAvatar } from "../components/OrgAvatar";
import { Skeleton } from "../components/Skeleton";
import { routes } from "../lib/routes";

type Org = { id: string; name: string; slug: string; logo_url: string | null };

/**
 * Flame 2.0 · organizer dashboard (web, responsive).
 * Same data and rules as v1 (OrganizerAdminView): same API, same React Query cache key,
 * same role scoping; the rules themselves live in @project-flame/lib (organizer/dashboard).
 * Desktop: sidebar. Phone: bottom bar (Events, RSVPs, Scan, Team, Settings).
 */
export default function OrganizerDashboard({
  organization,
  role,
  organizations,
}: {
  organization: Org;
  role: OrgMemberRole | null;
  organizations: Org[];
}) {
  const { t } = useI18n();
  const fullAccess = canViewAllEvents(role);

  // Keep the shared role context in sync so v1 screens opened from here scope correctly.
  const { setSelectedOrgId } = useMemberRoleContext();
  useEffect(() => {
    setSelectedOrgId(organization.id);
  }, [organization.id, setSelectedOrgId]);

  // Same key + endpoint + polling as v1 → one cache, one source of truth.
  const dataQuery = useQuery<OrganizerData>({
    queryKey: ["organizer-data", organization.slug],
    queryFn: async () => {
      const res = await fetch(`/api/organizer/data?org=${encodeURIComponent(organization.slug)}`);
      if (!res.ok) throw new Error(`organizer data ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
  });

  // Organizer role: only the events assigned to them (same endpoint/key as v1).
  const assignmentsQuery = useQuery<{ assignments: Array<{ event_id: string }> }>({
    queryKey: ["my-event-assignments", organization.id],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organization.id}/event-assignments?mine=true`);
      if (!res.ok) throw new Error("Failed to load assignments");
      return res.json();
    },
    enabled: !fullAccess,
    staleTime: 2 * 60 * 1000,
  });

  const loading = dataQuery.isLoading || (!fullAccess && assignmentsQuery.isLoading);
  const failed = dataQuery.isError && !dataQuery.data;

  const model = useMemo(() => {
    const data = dataQuery.data;
    if (!data) return null;
    const assigned = fullAccess
      ? undefined
      : assignmentsQuery.data?.assignments.map((a) => a.event_id);
    if (!fullAccess && assigned === undefined) return null;
    const list = buildOrganizerEventList<OrganizerEvent>({
      events: data.events ?? [],
      cohostEvents: data.cohost_events ?? [],
      ownerCohostAssignments: data.owner_cohost_assignments ?? [],
      assignedEventIds: assigned,
    });
    return {
      ...list,
      ...splitEventsByTime(list.all),
      revenue: revenueByCurrency(list.owned),
      pending: totalPendingRsvps(list.all),
    };
  }, [dataQuery.data, assignmentsQuery.data, fullAccess]);

  const [tab, setTab] = useState<"current" | "past">("current");
  const [search, setSearch] = useState("");
  const visible = model ? searchEventsByName(tab === "current" ? model.current : model.past, search) : [];

  const nav: Array<{ key: string; icon: IconName; label: string; href: string; active?: boolean; badge?: number }> = [
    { key: "events", icon: "cal", label: t("tabs.events"), href: routes.dashboard(organization.slug), active: true },
    { key: "rsvps", icon: "rsvp", label: t("tabs.rsvps"), href: routes.rsvps(organization.slug), badge: model?.pending || 0 },
    { key: "scan", icon: "scan", label: t("tabs.scan"), href: routes.scanner() },
    ...(canManageMembers(role)
      ? [{ key: "team", icon: "users" as IconName, label: t("tabs.team"), href: routes.team(organization.slug) }]
      : []),
    ...(canAccessOrgSettings(role)
      ? [{ key: "settings", icon: "settings" as IconName, label: t("tabs.settings"), href: routes.settings(organization.slug) }]
      : []),
  ];

  return (
    <div className="min-h-full lg:flex">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col gap-6 border-r border-v2-c10 bg-[#050505] p-4 lg:flex">
        <OrgSwitcher current={organization} organizations={organizations} />
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`flex h-10 items-center gap-3 rounded-v2-md px-3 text-[14px] font-v2-ui-medium transition-colors ${
                item.active ? "bg-v2-ink3 text-v2-cream" : "text-v2-c70 hover:bg-v2-ink2 hover:text-v2-cream"
              }`}
            >
              <Icon name={item.icon} size={18} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? <Badge n={item.badge} /> : null}
            </Link>
          ))}
        </nav>
        {model && model.current.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto border-t border-v2-c10 pt-4">
            {model.current.slice(0, 12).map((e) => (
              <Link
                key={e.id}
                href={routes.event(e.id, organization.slug)}
                className="flex items-center gap-3 rounded-v2-md p-2 text-v2-c70 hover:bg-v2-ink2 hover:text-v2-cream"
              >
                <Flyer src={e.image_url} size={32} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{e.name}</span>
              </Link>
            ))}
          </div>
        )}
        <Link
          href={routes.attendeeHome()}
          className="mt-auto flex h-10 items-center gap-3 rounded-v2-md px-3 text-[13px] text-v2-c50 hover:text-v2-cream"
        >
          <Icon name="ticket" size={16} />
          {t("organizer.attendeeApp")}
        </Link>
      </aside>

      {/* ---------- Main ---------- */}
      <main className="min-w-0 flex-1 pb-28 lg:pb-12">
        <div className="px-4 pt-4 lg:hidden">
          <OrgSwitcher current={organization} organizations={organizations} compact />
        </div>

        <Hero organization={organization} role={role} model={model} loading={loading} fullAccess={fullAccess} />

        <section className="mx-auto max-w-[1120px] px-4 lg:px-10">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2" role="tablist">
              {(["current", "past"] as const).map((k) => {
                const count = model ? (k === "current" ? model.current.length : model.past.length) : null;
                const on = tab === k;
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
                    {k === "current" ? t("organizer.currentUpcoming") : t("organizer.pastEvents")}
                    {count !== null && (
                      <span className={on ? "text-v2-ink/50" : "text-v2-c50"}>{count}</span>
                    )}
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
                placeholder={t("organizer.searchEvents")}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none"
              />
            </label>
          </div>

          {!fullAccess && <p className="mb-3 text-[13px] text-v2-c50">{t("organizer.assignedOnly")}</p>}

          {failed ? (
            <ErrorBox onRetry={() => dataQuery.refetch()} />
          ) : (
            <EventsTable
              loading={loading || !model}
              events={visible}
              slug={organization.slug}
              partners={model?.cohostPartners ?? {}}
              empty={search.trim() ? t("organizer.noMatch") : t("organizer.noEvents")}
            />
          )}
        </section>
      </main>

      {/* ---------- Phone bottom bar ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-v2-c10 bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {nav.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={`relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-v2-ui-medium ${
              item.active ? "text-v2-cream" : "text-v2-c50"
            }`}
          >
            <Icon name={item.icon} size={22} />
            {item.label}
            {item.badge ? (
              <span className="absolute right-[calc(50%-20px)] top-2">
                <Badge n={item.badge} />
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/* ============================== pieces ============================== */

function Hero({
  organization,
  role,
  model,
  loading,
  fullAccess,
}: {
  organization: Org;
  role: OrgMemberRole | null;
  model: { all: unknown[]; revenue: Array<{ currency: string; cents: number }> } | null;
  loading: boolean;
  fullAccess: boolean;
}) {
  const { t } = useI18n();
  return (
    <header className="relative mb-6 overflow-hidden">
      {/* Color glow from the organizer's logo (prototype: "logo on a color glow") */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {organization.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- decorative blur
          <img src={organization.logo_url} alt="" className="h-full w-full scale-150 object-cover opacity-40 blur-[80px]" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(70%_120%_at_20%_0%,rgba(136,5,23,0.55),transparent_70%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-v2-ink" />
      </div>

      <div className="relative mx-auto flex max-w-[1120px] flex-col gap-6 px-4 pb-6 pt-6 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:pt-12">
        <div className="flex items-center gap-4">
          <OrgAvatar name={organization.name} logoUrl={organization.logo_url} size={72} />
          <div className="min-w-0">
            <h1 className="truncate font-v2-display-bold text-[26px] leading-tight tracking-[-0.03em] lg:text-[30px]">
              {organization.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {role && role !== "owner" && (
                <span className="rounded-v2-pill bg-v2-ink3 px-2.5 py-1 text-[12px] text-v2-c70">
                  {t(`organizer.roles.${role}`)}
                </span>
              )}
              {canManagePayouts(role) && <StripeBadge orgId={organization.id} slug={organization.slug} />}
              {canManagePayouts(role) && (
                <Link
                  href={routes.settings(organization.slug)}
                  className="rounded-v2-pill bg-v2-ink3 px-2.5 py-1 text-[12px] font-v2-ui-medium text-v2-c90 hover:bg-v2-ink4"
                >
                  {t("organizer.manage")}
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 lg:flex-nowrap lg:gap-10">
          {fullAccess && (
            <>
              <Kpi label={t("organizer.totalEvents")} loading={loading || !model}>
                {model?.all.length ?? 0}
              </Kpi>
              <Kpi label={t("organizer.totalRevenue")} loading={loading || !model}>
                {model && model.revenue.length === 0
                  ? "—"
                  : model?.revenue.map((r) => (
                      <span key={r.currency} className="block">
                        {formatCentsAsPrice(r.cents, r.currency)}
                      </span>
                    ))}
              </Kpi>
            </>
          )}
          {canCreateEvents(role) && (
            <Link
              href={routes.createEvent(organization.slug)}
              className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper sm:ml-auto sm:w-auto lg:ml-0"
            >
              <Icon name="plus" size={18} strokeWidth={2.2} />
              {t("organizer.createEvent")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function Kpi({ label, loading, children }: { label: string; loading: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-[96px]">
      <div className="text-[12px] uppercase tracking-[0.04em] text-v2-c50">{label}</div>
      <div className="mt-1 font-v2-display-bold text-[24px] leading-tight tracking-[-0.02em] tabular-nums lg:text-[28px]">
        {loading ? <Skeleton className="mt-1 h-7 w-20" /> : children}
      </div>
    </div>
  );
}

function StripeBadge({ orgId, slug }: { orgId: string; slug: string }) {
  const { t } = useI18n();
  const { data, isLoading } = useStripeConnectStatus(orgId);
  if (isLoading) return <Skeleton className="h-6 w-28 !rounded-v2-pill" />;
  if (!data) return null; // same as v1: hide on error instead of a misleading state
  const ok = data.connected && data.chargesEnabled && data.payoutsEnabled;
  return ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-v2-pill bg-v2-good/15 px-2.5 py-1 text-[12px] text-v2-good">
      <Icon name="check" size={13} strokeWidth={2.4} />
      {t("organizer.stripeConnected")}
    </span>
  ) : (
    <Link
      href={routes.payouts(slug)}
      className="inline-flex items-center gap-1.5 rounded-v2-pill bg-v2-warn/15 px-2.5 py-1 text-[12px] text-v2-warn hover:bg-v2-warn/25"
    >
      <Icon name="alert" size={13} />
      {t("organizer.stripeIncomplete")}
    </Link>
  );
}

function OrgSwitcher({ current, organizations, compact }: { current: Org; organizations: Org[]; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const others = organizations.filter((o) => o.id !== current.id);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("organizer.switchOrganizer")}
        className={`flex w-full items-center gap-3 rounded-v2-md text-left hover:bg-v2-ink2 ${compact ? "p-1" : "p-2"}`}
      >
        <OrgAvatar name={current.name} logoUrl={current.logo_url} size={compact ? 32 : 36} />
        <span className="min-w-0 flex-1 truncate font-v2-ui-semibold text-[14px]">{current.name}</span>
        <Icon name="down" size={16} className="text-v2-c50" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-v2-card border border-v2-c10 bg-v2-ink2 p-1 shadow-2xl">
          {others.map((o) => (
            <Link
              key={o.id}
              href={routes.dashboard(o.slug)}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-v2-md p-2 hover:bg-v2-ink3"
            >
              <OrgAvatar name={o.name} logoUrl={o.logo_url} size={28} />
              <span className="truncate text-[14px]">{o.name}</span>
            </Link>
          ))}
          <Link
            href={routes.organizers()}
            className="mt-1 flex items-center gap-3 rounded-v2-md border-t border-v2-c10 p-2 pt-3 text-[13px] text-v2-c70 hover:text-v2-cream"
          >
            <Icon name="users" size={16} />
            {t("organizer.myOrganizers")}
          </Link>
        </div>
      )}
    </div>
  );
}

function EventsTable({
  loading,
  events,
  slug,
  partners,
  empty,
}: {
  loading: boolean;
  events: OrganizerEvent[];
  slug: string;
  partners: Record<string, string[]>;
  empty: string;
}) {
  const { t, locale } = useI18n();
  const cols = "md:grid-cols-[120px_minmax(0,2fr)_minmax(0,1.2fr)_96px_128px]";

  return (
    <div className="overflow-hidden rounded-v2-card bg-v2-ink2">
      <div
        className={`hidden gap-4 border-b border-v2-c10 px-4 py-3 text-[12px] uppercase tracking-[0.04em] text-v2-c50 md:grid ${cols}`}
      >
        <span>{t("organizer.colDate")}</span>
        <span>{t("organizer.colEvent")}</span>
        <span>{t("organizer.colVenue")}</span>
        <span className="text-right">{t("organizer.colAttendees")}</span>
        <span className="text-right">{t("organizer.colRevenue")}</span>
      </div>

      {loading ? (
        Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-v2-c06 px-4 py-3 last:border-0">
            <Skeleton className="h-12 w-12 !rounded-v2-sm" />
            <span className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </span>
          </div>
        ))
      ) : events.length === 0 ? (
        <p className="px-4 py-12 text-center text-[14px] text-v2-c50">{empty}</p>
      ) : (
        <ul>
          {events.map((e) => {
            const when = formatEventDateTime(e.starts_at, e.timezone, locale);
            const where = [e.venue, e.city].filter(Boolean).join(", ");
            const revenue = formatCentsAsPrice(e.totalRevenue || 0, e.currency ?? "USD");
            const attendees = (e.totalAttendees || 0).toLocaleString(locale);
            const names = partners[e.id];
            return (
              <li key={e.id} className="border-b border-v2-c06 last:border-0">
                <Link
                  href={routes.event(e.id, slug)}
                  className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-v2-ink3 md:gap-4 ${cols}`}
                >
                  {/* date (desktop) / flyer (phone) */}
                  <span className="md:hidden">
                    <Flyer src={e.image_url} size={48} />
                  </span>
                  <span className="hidden text-[13px] leading-snug md:block">
                    <span className="block font-v2-ui-semibold text-v2-cream">{when.date}</span>
                    <span className="text-v2-c50">{when.time}</span>
                  </span>

                  {/* event */}
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="hidden md:block">
                      <Flyer src={e.image_url} size={40} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-v2-ui-semibold text-[15px]">{e.name}</span>
                      <span className="block truncate text-[12px] text-v2-c50 md:hidden">
                        {when.date} · {when.time}
                        {where ? ` · ${where}` : ""}
                      </span>
                      {(e.requires_rsvp || names) && (
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {e.requires_rsvp && (
                            <span className="rounded-v2-xs bg-v2-flame px-1.5 py-0.5 text-[11px] font-v2-ui-semibold">
                              {e.pending_rsvps
                                ? t("organizer.pendingRequests", { count: e.pending_rsvps })
                                : t("organizer.rsvp")}
                            </span>
                          )}
                          {names && (
                            <span className="max-w-full truncate rounded-v2-xs bg-v2-ink4 px-1.5 py-0.5 text-[11px] text-v2-c70">
                              {t("organizer.cohostWith", { names: names.join(" & ") })}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </span>

                  {/* venue (desktop) */}
                  <span className="hidden truncate text-[13px] text-v2-c70 md:block">{where}</span>

                  {/* numbers: stacked on phone, two columns on desktop */}
                  <span className="text-right text-[13px] tabular-nums md:hidden">
                    <span className="block font-v2-ui-semibold">{revenue}</span>
                    <span className="text-v2-c50">{attendees}</span>
                  </span>
                  <span className="hidden text-right text-[14px] tabular-nums md:block">{attendees}</span>
                  <span className="hidden text-right font-v2-ui-semibold text-[14px] tabular-nums md:block">
                    {revenue}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Flyer({ src, size }: { src?: string | null; size: number }) {
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-v2-sm bg-v2-ink4"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails; storage host differs per env
        <img src={src} alt="" width={size} height={size} loading="lazy" className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-v2-pill bg-v2-flame px-1.5 text-[11px] font-v2-ui-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 rounded-v2-card bg-v2-ink2 p-5">
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
