/**
 * Queries and mutations for event assignments (individual organizers + co-host orgs).
 *
 * Uses Supabase directly — RLS ensures only owner/admin can INSERT/DELETE,
 * while all org members can SELECT.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";
import type { EventAssignment } from "@project-flame/lib";

export function useEventAssignments(orgId: string | null | undefined) {
  const { getToken, isSignedIn, isConfigured } = useOptionalAuth();

  return useQuery<EventAssignment[]>({
    queryKey: ["event-assignments", orgId],
    queryFn: async () => {
      const client = await getAuthenticatedClient(getToken);

      const { data, error } = await client
        .from("event_assignments")
        .select(
          `
          id,
          event_id,
          user_id,
          organization_id,
          cohost_organization_id,
          assigned_by,
          created_at,
          events:event_id ( name ),
          cohost_org:cohost_organization_id ( name ),
          source_org:organization_id ( name )
        `
        )
        .eq("organization_id", orgId!);

      if (error) throw error;

      return (data ?? []).map((row: Record<string, unknown>) => {
        const event = row.events as Record<string, unknown> | null;
        const cohostOrg = row.cohost_org as Record<string, unknown> | null;
        const sourceOrg = row.source_org as Record<string, unknown> | null;
        return {
          id: row.id as string,
          event_id: row.event_id as string,
          user_id: (row.user_id as string) ?? null,
          organization_id: row.organization_id as string,
          cohost_organization_id:
            (row.cohost_organization_id as string) ?? null,
          assigned_by: row.assigned_by as string,
          created_at: row.created_at as string,
          event_name: (event?.name as string) ?? undefined,
          cohost_org_name: (cohostOrg?.name as string) ?? undefined,
          source_org_name: (sourceOrg?.name as string) ?? undefined,
        } satisfies EventAssignment;
      });
    },
    enabled: Boolean(isSignedIn && isConfigured && orgId),
    staleTime: 2 * 60 * 1000,
  });
}

// --- Mutations ---

interface AssignUserInput {
  eventId: string;
  userId: string;
  assignedBy: string;
}

interface AssignCohostInput {
  eventId: string;
  cohostOrgId: string;
  assignedBy: string;
}

interface RemoveAssignmentInput {
  assignmentId: string;
}

export function useAssignUserToEvent(orgId: string) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<void, Error, AssignUserInput>({
    mutationFn: async ({ eventId, userId, assignedBy }) => {
      const client = await getAuthenticatedClient(getToken);
      const { error } = await client.from("event_assignments").insert({
        event_id: eventId,
        user_id: userId,
        organization_id: orgId,
        assigned_by: assignedBy,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-assignments", orgId] });
      queryClient.invalidateQueries({ queryKey: ["assigned-events"] });
    },
  });
}

export function useAssignCohostOrg(orgId: string) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<void, Error, AssignCohostInput>({
    mutationFn: async ({ eventId, cohostOrgId, assignedBy }) => {
      const client = await getAuthenticatedClient(getToken);
      const { error } = await client.from("event_assignments").insert({
        event_id: eventId,
        organization_id: orgId,
        cohost_organization_id: cohostOrgId,
        assigned_by: assignedBy,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-assignments", orgId] });
      queryClient.invalidateQueries({ queryKey: ["assigned-events"] });
    },
  });
}

export function useRemoveAssignment(orgId: string) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<void, Error, RemoveAssignmentInput>({
    mutationFn: async ({ assignmentId }) => {
      const client = await getAuthenticatedClient(getToken);
      const { error } = await client
        .from("event_assignments")
        .delete()
        .eq("id", assignmentId)
        .eq("organization_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-assignments", orgId] });
      queryClient.invalidateQueries({ queryKey: ["assigned-events"] });
    },
  });
}
