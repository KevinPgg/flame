/**
 * Bottom sheet for changing a member's role.
 *
 * Only Admin and Organizer are selectable — Owner cannot be assigned.
 * Follows the native Modal bottom-sheet pattern used across the app.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";
import { useUpdateMemberRole } from "../../hooks/useManageMembers";
import type { OrganizationMember, OrgMemberRole } from "@project-flame/lib";

interface EditRoleSheetProps {
  visible: boolean;
  onClose: () => void;
  member: OrganizationMember | null;
  orgId: string;
}

type AssignableRole = "admin" | "organizer";

const ROLES: { value: AssignableRole; label: string; color: string; description: string }[] = [
  {
    value: "admin",
    label: "Admin",
    color: "#238FDA",
    description: "Can manage members, events, and settings",
  },
  {
    value: "organizer",
    label: "Organizer",
    color: "#5DDBB1",
    description: "Can scan tickets for assigned events",
  },
];

function getDisplayName(member: OrganizationMember): string {
  const parts = [member.user_first_name, member.user_last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return member.user_email ?? "Unknown";
}

export function EditRoleSheet({
  visible,
  onClose,
  member,
  orgId,
}: EditRoleSheetProps) {
  const updateRole = useUpdateMemberRole(orgId);
  const currentRole = member?.role as AssignableRole | undefined;
  const [selectedRole, setSelectedRole] = useState<AssignableRole>("organizer");

  // Sync picker with current role when sheet opens.
  // Roles other than admin/organizer (e.g. owner) aren't assignable — default
  // to "organizer" so the picker is always in a deterministic state.
  useEffect(() => {
    if (member) {
      if (member.role === "admin" || member.role === "organizer") {
        setSelectedRole(member.role);
      } else {
        setSelectedRole("organizer");
      }
    }
  }, [member]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSave = useCallback(() => {
    if (!member || selectedRole === currentRole) {
      handleClose();
      return;
    }
    updateRole.mutate(
      { memberId: member.id, userId: member.user_id, newRole: selectedRole as OrgMemberRole },
      {
        onSuccess: () => {
          Alert.alert(
            "Success",
            `${getDisplayName(member)}'s role updated to ${selectedRole}.`,
          );
          handleClose();
        },
        onError: (err) => {
          Alert.alert("Error", err.message || "Failed to update role.");
        },
      },
    );
  }, [member, selectedRole, currentRole, updateRole, handleClose]);

  if (!member) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          {/* Scrim */}
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss sheet"
          />

          <View className="bg-surface rounded-t-[28px] pb-10">
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Drag handle */}
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
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
              <View style={{ alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 4 }}>
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
                    <Ionicons name="close" size={18} color={colors["white-50"]} />
                  </View>
                </Pressable>
              </View>

              <View style={{ paddingHorizontal: 24, paddingTop: 8, gap: 20 }}>
                {/* Title */}
                <FlameText
                  variant="h3"
                  className="text-white-100 font-poppins-semibold"
                >
                  Change Role
                </FlameText>

                {/* Member info */}
                <View
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
                  <View
                    className="items-center justify-center rounded-full bg-white-10"
                    style={{ width: 40, height: 40 }}
                  >
                    <FlameText
                      variant="subtitle1"
                      className="text-white-80 font-poppins-semibold"
                    >
                      {(
                        (member.user_first_name?.charAt(0) ?? "") +
                        (member.user_last_name?.charAt(0) ?? "")
                      ).toUpperCase() ||
                        (member.user_email?.charAt(0) ?? "?").toUpperCase()}
                    </FlameText>
                  </View>
                  <View className="flex-1 min-w-0">
                    <FlameText
                      variant="subtitle1"
                      className="text-white-100 font-poppins-medium"
                      numberOfLines={1}
                    >
                      {getDisplayName(member)}
                    </FlameText>
                    {member.user_email && (
                      <FlameText
                        variant="subtitle2-light"
                        className="text-white-50"
                        numberOfLines={1}
                      >
                        {member.user_email}
                      </FlameText>
                    )}
                  </View>
                </View>

                {/* Role picker */}
                <View style={{ gap: 10 }}>
                  <FlameText
                    variant="subtitle2"
                    className="text-white-50 font-poppins-medium uppercase"
                    style={{ letterSpacing: 0.8 }}
                  >
                    Select Role
                  </FlameText>
                  {ROLES.map(({ value, label, color, description }) => {
                    const isSelected = selectedRole === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setSelectedRole(value)}
                        style={{
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: isSelected ? color : "rgba(255,255,255,0.1)",
                          backgroundColor: isSelected
                            ? `${color}15`
                            : "rgba(255,255,255,0.04)",
                          gap: 4,
                        }}
                      >
                        <FlameText
                          variant="subtitle1"
                          className="font-poppins-medium"
                          style={{ color: isSelected ? color : colors["white-80"] }}
                        >
                          {label}
                        </FlameText>
                        <FlameText
                          variant="subtitle2-light"
                          style={{
                            color: isSelected ? color : colors["white-30"],
                            opacity: isSelected ? 0.8 : 1,
                          }}
                        >
                          {description}
                        </FlameText>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Save button */}
                <Pressable
                  onPress={handleSave}
                  disabled={updateRole.isPending || selectedRole === currentRole || member?.role === "owner"}
                  style={{
                    backgroundColor: colors["white-100"],
                    borderRadius: 40,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity:
                      updateRole.isPending || selectedRole === currentRole || member?.role === "owner"
                        ? 0.45
                        : 1,
                    marginBottom: 8,
                  }}
                >
                  {updateRole.isPending ? (
                    <ActivityIndicator size="small" color={colors.dark} />
                  ) : (
                    <FlameText
                      variant="subtitle1"
                      className="font-poppins-semibold"
                      style={{ color: colors.dark }}
                    >
                      Save
                    </FlameText>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
