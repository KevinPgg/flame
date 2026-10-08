/**
 * Bottom sheet for assigning an organizer member to events.
 *
 * Shows org's current & upcoming events with checkboxes.
 * Pre-checks events already assigned to the member.
 * Save button batches assign/remove mutations.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";
import {
  separateEventsByDate,
  formatEventDate,
  isValidIanaTimezone,
} from "@project-flame/lib";
import { useOrgEvents, type OrgEvent } from "../../hooks/useOrgEvents";
import {
  useEventAssignments,
  useAssignUserToEvent,
  useRemoveAssignment,
} from "../../hooks/useEventAssignments";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { getAuthenticatedClient } from "../../lib/supabase-auth";

interface EventAssignmentSheetProps {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  /** Internal user UUID of the member being assigned */
  memberId: string;
  memberName: string;
}

export function EventAssignmentSheet({
  visible,
  onClose,
  orgId,
  memberId,
  memberName,
}: EventAssignmentSheetProps) {
  const { data: orgEvents, isLoading: eventsLoading, error: eventsError } = useOrgEvents(orgId);
  const { data: assignments, isLoading: assignmentsLoading, error: assignmentsError } =
    useEventAssignments(orgId);
  const assignUser = useAssignUserToEvent(orgId);
  const removeAssignment = useRemoveAssignment(orgId);
  const { getToken, userId: clerkId } = useOptionalAuth();

  // Track which event IDs are checked (toggled in local state)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Currently assigned event IDs for this member
  const assignedEventIds = useMemo(() => {
    if (!assignments) return new Set<string>();
    return new Set(
      assignments
        .filter((a) => a.user_id === memberId)
        .map((a) => a.event_id)
    );
  }, [assignments, memberId]);

  // Sync local checked state only once per sheet open, and only after
  // assignments have finished loading. Uses two refs:
  //   prevVisibleRef  — detects the closed → open transition
  //   initializedRef  — ensures we seed checkedIds exactly once per open session
  //                     even when data arrives after the sheet becomes visible
  const prevVisibleRef = useRef(false);
  const initializedRef = useRef(false);
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    // Reset initialization flag when the sheet closes
    if (!visible) {
      initializedRef.current = false;
      return;
    }

    // Mark un-initialized on every fresh open so we seed once data is ready
    if (visible && !wasVisible) {
      initializedRef.current = false;
    }

    // Seed checkedIds when visible and assignments are loaded, but only once
    if (visible && !initializedRef.current && !assignmentsLoading) {
      setCheckedIds(new Set(assignedEventIds));
      initializedRef.current = true;
    }
  }, [visible, assignedEventIds, assignmentsLoading]);

  // Current & upcoming events only
  const currentEvents = useMemo(() => {
    if (!orgEvents) return [];
    const { currentEvents: current } = separateEventsByDate(orgEvents);
    return current;
  }, [orgEvents]);

  const isLoading = eventsLoading || assignmentsLoading;
  const isError = Boolean(eventsError || assignmentsError);
  const isMutating = assignUser.isPending || removeAssignment.isPending;

  const toggleEvent = useCallback((eventId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const hasChanges = useMemo(() => {
    if (checkedIds.size !== assignedEventIds.size) return true;
    for (const id of checkedIds) {
      if (!assignedEventIds.has(id)) return true;
    }
    return false;
  }, [checkedIds, assignedEventIds]);

  const handleSave = useCallback(async () => {
    if (!hasChanges) {
      onClose();
      return;
    }

    if (!clerkId) {
      Alert.alert("Error", "You must be signed in to save assignments.");
      return;
    }

    setSaving(true);
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

      // Determine adds and removes
      const toAdd = [...checkedIds].filter((id) => !assignedEventIds.has(id));
      const toRemove = [...assignedEventIds].filter(
        (id) => !checkedIds.has(id)
      );

      // Find assignment IDs for removals
      const removePromises = toRemove.map((eventId) => {
        const assignment = assignments?.find(
          (a) => a.event_id === eventId && a.user_id === memberId
        );
        if (!assignment) return Promise.resolve();
        return removeAssignment.mutateAsync({
          assignmentId: assignment.id,
        });
      });

      const addPromises = toAdd.map((eventId) =>
        assignUser.mutateAsync({
          eventId,
          userId: memberId,
          assignedBy: currentUser.id,
        })
      );

      await Promise.all([...removePromises, ...addPromises]);

      Alert.alert(
        "Success",
        `Event assignments updated for ${memberName}.`
      );
      onClose();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to update assignments."
      );
    } finally {
      setSaving(false);
    }
  }, [
    hasChanges,
    checkedIds,
    assignedEventIds,
    assignments,
    memberId,
    memberName,
    assignUser,
    removeAssignment,
    getToken,
    clerkId,
    onClose,
  ]);

  const renderEvent = useCallback(
    ({ item }: { item: OrgEvent }) => {
      const checked = checkedIds.has(item.id);
      const rawTz = item.timezone?.trim() ?? "";
      const tz = isValidIanaTimezone(rawTz) ? rawTz : undefined;

      return (
        <Pressable
          onPress={() => toggleEvent(item.id)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            paddingVertical: 14,
            paddingHorizontal: 24,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.06)",
          }}
        >
          {/* Checkbox */}
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: checked ? "#5DDBB1" : "rgba(255,255,255,0.25)",
              backgroundColor: checked ? "#5DDBB115" : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {checked && (
              <Ionicons name="checkmark" size={16} color="#5DDBB1" />
            )}
          </View>

          {/* Event info */}
          <View style={{ flex: 1, gap: 2 }}>
            <FlameText
              variant="subtitle1"
              className="text-white-100 font-poppins-medium"
              numberOfLines={1}
            >
              {item.name}
            </FlameText>
            <FlameText variant="subtitle2-light" className="text-white-50">
              {formatEventDate(item.starts_at, tz)}
            </FlameText>
          </View>
        </Pressable>
      );
    },
    [checkedIds, toggleEvent]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Scrim */}
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
        />

        <View
          className="bg-surface rounded-t-[28px]"
          style={{ maxHeight: "75%" }}
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
              onPress={onClose}
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

          {/* Title */}
          <View style={{ paddingHorizontal: 24, paddingTop: 8, gap: 4 }}>
            <FlameText
              variant="h3"
              className="text-white-100 font-poppins-semibold"
            >
              Assign Events
            </FlameText>
            <FlameText variant="subtitle2-light" className="text-white-50">
              Select events for {memberName}
            </FlameText>
          </View>

          {/* Event list */}
          {isLoading ? (
            <View
              style={{
                paddingVertical: 48,
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : isError ? (
            <View
              style={{
                paddingVertical: 48,
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons
                name="alert-circle-outline"
                size={36}
                color={colors["white-30"]}
              />
              <FlameText
                variant="subtitle1"
                className="text-white-50 text-center"
              >
                Failed to load events. Please try again.
              </FlameText>
            </View>
          ) : currentEvents.length === 0 ? (
            <View
              style={{
                paddingVertical: 48,
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons
                name="calendar-outline"
                size={36}
                color={colors["white-30"]}
              />
              <FlameText
                variant="subtitle1"
                className="text-white-50 text-center"
              >
                No current or upcoming events
              </FlameText>
            </View>
          ) : (
            <FlatList
              data={currentEvents}
              keyExtractor={(item) => item.id}
              renderItem={renderEvent}
              style={{ marginTop: 8 }}
              contentContainerStyle={{ paddingBottom: 8 }}
            />
          )}

          {/* Save button */}
          {currentEvents.length > 0 && (
            <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
              <Pressable
                onPress={handleSave}
                disabled={saving || isMutating || !hasChanges || isError}
                style={{
                  backgroundColor: colors["white-100"],
                  borderRadius: 40,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity:
                    saving || isMutating || !hasChanges || isError ? 0.45 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.dark} />
                ) : (
                  <FlameText
                    variant="subtitle1"
                    className="font-poppins-semibold"
                    style={{ color: colors.dark }}
                  >
                    Save Assignments
                  </FlameText>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
