/**
 * Bottom sheet for assigning co-host organizations to an event.
 *
 * Shows current co-hosts with remove option + org search to add new ones.
 * Entry point: org-event-detail screen "Co-hosts" row.
 */

import { useState, useMemo, useCallback } from "react";
import {
  Modal,
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";
import {
  useEventAssignments,
  useAssignCohostOrg,
  useRemoveAssignment,
} from "../../hooks/useEventAssignments";
import { useSearchApprovedOrganizations } from "../../hooks/useSearchApprovedOrganizations";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { getAuthenticatedClient } from "../../lib/supabase-auth";
import type { OrganizationPublic } from "@project-flame/lib";

interface CoHostAssignmentSheetProps {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  eventId: string;
  eventName: string;
}

export function CoHostAssignmentSheet({
  visible,
  onClose,
  orgId,
  eventId,
  eventName,
}: CoHostAssignmentSheetProps) {
  const { data: assignments, isLoading: assignmentsLoading } = useEventAssignments(orgId);
  const assignCohost = useAssignCohostOrg(orgId);
  const removeAssignment = useRemoveAssignment(orgId);
  const { getToken, userId: clerkId } = useOptionalAuth();

  const [searchQuery, setSearchQuery] = useState("");

  // Current co-hosts for this event
  const currentCohosts = useMemo(() => {
    if (!assignments) return [];
    return assignments.filter(
      (a) =>
        a.event_id === eventId && a.cohost_organization_id != null
    );
  }, [assignments, eventId]);

  const currentCohostIds = useMemo(
    () => currentCohosts.map((c) => c.cohost_organization_id!),
    [currentCohosts]
  );

  // Exclude own org + already-added co-hosts from search
  const excludeIds = useMemo(
    () => [orgId, ...currentCohostIds],
    [orgId, currentCohostIds]
  );

  const { results, searching, error, search, clearResults } =
    useSearchApprovedOrganizations(excludeIds);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      search(text);
    },
    [search]
  );

  const handleClose = useCallback(() => {
    setSearchQuery("");
    clearResults();
    onClose();
  }, [onClose, clearResults]);

  const handleAddCohost = useCallback(
    async (org: OrganizationPublic) => {
      if (!clerkId) {
        Alert.alert("Error", "You must be signed in to add a co-host.");
        return;
      }
      try {
        // Resolve current user's internal ID for assigned_by
        const client = await getAuthenticatedClient(getToken);
        const { data: currentUser, error: userError } = await client
          .from("users")
          .select("id")
          .eq("clerk_id", clerkId)
          .maybeSingle();

        if (userError || !currentUser) {
          throw new Error("Could not resolve your user account.");
        }

        await assignCohost.mutateAsync({
          eventId,
          cohostOrgId: org.id,
          assignedBy: currentUser.id,
        });

        // Clear search after successful add
        setSearchQuery("");
        clearResults();
      } catch (err) {
        Alert.alert(
          "Error",
          err instanceof Error ? err.message : "Failed to add co-host."
        );
      }
    },
    [eventId, assignCohost, getToken, clerkId, clearResults]
  );

  const handleRemoveCohost = useCallback(
    (assignmentId: string, orgName: string) => {
      Alert.alert(
        "Remove Co-host",
        `Remove ${orgName} as co-host for this event?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              removeAssignment.mutate(
                { assignmentId },
                {
                  onError: (err) =>
                    Alert.alert(
                      "Error",
                      err.message || "Failed to remove co-host."
                    ),
                }
              );
            },
          },
        ]
      );
    },
    [removeAssignment]
  );

  const isMutating = assignCohost.isPending || removeAssignment.isPending;
  // Disable search/add until assignments are loaded so excludeIds is complete
  const isSearchDisabled = isMutating || assignmentsLoading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Scrim */}
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
        />

        <View
          className="bg-surface rounded-t-[28px]"
          style={{ maxHeight: "80%" }}
        >
          {/* Drag handle */}
          <View
            style={{
              alignItems: "center",
              paddingTop: 12,
              paddingBottom: 4,
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(255,255,255,0.2)",
              }}
            />
          </View>

          {/* Close button */}
          <View
            style={{
              alignItems: "flex-end",
              paddingHorizontal: 20,
              paddingTop: 4,
            }}
          >
            <Pressable
              onPress={handleClose}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={colors["white-50"]}
                />
              </View>
            </Pressable>
          </View>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={{ paddingHorizontal: 24, paddingTop: 8, gap: 20 }}>
              {/* Title */}
              <View style={{ gap: 4 }}>
                <FlameText
                  variant="h3"
                  className="text-white-100 font-poppins-semibold"
                >
                  Co-hosts
                </FlameText>
                <FlameText
                  variant="subtitle2-light"
                  className="text-white-50"
                  numberOfLines={1}
                >
                  {eventName}
                </FlameText>
              </View>

              {/* Current co-hosts */}
              {currentCohosts.length > 0 && (
                <View style={{ gap: 10 }}>
                  <FlameText
                    variant="subtitle2"
                    className="text-white-50 font-poppins-medium uppercase"
                    style={{ letterSpacing: 0.8 }}
                  >
                    Current Co-hosts
                  </FlameText>
                  {currentCohosts.map((cohost) => (
                    <View
                      key={cohost.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: "rgba(255,255,255,0.05)",
                        borderRadius: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.08)",
                      }}
                    >
                      {/* Org initial */}
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: "#238FDA20",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <FlameText
                          variant="subtitle1"
                          className="font-poppins-semibold"
                          style={{ color: "#238FDA" }}
                        >
                          {(cohost.cohost_org_name ?? "?")
                            .charAt(0)
                            .toUpperCase()}
                        </FlameText>
                      </View>
                      <FlameText
                        variant="subtitle1"
                        className="text-white-100 font-poppins-medium flex-1"
                        numberOfLines={1}
                      >
                        {cohost.cohost_org_name ?? "Unknown org"}
                      </FlameText>
                      <Pressable
                        onPress={() =>
                          handleRemoveCohost(
                            cohost.id,
                            cohost.cohost_org_name ?? "this organization"
                          )
                        }
                        hitSlop={8}
                        disabled={isMutating}
                      >
                        <Ionicons
                          name="close-circle"
                          size={22}
                          color="#FF6B6B"
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* Search */}
              <View style={{ gap: 12 }}>
                <FlameText
                  variant="subtitle2"
                  className="text-white-50 font-poppins-medium uppercase"
                  style={{ letterSpacing: 0.8 }}
                >
                  Add Co-host Organization
                </FlameText>
                <TextInput
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  placeholder="Search by organization name..."
                  placeholderTextColor={colors["white-30"]}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: colors["white-100"],
                    fontSize: 16,
                    fontFamily: "Poppins_400Regular",
                    borderRadius: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.1)",
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSearchDisabled}
                />
              </View>

              {/* Search loading */}
              {searching && (
                <View style={{ alignItems: "center", paddingVertical: 12 }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              )}

              {/* Search error */}
              {error && (
                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                >
                  <FlameText variant="subtitle1" className="text-white-50">
                    {error}
                  </FlameText>
                </View>
              )}

              {/* Search results — guard on searchQuery to prevent stale results after clearing */}
              {results.length > 0 && searchQuery.trim().length > 0 && (
                <View style={{ gap: 8 }}>
                  {results.map((org) => (
                    <View
                      key={org.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: "rgba(255,255,255,0.05)",
                        borderRadius: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.08)",
                      }}
                    >
                      {/* Org initial */}
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: "rgba(255,255,255,0.08)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <FlameText
                          variant="subtitle1"
                          className="text-white-80 font-poppins-semibold"
                        >
                          {org.name.charAt(0).toUpperCase()}
                        </FlameText>
                      </View>
                      <View style={{ flex: 1 }}>
                        <FlameText
                          variant="subtitle1"
                          className="text-white-100 font-poppins-medium"
                          numberOfLines={1}
                        >
                          {org.name}
                        </FlameText>
                        {org.city && (
                          <FlameText
                            variant="subtitle2-light"
                            className="text-white-50"
                            numberOfLines={1}
                          >
                            {org.city}
                          </FlameText>
                        )}
                      </View>
                      <Pressable
                        onPress={() => handleAddCohost(org)}
                        disabled={isSearchDisabled}
                        style={{
                          backgroundColor: "#238FDA",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          opacity: isSearchDisabled ? 0.45 : 1,
                        }}
                      >
                        <FlameText
                          variant="subtitle2"
                          className="text-white-100 font-poppins-medium"
                        >
                          Add
                        </FlameText>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* No results */}
              {!searching &&
                searchQuery.trim().length > 0 &&
                results.length === 0 &&
                !error && (
                  <FlameText
                    variant="subtitle1"
                    className="text-white-50 text-center"
                    style={{ paddingVertical: 12 }}
                  >
                    No organizations found
                  </FlameText>
                )}

              {/* Bottom spacing */}
              <View style={{ height: 24 }} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
