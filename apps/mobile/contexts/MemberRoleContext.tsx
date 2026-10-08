/**
 * Context that exposes the current user's role within the selected org
 * to the entire component tree. Wraps useMemberRole so consumers call
 * useMemberRoleContext() instead of passing orgId everywhere.
 *
 * Also owns `selectedOrgId` state so all screens agree on the active org.
 */

import React, { createContext, useContext, useState, useMemo } from "react";
import { useMemberRole } from "../hooks/useMemberRole";
import { useOrgData } from "../hooks/useOrgData";
import type { OrgMemberRole } from "@project-flame/lib";

interface MemberRoleContextValue {
  /** The user's role in the currently selected org. */
  memberRole: OrgMemberRole | null;
  /** Convenience: owner or admin. */
  isOwnerOrAdmin: boolean;
  /** True while the role query is in flight. */
  isLoading: boolean;
  /** The effective org ID (selected or default first org). */
  selectedOrgId: string | null;
  /** Update the selected org (e.g. from OrgSelector). */
  setSelectedOrgId: (id: string | null) => void;
}

const MemberRoleCtx = createContext<MemberRoleContextValue>({
  memberRole: null,
  isOwnerOrAdmin: false,
  isLoading: true,
  selectedOrgId: null,
  setSelectedOrgId: () => {},
});

export function MemberRoleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // Calling useOrgData(selectedOrgId) here pre-warms the TanStack Query cache for
  // the selected org. When selectedOrgId is null it falls back to the oldest membership
  // (same as calling useOrgData() with no arg). This means by the time the user
  // navigates to org-event-detail, useOrgData(selectedOrgId) is already cached and
  // useOrgEnrichedAll can start its API call immediately without a sequential DB round-trip.
  const { data: orgData } = useOrgData(selectedOrgId);

  const effectiveOrgId = selectedOrgId ?? orgData?.organizationId ?? null;
  const { memberRole, isLoading } = useMemberRole(effectiveOrgId);

  const isOwnerOrAdmin =
    memberRole === "owner" || memberRole === "admin";

  const value = useMemo(
    () => ({
      memberRole,
      isOwnerOrAdmin,
      isLoading,
      selectedOrgId: effectiveOrgId,
      setSelectedOrgId,
    }),
    [memberRole, isOwnerOrAdmin, isLoading, effectiveOrgId, setSelectedOrgId],
  );

  return (
    <MemberRoleCtx.Provider value={value}>
      {children}
    </MemberRoleCtx.Provider>
  );
}

export function useMemberRoleContext(): MemberRoleContextValue {
  return useContext(MemberRoleCtx);
}
