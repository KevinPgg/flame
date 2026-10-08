/**
 * Team Members screen — lists all org members with role badges.
 *
 * Owner/admin can: add members (+), change roles, remove members.
 * Navigated to from OrgSelector "Manage" button.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { z } from "zod";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";
import { canManageMembers } from "@project-flame/lib";
import { DashboardBar } from "../components/dashboard/DashboardBar";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { useOrgMembers } from "../hooks/useOrgMembers";
import { useOrgData } from "../hooks/useOrgData";
import { useMemberRole } from "../hooks/useMemberRole";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";
import { useRemoveMember } from "../hooks/useManageMembers";
import { useEventAssignments } from "../hooks/useEventAssignments";
import { AddMemberSheet } from "../components/org-members/AddMemberSheet";
import { EditRoleSheet } from "../components/org-members/EditRoleSheet";
import { EventAssignmentSheet } from "../components/org-members/EventAssignmentSheet";
import { DropdownMenu } from "../components/org-members/DropdownMenu";
import { RequireAuthGate } from "../hooks/useRequireAuth";
import type { OrganizationMember, OrgMemberRole } from "@project-flame/lib";

const orgIdSchema = z.string().uuid();

// ── Role badge colors ──
const ROLE_COLORS: Record<OrgMemberRole, string> = {
  owner: colors["white-50"],
  admin: "#238FDA",
  organizer: "#5DDBB1",
  viewer: colors["white-50"],
};

const ROLE_LABELS: Record<OrgMemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  organizer: "Organizer",
  viewer: "Viewer",
};

function getInitials(member: OrganizationMember): string {
  const first = member.user_first_name?.charAt(0) ?? "";
  const last = member.user_last_name?.charAt(0) ?? "";
  if (first || last) return (first + last).toUpperCase();
  return (member.user_email?.charAt(0) ?? "?").toUpperCase();
}

function getDisplayName(member: OrganizationMember): string {
  const parts = [member.user_first_name, member.user_last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return member.user_email ?? "Unknown";
}

export default function OrgMembersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ orgId?: string | string[] }>();
  const rawOrgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
  const orgIdResult = orgIdSchema.safeParse(rawOrgId);
  const validatedOrgId = orgIdResult.success ? orgIdResult.data : "";
  const { setSelectedOrgId } = useMemberRoleContext();

  // Pin shared context to this route's org so any downstream sheet/screen
  // opened from here (e.g. remove-member confirm) stays on the same org.
  const syncedOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (validatedOrgId && syncedOrgIdRef.current !== validatedOrgId) {
      syncedOrgIdRef.current = validatedOrgId;
      setSelectedOrgId(validatedOrgId);
    }
  }, [validatedOrgId, setSelectedOrgId]);

  const {
    memberRole,
    isLoading: roleLoading,
    error: roleError,
    refetch: refetchRole,
  } = useMemberRole(validatedOrgId || undefined);
  const { data: orgData } = useOrgData(validatedOrgId || null);
  const isAdmin = canManageMembers(memberRole);

  // Only fetch members after role is confirmed and user is admin.
  // Passing null disables the query so non-admins never trigger the DB call.
  const {
    data: members,
    isLoading: membersLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useOrgMembers(!roleLoading && isAdmin ? validatedOrgId : null);
  const removeMember = useRemoveMember(validatedOrgId);
  const {
    data: assignments,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
  } = useEventAssignments(!roleLoading && isAdmin ? validatedOrgId : null);

  // Build a map of user_id → assignment count for organizer badge display
  const assignmentCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (assignments) {
      for (const a of assignments) {
        if (a.user_id) {
          map.set(a.user_id, (map.get(a.user_id) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [assignments]);

  const isLoading = roleLoading || membersLoading;

  // Sheet state
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [editMember, setEditMember] = useState<OrganizationMember | null>(null);
  const [assignMember, setAssignMember] = useState<OrganizationMember | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const handleRemove = useCallback(
    (member: OrganizationMember) => {
      setMenuOpenId(null);
      const name = getDisplayName(member);
      Alert.alert(
        "Remove Member",
        `Are you sure you want to remove ${name} from this organization?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              removeMember.mutate(
                { memberId: member.id },
                {
                  onSuccess: () =>
                    Alert.alert("Success", `${name} has been removed.`),
                  onError: (err) =>
                    Alert.alert("Error", err.message || "Failed to remove member."),
                },
              );
            },
          },
        ],
      );
    },
    [removeMember],
  );

  const handleEditRole = useCallback((member: OrganizationMember) => {
    setMenuOpenId(null);
    setEditMember(member);
  }, []);

  const handleAssignEvents = useCallback((member: OrganizationMember) => {
    setMenuOpenId(null);
    setAssignMember(member);
  }, []);

  const renderMember = useCallback(
    ({ item }: { item: OrganizationMember }) => {
      const isOwnerRow = item.role === "owner";
      const showMenu = isAdmin && !isOwnerRow;
      const menuOpen = menuOpenId === item.id;

      return (
        <View className="flex-row items-center px-6 py-3 gap-3">
          {/* Initials avatar */}
          <View
            className="items-center justify-center rounded-full bg-white-10"
            style={{ width: 44, height: 44 }}
          >
            <FlameText
              variant="subtitle1"
              className="text-white-80 font-poppins-semibold"
            >
              {getInitials(item)}
            </FlameText>
          </View>

          {/* Name, email, role badge */}
          <View className="flex-1 min-w-0 gap-1">
            <FlameText
              variant="subtitle1"
              className="text-white-100 font-poppins-medium"
              numberOfLines={1}
            >
              {getDisplayName(item)}
            </FlameText>
            {item.user_email && (
              <FlameText
                variant="subtitle2-light"
                className="text-white-50"
                numberOfLines={1}
              >
                {item.user_email}
              </FlameText>
            )}
            <FlameText
              variant="subtitle2-light"
              className="font-poppins-medium"
              style={{ color: ROLE_COLORS[item.role] }}
            >
              {ROLE_LABELS[item.role]}
              {item.role === "organizer" &&
                !assignmentsLoading &&
                !assignmentsError &&
                (() => {
                  const count = assignmentCountMap.get(item.user_id) ?? 0;
                  return count > 0
                    ? ` — ${count} event${count !== 1 ? "s" : ""} assigned`
                    : " — No events assigned";
                })()}
            </FlameText>
          </View>

          {/* Kebab menu */}
          {showMenu && (
            <View style={{ position: "relative" }}>
              <Pressable
                onPress={() => setMenuOpenId(menuOpen ? null : item.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Member options"
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={20}
                  color={colors["white-50"]}
                />
              </Pressable>

              <DropdownMenu open={menuOpen}>
                  <Pressable
                    onPress={() => handleEditRole(item)}
                    className="px-4 py-3"
                  >
                    <FlameText
                      variant="subtitle1"
                      className="text-white-100"
                    >
                      Change Role
                    </FlameText>
                  </Pressable>
                  <View
                    style={{
                      height: 1,
                      backgroundColor: "rgba(255,255,255,0.08)",
                      marginHorizontal: 12,
                    }}
                  />
                  {item.role === "organizer" && (
                    <>
                      <Pressable
                        onPress={() => handleAssignEvents(item)}
                        className="px-4 py-3"
                      >
                        <FlameText
                          variant="subtitle1"
                          className="text-white-100"
                        >
                          Assign Events
                        </FlameText>
                      </Pressable>
                      <View
                        style={{
                          height: 1,
                          backgroundColor: "rgba(255,255,255,0.08)",
                          marginHorizontal: 12,
                        }}
                      />
                    </>
                  )}
                  <Pressable
                    onPress={() => handleRemove(item)}
                    className="px-4 py-3"
                  >
                    <FlameText variant="subtitle1" style={{ color: "#FF6B6B" }}>
                      Remove
                    </FlameText>
                  </Pressable>
              </DropdownMenu>
            </View>
          )}
        </View>
      );
    },
    [isAdmin, menuOpenId, assignmentCountMap, assignmentsLoading, assignmentsError, handleEditRole, handleAssignEvents, handleRemove],
  );

  // Guard: invalid or missing orgId means this is a bad link — show error UI.
  if (!orgIdResult.success) {
    return (
      <RequireAuthGate>
        <View className="flex-1 bg-background">
          <DashboardBar title="Team Members" onBack={() => router.back()} avatarUrl={orgData?.logoUrl} />
          <View className="flex-1 items-center justify-center px-6 gap-4">
            <Ionicons name="link-outline" size={40} color={colors["white-30"]} />
            <FlameText variant="subtitle1" className="text-white-50 text-center">
              Invalid or missing organization link
            </FlameText>
          </View>
        </View>
      </RequireAuthGate>
    );
  }

  return (
    <RequireAuthGate>
      <View className="flex-1 bg-background">
        <DashboardBar title="Team Members" onBack={() => router.back()} avatarUrl={orgData?.logoUrl} />

        {/* Dismiss open menu on tap */}
        <Pressable
          style={{ flex: 1 }}
          onPress={() => menuOpenId && setMenuOpenId(null)}
          disabled={!menuOpenId}
        >
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : roleError ? (
            <View className="flex-1 items-center justify-center px-6 gap-4">
              <Ionicons
                name="alert-circle-outline"
                size={40}
                color={colors["white-30"]}
              />
              <FlameText variant="subtitle1" className="text-white-50 text-center">
                Failed to verify your permissions
              </FlameText>
              <Pressable
                onPress={() => refetchRole()}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: colors["white-10"],
                }}
              >
                <FlameText variant="subtitle1" className="text-white-80">
                  Retry
                </FlameText>
              </Pressable>
            </View>
          ) : !isAdmin ? (
            <View className="flex-1 items-center justify-center px-6 gap-4">
              <Ionicons
                name="lock-closed-outline"
                size={40}
                color={colors["white-30"]}
              />
              <FlameText variant="subtitle1" className="text-white-50 text-center">
                Only org owners and admins can manage team members
              </FlameText>
            </View>
          ) : membersError ? (
            <View className="flex-1 items-center justify-center px-6 gap-4">
              <Ionicons
                name="alert-circle-outline"
                size={40}
                color={colors["white-30"]}
              />
              <FlameText variant="subtitle1" className="text-white-50 text-center">
                Failed to load team members
              </FlameText>
              <Pressable
                onPress={() => refetchMembers()}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: colors["white-10"],
                }}
              >
                <FlameText variant="subtitle1" className="text-white-80">
                  Retry
                </FlameText>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={members ?? []}
              keyExtractor={(item) => item.id}
              renderItem={renderMember}
              contentContainerStyle={{
                paddingTop: 8,
                paddingBottom: getTabBarPaddingBottom(insets.bottom),
              }}
              ListEmptyComponent={
                <View className="items-center justify-center py-16">
                  <Ionicons
                    name="people-outline"
                    size={48}
                    color={colors["white-30"]}
                  />
                  <FlameText
                    variant="subtitle1"
                    className="text-white-30 mt-4"
                  >
                    No team members yet
                  </FlameText>
                </View>
              }
            />
          )}
        </Pressable>

        {/* Add member FAB */}
        {isAdmin && (
          <Pressable
            onPress={() => setAddSheetVisible(true)}
            style={{
              position: "absolute",
              bottom: getTabBarPaddingBottom(insets.bottom) + 16,
              right: 24,
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors["white-100"],
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
            accessibilityRole="button"
            accessibilityLabel="Add team member"
          >
            <Ionicons name="add" size={28} color={colors.dark} />
          </Pressable>
        )}

        {/* Add member sheet */}
        <AddMemberSheet
          visible={addSheetVisible}
          onClose={() => setAddSheetVisible(false)}
          orgId={validatedOrgId}
        />

        {/* Edit role sheet */}
        <EditRoleSheet
          visible={!!editMember}
          onClose={() => setEditMember(null)}
          member={editMember}
          orgId={validatedOrgId}
        />

        {/* Event assignment sheet */}
        <EventAssignmentSheet
          visible={!!assignMember}
          onClose={() => setAssignMember(null)}
          orgId={validatedOrgId}
          memberId={assignMember?.user_id ?? ""}
          memberName={assignMember ? getDisplayName(assignMember) : ""}
        />
      </View>
    </RequireAuthGate>
  );
}
