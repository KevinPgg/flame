"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  canAccessOrgSettings,
  canCreateEvents,
  canManageMembers,
  canManagePayouts,
  formatEventDateTime,
  type OrgMemberRole,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../lib/hooks/useOrganizerData";
import { useI18n } from "../../lib/i18n";
import { Icon, type IconName } from "../components/Icon";
import { OrgAvatar } from "../components/OrgAvatar";
import { Flyer } from "../components/Flyer";
import { Badge } from "../components/Badge";
import { StripeBadge } from "../components/StripeBadge";
import { routes } from "../lib/routes";
import type { Org } from "./useOrganizerModel";

export interface ShellUser {
  name: string;
  imageUrl: string | null;
  /** Lower-case primary e-mail (marks "you" in lists). */
  email?: string | null;
}

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Organizer frame (prototype "ow-layout"): fixed sidebar + a main column that scrolls on its own,
 * topped by a sticky bar (back, breadcrumbs, title, account). Phone: the sidebar becomes a drawer
 * (menu button) and a floating tab bar sits at the bottom — hidden on full-screen forms, which
 * bring their own sticky action bar. Menu entries are filtered by role, same permissions as v1.
 */
export function OrganizerShell({
  organization,
  organizations,
  role,
  pending,
  currentEvents,
  pastEvents = [],
  activeEventId,
  section = "events",
  title,
  crumbs = [],
  backHref,
  actions,
  hideTabbar = false,
  me = null,
  children,
}: {
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  pending: number;
  currentEvents: OrganizerEvent[];
  pastEvents?: OrganizerEvent[];
  activeEventId?: string;
  /** Highlighted entry of the menu. */
  section?: "events" | "rsvps" | "team" | "payouts" | "settings";
  /** Title of the sticky top bar. */
  title: string;
  crumbs?: Crumb[];
  backHref?: string;
  actions?: ReactNode;
  /** Full-screen forms (create / edit / tier): no phone tab bar, the form's own bar is at the bottom. */
  hideTabbar?: boolean;
  me?: ShellUser | null;
  children: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  type NavItem = { key: string; icon: IconName; label: string; href: string; active?: boolean; badge?: number };
  const nav: NavItem[] = [
    { key: "events", icon: "cal", label: t("tabs.events"), href: routes.dashboard(organization.slug), active: section === "events" },
    { key: "rsvps", icon: "rsvp", label: t("tabs.rsvps"), href: routes.rsvps(organization.slug), badge: pending, active: section === "rsvps" },
    ...(canManageMembers(role)
      ? [{ key: "team", icon: "users" as IconName, label: t("tabs.team"), href: routes.team(organization.slug), active: section === "team" }]
      : []),
    ...(canManagePayouts(role)
      ? [{ key: "payouts", icon: "bank" as IconName, label: t("tabs.payouts"), href: routes.payouts(organization.slug), active: section === "payouts" }]
      : []),
    ...(canAccessOrgSettings(role)
      ? [{ key: "settings", icon: "settings" as IconName, label: t("tabs.settings"), href: routes.settings(organization.slug), active: section === "settings" }]
      : []),
  ];
  const short = (e: OrganizerEvent) => formatEventDateTime(e.starts_at, e.timezone, locale).date;

  const eventLink = (e: OrganizerEvent) => (
    <Link
      key={e.id}
      href={routes.event(e.id, organization.slug)}
      onClick={() => setDrawer(false)}
      aria-current={e.id === activeEventId ? "page" : undefined}
      className={`relative flex items-center gap-2.5 rounded-v2-sm px-2 py-1.5 transition-colors ${
        e.id === activeEventId
          ? "bg-v2-c10 ring-1 ring-v2-c16 before:absolute before:inset-y-1.5 before:-left-1.5 before:w-[3px] before:rounded-full before:bg-v2-flame"
          : "hover:bg-v2-c06"
      }`}
    >
      <Flyer src={e.image_url} size={30} className="!rounded-v2-xs" />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[12.5px] font-v2-ui-semibold text-v2-cream">{e.name}</b>
        <small className="block truncate text-[11px] text-v2-c50">{short(e)}</small>
      </span>
    </Link>
  );

  const navItem = (item: NavItem) => (
    <Link
      key={item.key}
      href={item.href}
      onClick={() => setDrawer(false)}
      aria-current={item.active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-v2-sm px-2.5 py-[9px] text-[14px] font-v2-ui-medium transition-colors ${
        item.active ? "bg-v2-c10 text-v2-cream" : "text-v2-c70 hover:bg-v2-c06 hover:text-v2-cream"
      }`}
    >
      <Icon name={item.icon} size={18} />
      <span className="flex-1">{item.label}</span>
      {item.badge ? <Badge n={item.badge} /> : null}
    </Link>
  );

  return (
    <div className="h-[100dvh] overflow-hidden lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Sidebar: static on desktop, drawer on phone */}
      <aside
        aria-label={t("organizer.menu")}
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col gap-3 overflow-y-auto [&>*]:shrink-0 border-r border-[#161616] bg-[#050505] px-3.5 py-[18px] transition-transform duration-300 [scrollbar-width:none] lg:static lg:z-auto lg:w-auto lg:translate-x-0 ${
          drawer ? "translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.5)]" : "-translate-x-[105%]"
        }`}
      >
        <div className="flex items-center justify-between px-1 pb-1.5">
          <Link href={routes.organizers()} aria-label={t("organizer.myOrganizers")} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand svg */}
            <img src="/flame-logo-white.svg" alt="Flame" width={94} height={18} className="h-[18px] w-auto" />
          </Link>
          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label={t("organizer.closeMenu")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-v2-sm text-v2-c70 hover:bg-v2-c10 lg:hidden"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <OrgSwitcher current={organization} organizations={organizations} role={role} />
        {canManagePayouts(role) && <StripeBadge orgId={organization.id} slug={organization.slug} plain />}

        <nav className="flex flex-col gap-0.5">
          {nav.map(navItem)}
        </nav>

        {canCreateEvents(role) && (
          <Link
            href={routes.createEvent(organization.slug)}
            onClick={() => setDrawer(false)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-v2-pill bg-v2-cream text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper"
          >
            <Icon name="plus" size={17} strokeWidth={2.2} />
            {t("organizer.createEvent")}
          </Link>
        )}

        <div className="mt-1 flex flex-col gap-0.5">
          <div className="px-2 pb-1 pt-1.5 text-[11px] font-v2-ui-semibold uppercase tracking-[0.1em] text-v2-c50">{t("organizer.upcoming")}</div>
          {currentEvents.slice(0, 12).map(eventLink)}
          {pastEvents.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-3 text-[11px] font-v2-ui-semibold uppercase tracking-[0.1em] text-v2-c50">{t("organizer.past")}</div>
              {pastEvents.slice(0, 3).map(eventLink)}
            </>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-0.5 pt-2">
          <div className="mx-1 mb-2 h-px bg-v2-c10" />
          <Link href={routes.discover()} className="flex items-center gap-2.5 rounded-v2-sm px-2.5 py-[9px] text-[14px] font-v2-ui-medium text-v2-c70 hover:bg-v2-c06 hover:text-v2-cream">
            <Icon name="search" size={18} />
            {t("organizer.discover")}
          </Link>
          <Link href={routes.myTickets()} className="flex items-center gap-2.5 rounded-v2-sm px-2.5 py-[9px] text-[14px] font-v2-ui-medium text-v2-c70 hover:bg-v2-c06 hover:text-v2-cream">
            <Icon name="ticket" size={18} />
            {t("organizer.myTickets")}
          </Link>
          <Link href={routes.account()} className="flex items-center gap-2.5 rounded-v2-sm px-2.5 py-[9px] text-[14px] font-v2-ui-medium text-v2-c70 hover:bg-v2-c06 hover:text-v2-cream">
            <Icon name="user" size={18} />
            {t("organizer.myAccount")}
          </Link>
          {me && (
            <Link href={routes.profile()} className="mt-1.5 flex items-center gap-2.5 rounded-v2-md p-2 hover:bg-v2-c06">
              <UserAvatar me={me} size={30} />
              <span className="min-w-0">
                <b className="block truncate text-[13.5px] font-v2-ui-semibold">{me.name}</b>
                <small className="block truncate text-[11.5px] text-v2-c50">{t("organizer.profileHint")}</small>
              </span>
            </Link>
          )}
        </div>
      </aside>

      {drawer && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setDrawer(false)} aria-hidden />}

      {/* Main column: scrolls on its own; the top bar sticks */}
      <main id="v2-main" className="h-[100dvh] min-w-0 overflow-y-auto [scrollbar-width:thin]">
        <header className="sticky top-0 z-30 flex min-h-[60px] items-center justify-between gap-4 border-b border-[#141414] bg-black/85 px-4 py-3 backdrop-blur-xl lg:min-h-[72px] lg:px-8">
          <div className="flex min-w-0 items-center gap-2 lg:gap-3">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label={t("organizer.menu")}
              aria-expanded={drawer}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-v2-sm text-v2-c70 hover:bg-v2-c10 lg:hidden"
            >
              <Icon name="menu" size={20} />
            </button>
            {backHref && (
              <Link
                href={backHref}
                aria-label={t("common.back")}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-v2-sm text-v2-c70 hover:bg-v2-c10 hover:text-v2-cream"
              >
                <Icon name="back" size={18} />
              </Link>
            )}
            <div className="min-w-0">
              {crumbs.length > 0 && (
                <nav aria-label={t("organizer.breadcrumb")} className="mb-0.5 hidden items-center gap-1 overflow-hidden whitespace-nowrap text-[12.5px] text-v2-c50 sm:flex">
                  {crumbs.map((c, i) => (
                    <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
                      {i > 0 && <Icon name="chev" size={12} className="shrink-0 opacity-50" />}
                      {c.href ? (
                        <Link href={c.href} className="truncate hover:text-v2-cream">
                          {c.label}
                        </Link>
                      ) : (
                        <span className="truncate">{c.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
              <h1 className="truncate font-v2-display-bold text-[18px] leading-tight tracking-[-0.03em] lg:text-[22px]">{title}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {me && (
              <Link href={routes.account()} aria-label={`${t("organizer.myAccount")} · ${me.name}`} className="hidden sm:block">
                <UserAvatar me={me} size={36} />
              </Link>
            )}
          </div>
        </header>

        <div className={hideTabbar ? "" : "pb-28 lg:pb-12"}>{children}</div>
      </main>

      {!hideTabbar && (
        <nav
          aria-label={t("organizer.menu")}
          className="fixed inset-x-4 bottom-4 z-30 flex h-16 items-center justify-evenly rounded-v2-pill border border-white/10 bg-[rgba(18,18,18,0.86)] shadow-[0_18px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl lg:hidden"
        >
          {nav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`relative flex min-w-[52px] flex-col items-center gap-[3px] text-[10.5px] font-v2-ui-medium ${
                item.active ? "text-v2-cream" : "text-v2-c50"
              }`}
            >
              <Icon name={item.icon} size={22} />
              {item.label}
              {item.badge ? (
                <span className="absolute -top-1.5 right-1">
                  <Badge n={item.badge} />
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

function UserAvatar({ me, size }: { me: ShellUser; size: number }) {
  const initials = me.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[22%] bg-v2-accent text-[12px] font-v2-ui-bold text-white shadow-[0_0_0_2px_#000,0_0_0_3px_#2a2a2a]"
      style={{ width: size, height: size }}
    >
      {me.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Clerk avatar host
        <img src={me.imageUrl} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

function OrgSwitcher({ current, organizations, role }: { current: Org; organizations: Org[]; role: OrgMemberRole | null }) {
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
        className="flex w-full items-center gap-2.5 rounded-v2-lg border border-v2-c10 bg-v2-c06 p-2 text-left transition-colors hover:bg-v2-c10"
      >
        <OrgAvatar name={current.name} logoUrl={current.logo_url} size={34} />
        <span className="min-w-0 flex-1 leading-tight">
          <b className="block truncate text-[14px] font-v2-ui-semibold">{current.name}</b>
          {role && <small className="block text-[12px] text-v2-c50">{t(`organizer.roles.${role}`)}</small>}
        </span>
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
