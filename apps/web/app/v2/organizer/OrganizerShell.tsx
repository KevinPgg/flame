"use client";

import { useState } from "react";
import Link from "next/link";
import { canAccessOrgSettings, canManageMembers, type OrgMemberRole } from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../lib/hooks/useOrganizerData";
import { useI18n } from "../../lib/i18n";
import { Icon, type IconName } from "../components/Icon";
import { OrgAvatar } from "../components/OrgAvatar";
import { Flyer } from "../components/Flyer";
import { Badge } from "../components/Badge";
import { routes } from "../lib/routes";
import type { Org } from "./useOrganizerModel";

/**
 * Organizer frame: sidebar on desktop (switcher, sections, events), bottom bar on phone
 * (Events, RSVPs, Scan, Team, Settings — filtered by role, same permissions as v1).
 */
export function OrganizerShell({
  organization,
  organizations,
  role,
  pending,
  currentEvents,
  activeEventId,
  children,
}: {
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  pending: number;
  currentEvents: OrganizerEvent[];
  activeEventId?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const nav: Array<{ key: string; icon: IconName; label: string; href: string; active?: boolean; badge?: number }> = [
    { key: "events", icon: "cal", label: t("tabs.events"), href: routes.dashboard(organization.slug), active: true },
    { key: "rsvps", icon: "rsvp", label: t("tabs.rsvps"), href: routes.rsvps(organization.slug), badge: pending },
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
        {currentEvents.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto border-t border-v2-c10 pt-4">
            {currentEvents.slice(0, 12).map((e) => (
              <Link
                key={e.id}
                href={routes.event(e.id, organization.slug)}
                aria-current={e.id === activeEventId ? "page" : undefined}
                className={`flex items-center gap-3 rounded-v2-md p-2 hover:bg-v2-ink2 hover:text-v2-cream ${
                  e.id === activeEventId ? "bg-v2-ink2 text-v2-cream" : "text-v2-c70"
                }`}
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

      <main className="min-w-0 flex-1 pb-28 lg:pb-12">
        <div className="px-4 pt-4 lg:hidden">
          <OrgSwitcher current={organization} organizations={organizations} compact />
        </div>
        {children}
      </main>

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
