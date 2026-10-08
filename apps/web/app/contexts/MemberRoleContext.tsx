"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { OrgMemberRole } from "@project-flame/lib";
import { useUserOrganizations } from "../lib/hooks/useOrganizations";

interface MemberRoleContextValue {
  memberRole: OrgMemberRole | null;
  isOwnerOrAdmin: boolean;
  isLoading: boolean;
  selectedOrgId: string | null;
  setSelectedOrgId: (id: string | null) => void;
}

const MemberRoleCtx = createContext<MemberRoleContextValue>({
  memberRole: null,
  isOwnerOrAdmin: false,
  isLoading: true,
  selectedOrgId: null,
  setSelectedOrgId: () => {},
});

export function MemberRoleProvider({ children }: { children: ReactNode }) {
  const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(null);
  const orgsQuery = useUserOrganizations();
  const orgs = orgsQuery.data?.organizations;
  const isLoading = orgsQuery.isLoading;

  const setSelectedOrgId = useCallback((id: string | null) => {
    setSelectedOrgIdState(id);
  }, []);

  const effectiveOrgId = selectedOrgId ?? orgs?.[0]?.id ?? null;

  const memberRole = useMemo<OrgMemberRole | null>(() => {
    if (!effectiveOrgId || !orgs) return null;
    const match = orgs.find(o => o.id === effectiveOrgId);
    return (match?.role as OrgMemberRole) ?? null;
  }, [orgs, effectiveOrgId]);

  const isOwnerOrAdmin = memberRole === "owner" || memberRole === "admin";

  const value = useMemo<MemberRoleContextValue>(
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
    <MemberRoleCtx.Provider value={value}>{children}</MemberRoleCtx.Provider>
  );
}

export function useMemberRoleContext(): MemberRoleContextValue {
  return useContext(MemberRoleCtx);
}
