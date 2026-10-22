/**
 * Organizer data for the v2 screens of the app. Same endpoints, rules and polling as the web v2
 * (apps/web/app/v2/organizer/useOrganizerModel.ts); the rules live in @project-flame/lib.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildOrganizerEventList,
  canViewAllEvents,
  revenueByCurrency,
  splitEventsByTime,
  totalPendingRsvps,
} from "@project-flame/lib";
import { apiGet } from "../../lib/api";
import { useOptionalAuth } from "../useOptionalAuth";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";
import type { MyOrganization, MyOrganizationsResponse, OrganizerDataResponse } from "../../lib/v2/organizer-api";

/** The person's organizations (GET /api/organizations). */
export function useMyOrganizations() {
  const { getToken, isSignedIn } = useOptionalAuth();
  return useQuery<MyOrganizationsResponse>({
    queryKey: ["v2", "organizations"],
    queryFn: () => apiGet<MyOrganizationsResponse>("/api/organizations", getToken),
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });
}

/**
 * Approved organization matching the slug (or, without slug, the id); `undefined` while loading,
 * `null` once loaded if the person can't open it (not a member, pending approval, rejected).
 */
export function findOrganization(
  data: MyOrganizationsResponse | undefined,
  { slug, id }: { slug?: string; id?: string },
): MyOrganization | null | undefined {
  if (!data) return undefined;
  if (!slug && !id) return null;
  return data.organizations.find((o) => o.approved && (slug ? o.slug === slug : o.id === id)) ?? null;
}

export function useOrganizerModel(organization: MyOrganization) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();
  const fullAccess = canViewAllEvents(organization.role);

  // v1 screens opened from v2 (until their entrega) read the organization from this context.
  const { setSelectedOrgId } = useMemberRoleContext();
  useEffect(() => {
    setSelectedOrgId(organization.id);
  }, [organization.id, setSelectedOrgId]);

  const dataQuery = useQuery<OrganizerDataResponse>({
    queryKey: ["v2", "organizer-data", organization.slug],
    queryFn: () =>
      apiGet<OrganizerDataResponse>(`/api/organizer/data?org=${encodeURIComponent(organization.slug)}`, getToken),
    staleTime: 30_000,
    refetchInterval: 15_000,
    placeholderData: (previous) => previous,
  });

  // Organizer role: only the events assigned to them (same endpoint as the web).
  const assignmentsQuery = useQuery<{ assignments: Array<{ event_id: string }> }>({
    queryKey: ["v2", "my-event-assignments", organization.id],
    queryFn: () => apiGet(`/api/organizations/${organization.id}/event-assignments?mine=true`, getToken),
    enabled: !fullAccess,
    staleTime: 2 * 60 * 1000,
  });

  const model = useMemo(() => {
    const data = dataQuery.data;
    if (!data) return null;
    const assigned = fullAccess ? undefined : assignmentsQuery.data?.assignments.map((a) => a.event_id);
    if (!fullAccess && assigned === undefined) return null;
    const list = buildOrganizerEventList({
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
    failed: (dataQuery.isError && !dataQuery.data) || assignmentsQuery.isError,
    refetch: () => {
      dataQuery.refetch();
      if (!fullAccess) assignmentsQuery.refetch();
    },
    refreshing: dataQuery.isRefetching,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["v2", "organizer-data"] }),
  };
}
