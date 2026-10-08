"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FiArrowLeft, FiCalendar, FiMapPin } from "react-icons/fi";
import {
  IoSettingsOutline,
  IoChevronForward,
  IoChevronDown,
  IoPeopleOutline,
  IoTicketOutline,
  IoAddCircleOutline,
  IoSearch,
} from "react-icons/io5";
import {
  formatCentsAsPrice,
  formatEventDate,
  formatEventTime,
  canManageMembers,
  canCreateEvents,
  canViewAllEvents,
  canManageAssignedEvents,
  canManagePayouts,
  separateEventsByDate,
} from "@project-flame/lib";
import type {
  Event as OrganizerEvent,
  CohostEventEntry,
  OwnerCohostAssignment,
} from "../../lib/hooks/useOrganizerData";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";
import { Skeleton } from "../ui/Skeleton";
import { StripeStatusPill } from "./StripeStatusPill";

interface OrganizerAdminViewProps {
  events: OrganizerEvent[];
  cohostEvents?: CohostEventEntry[];
  ownerCohostAssignments?: OwnerCohostAssignment[];
  organization: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string | null;
  };
}

export default function OrganizerAdminView({
  events,
  cohostEvents = [],
  ownerCohostAssignments = [],
  organization,
}: OrganizerAdminViewProps) {
  const { memberRole, isLoading: roleLoading, selectedOrgId } =
    useMemberRoleContext();

  // Note: selectedOrgId sync moved up to OrganizerDashboard (the parent) so
  // any tab (Dashboard, RSVPs, …) gets the right role-scoped data on first
  // render, even when the user lands directly on a non-Dashboard tab.

  // Dual-signal role-sync gate (mirrors mobile)
  const isRoleSynced = selectedOrgId === organization.id && !roleLoading;
  const isFullEventAccess = isRoleSynced && canViewAllEvents(memberRole);

  // For organizer-role: fetch only the caller's assigned events for this org.
  // The endpoint accepts `?mine=true` so we get just our own assignments.
  // Paused when full access (skip the fetch entirely) or role unsynced.
  const myAssignmentsQuery = useQuery<{
    assignments: Array<{ event_id: string }>;
  }>({
    queryKey: ["my-event-assignments", organization.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/organizations/${organization.id}/event-assignments?mine=true`,
      );
      if (!res.ok) throw new Error("Failed to load assignments");
      return res.json();
    },
    enabled: isRoleSynced && !isFullEventAccess,
    staleTime: 2 * 60 * 1000,
  });

  // assignedEventIds semantics: undefined = no filter (full access),
  // null = still resolving (skeleton), string[] = resolved set.
  const assignedEventIds = useMemo<string[] | null | undefined>(() => {
    if (!isRoleSynced) return null;
    if (isFullEventAccess) return undefined;
    if (myAssignmentsQuery.data === undefined) return null;
    return myAssignmentsQuery.data.assignments.map(a => a.event_id);
  }, [isRoleSynced, isFullEventAccess, myAssignmentsQuery.data]);

  const [search, setSearch] = useState("");

  // Single source of truth for the scoped event list:
  //   null      → assignedEventIds is paused (role still syncing / fetch in flight)
  //   undefined → full access; use the unfiltered events prop
  //   string[]  → filter events by these IDs (organizer-role scope)
  // Stats AND the events list both derive from this so they stay consistent
  // even if the stats gate is ever relaxed.
  const scopedEvents = useMemo<OrganizerEvent[]>(() => {
    if (assignedEventIds === null) return [];
    if (assignedEventIds === undefined) return events;
    return events.filter(e => assignedEventIds.includes(e.id));
  }, [events, assignedEventIds]);

  // Map: event_id → "Co-host with {X}" label, combining BOTH directions:
  //   - events the current org owns and has assigned cohorts to (label = cohost name)
  //   - events the current org is a cohost on (label = owner org name)
  // Used to render the top-right badge stack on EventRow.
  const cohostBadgeMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of ownerCohostAssignments) {
      const list = map.get(a.event_id) ?? [];
      list.push(a.cohost_org_name);
      map.set(a.event_id, list);
    }
    for (const entry of cohostEvents) {
      const list = map.get(entry.event.id) ?? [];
      list.push(entry.owner_org_name);
      map.set(entry.event.id, list);
    }
    const labelMap = new Map<string, string>();
    for (const [eventId, names] of map) {
      const unique = [...new Set(names)];
      labelMap.set(eventId, `Co-host with ${unique.join(" & ")}`);
    }
    return labelMap;
  }, [cohostEvents, ownerCohostAssignments]);

  // Cohost events shaped like OrganizerEvent for the list. Lighter than primary
  // events (no purchases/promo/bank-transfer fields) but valid for card render.
  const cohostScopedEvents = useMemo<OrganizerEvent[]>(() => {
    if (assignedEventIds === null) return [];
    const all = cohostEvents.map(c => c.event);
    if (assignedEventIds === undefined) return all;
    return all.filter(e => assignedEventIds.includes(e.id));
  }, [cohostEvents, assignedEventIds]);

  // Merge primary + cohost events, dedupe by id (defensive — should not happen
  // since a row can't be both primary and cohost for the same org).
  const allScopedEvents = useMemo<OrganizerEvent[]>(() => {
    const byId = new Map<string, OrganizerEvent>();
    for (const e of scopedEvents) byId.set(e.id, e);
    for (const e of cohostScopedEvents) if (!byId.has(e.id)) byId.set(e.id, e);
    return Array.from(byId.values());
  }, [scopedEvents, cohostScopedEvents]);

  const { currentEvents, pastEvents } = useMemo(
    () => separateEventsByDate(allScopedEvents),
    [allScopedEvents],
  );

  const filteredCurrent = useMemo(() => {
    if (!search.trim()) return currentEvents;
    const q = search.toLowerCase();
    return currentEvents.filter((e: OrganizerEvent) =>
      e.name.toLowerCase().includes(q),
    );
  }, [currentEvents, search]);

  const filteredPast = useMemo(() => {
    if (!search.trim()) return pastEvents;
    const q = search.toLowerCase();
    return pastEvents.filter((e: OrganizerEvent) =>
      e.name.toLowerCase().includes(q),
    );
  }, [pastEvents, search]);

  // Aggregate revenue by currency (mirrors mobile multi-currency stack).
  // Computed over the scoped list so it stays consistent with the event list
  // even though the stats block is gated by isFullEventAccess (organizer-role
  // never sees these values today, but the math is correct regardless).
  const revenueByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of scopedEvents) {
      const currency = (e.currency || "USD").toUpperCase();
      const cents = e.totalRevenue || 0;
      map.set(currency, (map.get(currency) ?? 0) + cents);
    }
    return map;
  }, [scopedEvents]);

  // Total includes both owned events and cohosted events — mirrors what the
  // dashboard list itself renders (allScopedEvents) so the stat card matches.
  const totalEvents = allScopedEvents.length;
  const initials = organization.name.charAt(0).toUpperCase();
  const orgParam = organization.slug || organization.id;

  return (
    <div className="flex flex-col gap-6">
      {/* ← Go Back to org selection */}
      <Link
        href="/profile"
        className="self-start flex items-center gap-2 text-white-100 hover:text-white-80 transition-colors"
      >
        <FiArrowLeft size={20} />
        <span className="text-sm font-poppins-medium">Go Back</span>
      </Link>

      {/* Org header row */}
      <div className="flex items-start gap-3">
        <div className="w-[70px] h-[70px] rounded-card bg-white-10 flex items-center justify-center overflow-hidden shrink-0">
          {organization.logo_url ? (
            <Image
              src={organization.logo_url}
              alt={organization.name}
              width={70}
              height={70}
              sizes="70px"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white-100 text-2xl font-poppins-semibold">
              {initials}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 pt-[2px]">
          <h1 className="text-white-100 text-lg leading-7 font-poppins-semibold truncate">
            {organization.name}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {!isRoleSynced ? (
            <Skeleton className="h-6 w-[120px] rounded-pill" />
          ) : canManagePayouts(memberRole) ? (
            <StripeStatusPill orgId={organization.id} orgSlug={organization.slug} />
          ) : null}
          {canManagePayouts(memberRole) && (
            <Link
              href={`/organizer/settings?org=${encodeURIComponent(orgParam)}&tab=organization`}
              className="bg-white-5 border border-white-5 rounded-pill px-3 py-1.5 flex items-center gap-1 hover:bg-white-10 transition-colors"
            >
              <IoSettingsOutline size={14} className="text-white-100" />
              <span className="text-white-100 text-xs leading-4 font-poppins-medium">
                Manage
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats block — owner/admin only. Organizers don't see org-wide
          revenue; they only act on events explicitly assigned to them. */}
      {isFullEventAccess && (
        <div className="flex gap-2">
          <StatCard label="Total Events" value={String(totalEvents)} />
          <RevenueCard revenueByCurrency={revenueByCurrency} />
        </div>
      )}

      {/* Action tile row */}
      <div className="bg-white-5 border border-white-5 rounded-card p-3 flex gap-2">
        {!isRoleSynced ? (
          <>
            <ActionTileSkeleton />
            <ActionTileSkeleton />
            <ActionTileSkeleton />
          </>
        ) : (
          <ActionTiles
            organizationParam={orgParam}
            memberRole={memberRole}
          />
        )}
      </div>

      {/* Events section */}
      <section className="flex flex-col gap-3">
        <h2 className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase">
          Current &amp; Upcoming Events
        </h2>

        <SearchBar value={search} onChange={setSearch} />

        {filteredCurrent.length === 0 && filteredPast.length === 0 ? (
          <div className="py-12 flex items-center justify-center">
            <p className="text-white-50 text-sm font-poppins text-center">
              {search.trim()
                ? "No events match your search."
                : "No events yet."}
            </p>
          </div>
        ) : (
          <>
            {filteredCurrent.length > 0 && (
              <div className="flex flex-col gap-2">
                {filteredCurrent.map((event: OrganizerEvent) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    orgSlug={organization.slug}
                    cohostBadge={cohostBadgeMap.get(event.id)}
                  />
                ))}
              </div>
            )}

            {filteredPast.length > 0 && (
              <PastEventsAccordion count={filteredPast.length}>
                {filteredPast.map((event: OrganizerEvent) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    orgSlug={organization.slug}
                    cohostBadge={cohostBadgeMap.get(event.id)}
                  />
                ))}
              </PastEventsAccordion>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ActionTiles({
  organizationParam,
  memberRole,
}: {
  organizationParam: string;
  memberRole: ReturnType<typeof useMemberRoleContext>["memberRole"];
}) {
  const tiles: Array<{ label: string; icon: JSX.Element; href: string }> = [];

  if (canManageMembers(memberRole)) {
    tiles.push({
      label: "Team",
      icon: <IoPeopleOutline size={26} className="text-white-100" />,
      href: `/organizer/team?org=${encodeURIComponent(organizationParam)}`,
    });
  }
  if (canManageAssignedEvents(memberRole)) {
    tiles.push({
      label: "RSVPs",
      icon: <IoTicketOutline size={26} className="text-white-100" />,
      href: `/organizer?org=${encodeURIComponent(organizationParam)}&tab=rsvps`,
    });
  }
  if (canCreateEvents(memberRole)) {
    tiles.push({
      label: "Create Event",
      icon: <IoAddCircleOutline size={26} className="text-white-100" />,
      href: `/organizer?org=${encodeURIComponent(organizationParam)}&tab=create-event`,
    });
  }

  if (tiles.length === 0) {
    return (
      <p className="text-white-50 text-xs font-poppins text-center w-full py-2">
        No quick actions available for your role.
      </p>
    );
  }

  return (
    <>
      {tiles.map((tile, idx) => (
        <Link
          key={tile.label}
          href={tile.href}
          className={`flex-1 flex flex-col items-center gap-2 py-1 ${
            idx < tiles.length - 1 ? "border-r border-white-10" : ""
          } hover:opacity-80 transition-opacity`}
        >
          {tile.icon}
          <span className="text-white-80 text-xs font-poppins-medium">
            {tile.label}
          </span>
        </Link>
      ))}
    </>
  );
}

function ActionTileSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-center gap-2 py-1">
      <Skeleton className="w-[26px] h-[26px] rounded-full" />
      <Skeleton className="h-3 w-[60%] rounded" />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 bg-white-5 border border-white-5 rounded-card p-3 flex flex-col gap-2">
      <p className="text-white-50 text-xs leading-4 font-poppins-medium uppercase">
        {label}
      </p>
      <p className="text-white-100 text-lg leading-7 font-poppins-semibold">
        {value}
      </p>
    </div>
  );
}

function RevenueCard({
  revenueByCurrency,
}: {
  revenueByCurrency: Map<string, number>;
}) {
  return (
    <div className="flex-1 bg-white-5 border border-white-5 rounded-card p-3 flex flex-col gap-2">
      <p className="text-white-50 text-xs leading-4 font-poppins-medium uppercase">
        Total Revenue
      </p>
      {revenueByCurrency.size === 0 ? (
        <p className="text-white-100 text-lg leading-7 font-poppins-semibold">
          —
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {Array.from(revenueByCurrency.entries()).map(([currency, cents]) => (
            <p
              key={currency}
              className="text-white-100 text-lg leading-7 font-poppins-semibold"
            >
              {formatCentsAsPrice(cents, currency)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="bg-white-5 border border-white-10 rounded-pill px-4 py-2.5 flex items-center gap-2">
      <IoSearch size={16} className="text-white-50 shrink-0" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search by event name"
        className="flex-1 bg-transparent text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none min-w-0"
      />
    </div>
  );
}

const DEFAULT_EVENT_IMAGE =
  "https://placehold.co/100x100/1a1a2e/ffffff?text=No+Img";

function EventRow({
  event,
  orgSlug,
  cohostBadge,
}: {
  event: OrganizerEvent;
  orgSlug?: string;
  /** e.g. "Co-host with Org A" — shown top-right of card. */
  cohostBadge?: string;
}) {
  const totalAttendees = event.totalAttendees || 0;
  const totalRevenue = event.totalRevenue || 0;
  const imageUrl = event.image_url || DEFAULT_EVENT_IMAGE;

  const formattedDate = formatEventDate(event.starts_at, event.timezone);
  const formattedTime = formatEventTime(
    event.starts_at,
    event.timezone ?? undefined,
  );

  const href = `/organizer/event/${event.id}${orgSlug ? `?org=${encodeURIComponent(orgSlug)}` : ""}`;

  return (
    <Link
      href={href}
      className="relative w-full bg-white-5 rounded-card p-[10px] flex flex-col gap-2 text-left border border-transparent hover:border-white-20 transition-colors"
    >
      {/* Top-right badge stack: cohost first (added in Group B), then RSVP. */}
      {(event.requires_rsvp || cohostBadge) && (
        <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1 max-w-[60%]">
          {cohostBadge && (
            <span
              className="text-white-100 px-2 py-[3px] text-[10px] leading-[14px] font-poppins-medium rounded-badge truncate"
              style={{ backgroundColor: "#238FDA" }}
            >
              {cohostBadge}
            </span>
          )}
          {event.requires_rsvp && (
            <span className="bg-primary text-white-100 px-2 py-[3px] text-[10px] leading-[14px] font-poppins-medium uppercase rounded-badge">
              RSVP
            </span>
          )}
        </div>
      )}
      <div className="border-b border-white-20 pb-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 pr-[80px]">
          <Image
            src={imageUrl}
            alt={event.name}
            width={44}
            height={43}
            sizes="44px"
            className="rounded-[8px] object-cover shrink-0"
          />
          <span className="text-white-100 text-base font-poppins-semibold uppercase truncate">
            {event.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FiCalendar size={18} className="text-white-100 shrink-0" />
          <div className="flex items-center gap-2 text-xs font-poppins-light text-white-100">
            <span className="border-r border-white-20 pr-2">
              {formattedDate}
            </span>
            <span>{formattedTime}</span>
          </div>
        </div>
        {(event.venue || event.city) && (
          <div className="flex items-center gap-2">
            <FiMapPin size={18} className="text-white-100 shrink-0" />
            <span className="text-xs font-poppins-light text-white-100 truncate">
              {[event.venue, event.city].filter(Boolean).join(", ")}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-white-80 text-base leading-[22px] font-poppins">
            Attendees:{" "}
            <span className="text-white-100 font-poppins-semibold">
              {totalAttendees}
            </span>
          </span>
          <span className="text-white-80 text-base leading-[22px] font-poppins">
            Revenue:{" "}
            <span className="text-white-100 font-poppins-semibold">
              {formatCentsAsPrice(totalRevenue, event.currency ?? "USD")}
            </span>
          </span>
        </div>
        <span className="text-accent text-sm leading-5 font-poppins-medium">
          View Details
        </span>
      </div>
    </Link>
  );
}

function PastEventsAccordion({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="bg-white-5 border border-white-5 rounded-card p-3 flex items-center justify-between hover:bg-white-10 transition-colors"
      >
        <span className="text-white-100 text-sm leading-5 font-poppins-medium">
          Past events ({count})
        </span>
        {open ? (
          <IoChevronDown size={18} className="text-white-100" />
        ) : (
          <IoChevronForward size={18} className="text-white-100" />
        )}
      </button>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </div>
  );
}
