"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildOrganizerEventList,
  canViewAllEvents,
  revenueByCurrency,
  splitEventsByTime,
  totalPendingRsvps,
  type OrgMemberRole,
} from "@project-flame/lib";
import type { OrganizerData, Event as OrganizerEvent } from "../../lib/hooks/useOrganizerData";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";

export type Org = { id: string; name: string; slug: string; logo_url: string | null };

/**
 * Organizer data for v2 screens. Same endpoint, React Query key and polling as v1
 * (one cache, one source of truth); the rules live in @project-flame/lib.
 */
export function useOrganizerModel(organization: Org, role: OrgMemberRole | null) {
  const fullAccess = canViewAllEvents(role);
  const queryClient = useQueryClient();

  // Keep the shared role context in sync so v1 screens opened from here scope correctly.
  const { setSelectedOrgId } = useMemberRoleContext();
  useEffect(() => {
    setSelectedOrgId(organization.id);
  }, [organization.id, setSelectedOrgId]);

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

  const model = useMemo(() => {
    const data = dataQuery.data;
    if (!data) return null;
    const assigned = fullAccess ? undefined : assignmentsQuery.data?.assignments.map((a) => a.event_id);
    if (!fullAccess && assigned === undefined) return null;
    const list = buildOrganizerEventList<OrganizerEvent>({
      events: data.events ?? [],
      cohostEvents: data.cohost_events ?? [],
      ownerCohostAssignments: data.owner_cohost_assignments ?? [],
      assignedEventIds: assigned,
    });
    const split = splitEventsByTime(list.all);
    return {
      ...list,
      ...split,
      revenue: revenueByCurrency(list.owned),
      // Menu badge: only requests that can still be decided (events not over yet).
      pending: totalPendingRsvps(split.current),
    };
  }, [dataQuery.data, assignmentsQuery.data, fullAccess]);

  return {
    data: dataQuery.data,
    model,
    fullAccess,
    loading: dataQuery.isLoading || (!fullAccess && assignmentsQuery.isLoading),
    failed: dataQuery.isError && !dataQuery.data,
    refetch: () => dataQuery.refetch(),
    /** After a mutation: refresh v1 and v2 views (same key prefix v1 invalidates). */
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["organizer-data"], exact: false }),
  };
}
