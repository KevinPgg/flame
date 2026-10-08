/**
 * Bottom sheet for adding a new member to the organization.
 *
 * Flow: enter email → search → if found, pick role (Admin/Organizer) → add.
 * Follows the native Modal bottom-sheet pattern used across the app.
 */

import { useState, useCallback } from "react";
import {
  Modal,
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";
import { useSearchUsers } from "../../hooks/useSearchUsers";
import { useAddMember } from "../../hooks/useManageMembers";
import type { SearchUser } from "../../hooks/useSearchUsers";
import type { OrgMemberRole } from "@project-flame/lib";

interface AddMemberSheetProps {
  visible: boolean;
  onClose: () => void;
  orgId: string;
}

type AssignableRole = "admin" | "organizer";

const ROLES: { value: AssignableRole; label: string; color: string }[] = [
  { value: "admin", label: "Admin", color: "#238FDA" },
  { value: "organizer", label: "Organizer", color: "#5DDBB1" },
];

export function AddMemberSheet({ visible, onClose, orgId }: AddMemberSheetProps) {
  const { users, searching, searchError, searchByEmail, clearResults } =
    useSearchUsers();
  const addMember = useAddMember(orgId);

  const [email, setEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<AssignableRole>("organizer");

  const handleClose = useCallback(() => {
    setEmail("");
    setSelectedUser(null);
    setSelectedRole("organizer");
    clearResults();
    onClose();
  }, [onClose, clearResults]);

  const handleSearch = useCallback(() => {
    setSelectedUser(null);
    searchByEmail(email);
  }, [email, searchByEmail]);

  const handleSelectUser = useCallback((user: SearchUser) => {
    setSelectedUser(user);
  }, []);

  const handleAdd = useCallback(() => {
    if (!selectedUser) return;
    addMember.mutate(
      { userId: selectedUser.id, role: selectedRole as OrgMemberRole },
      {
        onSuccess: () => {
          const name = [selectedUser.first_name, selectedUser.last_name]
            .filter(Boolean)
            .join(" ") || selectedUser.email;
          Alert.alert("Success", `${name} added as ${selectedRole}.`);
          handleClose();
        },
        onError: (err) => {
          Alert.alert("Error", err.message || "Failed to add member.");
        },
      },
    );
  }, [selectedUser, selectedRole, addMember, handleClose]);

  const userName = selectedUser
    ? [selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(" ") ||
      selectedUser.email
    : "";

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
              keyboardDismissMode="on-drag"
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
                  Add Team Member
                </FlameText>

                {/* Email search */}
                <View style={{ gap: 12 }}>
                  <FlameText
                    variant="subtitle2"
                    className="text-white-50 font-poppins-medium uppercase"
                    style={{ letterSpacing: 0.8 }}
                  >
                    Search by Email
                  </FlameText>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="name@example.com"
                      placeholderTextColor={colors["white-30"]}
                      style={{
                        flex: 1,
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
                      keyboardType="email-address"
                      editable={!searching && !addMember.isPending}
                      onSubmitEditing={handleSearch}
                      returnKeyType="search"
                    />
                    <Pressable
                      onPress={handleSearch}
                      disabled={searching || !email.trim()}
                      style={{
                        backgroundColor: colors["white-100"],
                        borderRadius: 14,
                        paddingHorizontal: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: searching || !email.trim() ? 0.45 : 1,
                      }}
                    >
                      {searching ? (
                        <ActivityIndicator size="small" color={colors.dark} />
                      ) : (
                        <Ionicons name="search" size={20} color={colors.dark} />
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* Search error */}
                {searchError && !selectedUser && (
                  <View
                    style={{
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <FlameText variant="subtitle1" className="text-white-50">
                      {searchError}
                    </FlameText>
                  </View>
                )}

                {/* Search results */}
                {users.length > 0 && !selectedUser && (
                  <View style={{ gap: 8 }}>
                    {users.map((user) => (
                      <Pressable
                        key={user.id}
                        onPress={() => handleSelectUser(user)}
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
                              (user.first_name?.charAt(0) ?? "") +
                              (user.last_name?.charAt(0) ?? "")
                            ).toUpperCase() ||
                              user.email.charAt(0).toUpperCase()}
                          </FlameText>
                        </View>
                        <View className="flex-1 min-w-0">
                          <FlameText
                            variant="subtitle1"
                            className="text-white-100 font-poppins-medium"
                            numberOfLines={1}
                          >
                            {[user.first_name, user.last_name]
                              .filter(Boolean)
                              .join(" ") || user.email}
                          </FlameText>
                          <FlameText
                            variant="subtitle2-light"
                            className="text-white-50"
                            numberOfLines={1}
                          >
                            {user.email}
                          </FlameText>
                        </View>
                        <Ionicons
                          name="add-circle-outline"
                          size={22}
                          color={colors["white-50"]}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Selected user + role picker */}
                {selectedUser && (
                  <View style={{ gap: 16 }}>
                    {/* Selected user card */}
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
                        borderColor: "rgba(255,255,255,0.15)",
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
                            (selectedUser.first_name?.charAt(0) ?? "") +
                            (selectedUser.last_name?.charAt(0) ?? "")
                          ).toUpperCase() ||
                            selectedUser.email.charAt(0).toUpperCase()}
                        </FlameText>
                      </View>
                      <View className="flex-1 min-w-0">
                        <FlameText
                          variant="subtitle1"
                          className="text-white-100 font-poppins-medium"
                          numberOfLines={1}
                        >
                          {userName}
                        </FlameText>
                        <FlameText
                          variant="subtitle2-light"
                          className="text-white-50"
                          numberOfLines={1}
                        >
                          {selectedUser.email}
                        </FlameText>
                      </View>
                      <Pressable onPress={() => setSelectedUser(null)} hitSlop={8}>
                        <Ionicons
                          name="close-circle"
                          size={22}
                          color={colors["white-50"]}
                        />
                      </Pressable>
                    </View>

                    {/* Role picker */}
                    <View style={{ gap: 10 }}>
                      <FlameText
                        variant="subtitle2"
                        className="text-white-50 font-poppins-medium uppercase"
                        style={{ letterSpacing: 0.8 }}
                      >
                        Assign Role
                      </FlameText>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {ROLES.map(({ value, label, color }) => {
                          const isSelected = selectedRole === value;
                          return (
                            <Pressable
                              key={value}
                              onPress={() => setSelectedRole(value)}
                              style={{
                                flex: 1,
                                paddingVertical: 12,
                                borderRadius: 12,
                                alignItems: "center",
                                borderWidth: 1.5,
                                borderColor: isSelected ? color : "rgba(255,255,255,0.1)",
                                backgroundColor: isSelected
                                  ? `${color}15`
                                  : "rgba(255,255,255,0.04)",
                              }}
                            >
                              <FlameText
                                variant="subtitle1"
                                className="font-poppins-medium"
                                style={{ color: isSelected ? color : colors["white-50"] }}
                              >
                                {label}
                              </FlameText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* Add button */}
                    <Pressable
                      onPress={handleAdd}
                      disabled={addMember.isPending}
                      style={{
                        backgroundColor: colors["white-100"],
                        borderRadius: 40,
                        paddingVertical: 16,
                        alignItems: "center",
                        opacity: addMember.isPending ? 0.45 : 1,
                        marginBottom: 8,
                      }}
                    >
                      {addMember.isPending ? (
                        <ActivityIndicator size="small" color={colors.dark} />
                      ) : (
                        <FlameText
                          variant="subtitle1"
                          className="font-poppins-semibold"
                          style={{ color: colors.dark }}
                        >
                          Add Member
                        </FlameText>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
