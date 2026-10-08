"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FiCalendar, FiMapPin, FiSearch } from "react-icons/fi";
import { canViewAllEvents } from "@project-flame/lib";
import type {
  Event as OrganizerEvent,
  CohostEventEntry,
} from "../../lib/hooks/useOrganizerData";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";

interface ExpandedSections {
  events: boolean;
  ticketTiers: boolean;
  rsvps: boolean;
}

interface RsvpsViewProps {
  events: OrganizerEvent[];
  /** Events the current org co-hosts. Merged into the RSVP list so cohost
   *  admins can manage RSVPs on cohosted events (W3-B1). */
  cohostEvents?: CohostEventEntry[];
  expandedSections: ExpandedSections;
  setExpandedSections: React.Dispatch<React.SetStateAction<ExpandedSections>>;
  separateEventsByDate: (events: OrganizerEvent[]) => {
    currentEvents: OrganizerEvent[];
    pastEvents: OrganizerEvent[];
  };
  /** The org being viewed (from the surrounding OrganizerDashboard). Used to
   *  verify the role-sync context matches THIS org, not whichever was
   *  previously selected, before applying role-based filtering. */
  currentOrgId?: string;
}

const DEFAULT_IMAGE = "https://placehold.co/100x100/1a1a2e/ffffff?text=No+Img";

function RsvpEventCard({
  event,
  onActions,
}: {
  event: OrganizerEvent;
  onActions: () => void;
}) {
  const pendingCount = event.pending_rsvps || 0;
  const imageUrl = event.image_url || DEFAULT_IMAGE;

  const formattedDate = new Date(event.starts_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const formattedTime = new Date(event.starts_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="bg-card rounded-card p-[10px] flex flex-col gap-2">
      {/* EventInfoHeader pattern */}
      <div className="border-b border-white-20 pb-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
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
            <span className="border-r border-[#BFC0C2] pr-2">{formattedDate}</span>
            <span>{formattedTime}</span>
          </div>
        </div>
        {event.venue && (
          <div className="flex items-center gap-2">
            <FiMapPin size={18} className="text-white-100 shrink-0" />
            <span className="text-xs font-poppins-light text-white-100 truncate">
              {[event.venue, event.city].filter(Boolean).join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Bottom row — matches mobile RsvpEventCard */}
      <div className="flex items-center justify-between">
        <span className="text-white-80 text-sm leading-5 font-poppins">
          {pendingCount === 1 ? "Pending request" : "Pending requests"}:{" "}
          <span className="text-white-100 font-poppins-semibold">{pendingCount}</span>
        </span>
        <button
          onClick={onActions}
          className="text-accent text-sm leading-5 font-poppins-medium bg-transparent border-none cursor-pointer p-0"
        >
          Actions
        </button>
      </div>
    </div>
  );
}

export default function RsvpsView({
  events,
  cohostEvents = [],
  expandedSections,
  setExpandedSections,
  separateEventsByDate,
  currentOrgId,
}: RsvpsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");

  // Organizer-role: scope to assigned events. Owner/admin see all org events.
  // Same `?mine=true` endpoint pattern as OrganizerAdminView; same null/undefined/array
  // semantics for assignedEventIds.
  //
  // Dual-signal role-sync gate (mirrors OrganizerAdminView): the context's
  // selectedOrgId must match THIS org AND roleLoading must be settled. Without
  // the org match, switching orgs would briefly use the prior org's role +
  // assignments query key, which is wrong on both axes.
  const { memberRole, selectedOrgId, isLoading: roleLoading } =
    useMemberRoleContext();
  const isRoleSynced =
    !roleLoading &&
    Boolean(currentOrgId) &&
    selectedOrgId === currentOrgId;
  const isFullEventAccess = isRoleSynced && canViewAllEvents(memberRole);

  const myAssignmentsQuery = useQuery<{
    assignments: Array<{ event_id: string }>;
  }>({
    queryKey: ["my-event-assignments", currentOrgId],
    queryFn: async () => {
      const res = await fetch(
        `/api/organizations/${currentOrgId}/event-assignments?mine=true`,
      );
      if (!res.ok) throw new Error("Failed to load assignments");
      return res.json();
    },
    enabled: isRoleSynced && !isFullEventAccess && Boolean(currentOrgId),
    staleTime: 2 * 60 * 1000,
  });

  const assignedEventIds = useMemo<string[] | null | undefined>(() => {
    if (!isRoleSynced) return null;
    if (isFullEventAccess) return undefined;
    if (myAssignmentsQuery.data === undefined) return null;
    return myAssignmentsQuery.data.assignments.map(a => a.event_id);
  }, [isRoleSynced, isFullEventAccess, myAssignmentsQuery.data]);

  const rsvpEvents = useMemo(() => {
    // Merge primary + cohost events, dedupe by id, filter to RSVP-required.
    const byId = new Map<string, OrganizerEvent>();
    for (const e of events) byId.set(e.id, e);
    for (const entry of cohostEvents) {
      if (!byId.has(entry.event.id)) byId.set(entry.event.id, entry.event);
    }
    const baseList = Array.from(byId.values()).filter(
      e => e.requires_rsvp === true,
    );
    if (assignedEventIds === null) return [];
    if (assignedEventIds === undefined) return baseList;
    return baseList.filter(e => assignedEventIds.includes(e.id));
  }, [events, cohostEvents, assignedEventIds]);

  const { currentEvents, pastEvents } = separateEventsByDate(rsvpEvents);

  const filteredCurrent = useMemo(() => {
    if (!searchQuery.trim()) return currentEvents;
    const q = searchQuery.trim().toLowerCase();
    return currentEvents.filter((e) => e.name.toLowerCase().includes(q));
  }, [currentEvents, searchQuery]);

  const filteredPast = useMemo(() => {
    if (!searchQuery.trim()) return pastEvents;
    const q = searchQuery.trim().toLowerCase();
    return pastEvents.filter((e) => e.name.toLowerCase().includes(q));
  }, [pastEvents, searchQuery]);

  const hasNoEvents = filteredCurrent.length === 0 && filteredPast.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl leading-8 font-poppins-medium text-white-100 m-0">RSVP Management</h2>
        <p className="text-white-50 text-sm font-poppins mt-1 m-0">Review and manage ticket requests for your events</p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <FiSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white-50" />
        <input
          type="text"
          id="rsvp-events-search"
          aria-label="Search events by name"
          placeholder="Search by event name"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 bg-white-5 border border-white-10 rounded-pill pl-11 pr-4 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors"
        />
      </div>

      {rsvpEvents.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <p className="text-white-50 text-sm font-poppins text-center m-0">
            No events with RSVPs yet.
          </p>
        </div>
      ) : hasNoEvents ? (
        <div className="flex flex-col items-center py-12">
          <p className="text-white-50 text-sm font-poppins text-center m-0">
            No events match your search.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {filteredCurrent.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase m-0">
                Current &amp; upcoming events
              </h3>
              <div className="flex flex-col gap-2">
                {[...filteredCurrent]
                  .sort((a, b) => (b.pending_rsvps || 0) - (a.pending_rsvps || 0) || a.name.localeCompare(b.name))
                  .map((event) => (
                    <RsvpEventCard
                      key={event.id}
                      event={event}
                      onActions={() => router.push(`/organizer/rsvps/${event.id}${searchParams.get("org") ? `?org=${encodeURIComponent(searchParams.get("org")!)}` : ""}`)}
                    />
                  ))}
              </div>
            </div>
          )}

          {filteredPast.length > 0 && (
            <div className="flex flex-col gap-3">
              <button
                onClick={() =>
                  setExpandedSections((prev) => ({
                    ...prev,
                    rsvps: !prev.rsvps,
                  }))
                }
                className="flex items-center justify-between w-full bg-transparent border-none cursor-pointer p-0"
              >
                <h3 className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase m-0">
                  Past Events ({filteredPast.length})
                </h3>
                <span className="text-white-50 text-lg font-poppins-medium">
                  {expandedSections.rsvps ? "−" : "+"}
                </span>
              </button>

              {expandedSections.rsvps && (
                <div className="flex flex-col gap-2">
                  {[...filteredPast]
                    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
                    .map((event) => (
                      <RsvpEventCard
                        key={event.id}
                        event={event}
                        onActions={() => router.push(`/organizer/rsvps/${event.id}${searchParams.get("org") ? `?org=${encodeURIComponent(searchParams.get("org")!)}` : ""}`)}
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
