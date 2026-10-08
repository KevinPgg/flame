/**
 * Mutations for managing organization members.
 *
 * Provides addMember, updateRole, and removeMember operations.
 * addMember and updateRole use Supabase directly (RLS-protected).
 * removeMember calls the server API (/api/organizations/members/remove)
 * so that authorization is enforced server-side.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { apiPost, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";
import type { OrgMemberRole } from "@project-flame/lib";

interface AddMemberInput {
  userId: string;
  role: OrgMemberRole;
}

interface UpdateRoleInput {
  memberId: string;
  userId: string;
  newRole: OrgMemberRole;
}

interface RemoveMemberInput {
  memberId: string;
}

export function useAddMember(orgId: string) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<void, Error, AddMemberInput>({
    mutationFn: async ({ userId, role }) => {
      const client = await getAuthenticatedClient(getToken);
      const { error } = await client.from("organization_members").insert({
        organization_id: orgId,
        user_id: userId,
        role,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
    },
  });
}

export function useUpdateMemberRole(orgId: string) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<void, Error, UpdateRoleInput>({
    mutationFn: async ({ memberId, userId, newRole }) => {
      const client = await getAuthenticatedClient(getToken);
      const { error } = await client
        .from("organization_members")
        .update({ role: newRole })
        .eq("id", memberId);
      if (error) throw new Error(error.message);

      // Clean up event_assignments when changing away from organizer.
      // Assignments are only meaningful for organizer-role members; admins/viewers
      // have full or no event access respectively and don't use assigned-events filtering.
      // Best-effort: don't fail the role update if cleanup errors.
      if (newRole !== "organizer") {
        await client
          .from("event_assignments")
          .delete()
          .eq("user_id", userId)
          .eq("organization_id", orgId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["member-role"] });
      queryClient.invalidateQueries({ queryKey: ["event-assignments", orgId] });
      queryClient.invalidateQueries({ queryKey: ["assigned-events"] });
    },
  });
}

export function useRemoveMember(orgId: string) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  return useMutation<void, ApiError | Error, RemoveMemberInput>({
    mutationFn: ({ memberId }) =>
      apiPost<void>(
        "/api/organizations/members/remove",
        { orgId, memberId },
        getToken
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["member-role"] });
      queryClient.invalidateQueries({ queryKey: ["event-assignments", orgId] });
      queryClient.invalidateQueries({ queryKey: ["assigned-events"] });
    },
  });
}
