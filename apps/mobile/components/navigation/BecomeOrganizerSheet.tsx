/**
 * Bottom sheet for applying to become an organizer.
 *
 * Ported from web: apps/web/app/components/forms/CreateOrganizationForm.tsx
 * API endpoint: POST /api/organizations (apps/web/app/api/organizations/route.ts)
 *
 * Flow: user enters company name → slug auto-generated → POST to web API →
 * org created with approved=false → user sees "under review" message.
 */

import { useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { FlameText, colors } from "@project-flame/ui";
import { apiPost, ApiError } from "../../lib/api";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";

interface BecomeOrganizerSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface CreateOrgResponse {
  success: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
    owner_user_id: string;
  };
  message: string;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BecomeOrganizerSheet({
  visible,
  onClose,
}: BecomeOrganizerSheetProps) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleNameChange = useCallback((text: string) => {
    setName(text);
    setError("");
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const slug = generateSlug(trimmedName);
    if (!slug) {
      setError(
        "Name must contain at least one letter or number.",
      );
      return;
    }

    const token = await getToken();
    if (!token) {
      setError("You must be signed in to create an organization.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await apiPost<CreateOrgResponse>(
        "/api/organizations",
        { name: trimmedName, slug },
        () => Promise.resolve(token),
      );

      await queryClient.invalidateQueries({ queryKey: ["user-role"] });
      setIsSuccess(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [name, getToken, queryClient]);

  const handleClose = useCallback(() => {
    setName("");
    setError("");
    setIsSuccess(false);
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

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
            accessibilityHint="Double tap to close"
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

              {isSuccess ? (
                /* ── Success state ── */
                <View style={{ alignItems: "center", paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, gap: 16 }}>
                  {/* Success icon */}
                  <View
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 48,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 36,
                        backgroundColor: "rgba(255,255,255,0.1)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="checkmark-circle" size={44} color={colors["white-100"]} />
                    </View>
                  </View>

                  <FlameText variant="h3" className="text-white-100 text-center font-poppins-semibold">
                    You're on the list!
                  </FlameText>
                  <FlameText variant="body" className="text-white-50 text-center" style={{ lineHeight: 22 }}>
                    Your application is under review.{"\n"}We'll email you once you're approved.
                  </FlameText>

                  <Pressable
                    onPress={handleClose}
                    style={{
                      backgroundColor: colors["white-100"],
                      borderRadius: 40,
                      paddingVertical: 14,
                      paddingHorizontal: 48,
                      marginTop: 8,
                    }}
                  >
                    <Text
                      className="text-base leading-[22px] font-poppins-semibold"
                      style={{ color: colors.dark }}
                    >
                      Got it
                    </Text>
                  </Pressable>
                </View>
              ) : (
                /* ── Form state ── */
                <View style={{ paddingHorizontal: 24, paddingTop: 8, gap: 24 }}>

                  {/* Hero icon */}
                  <View style={{ alignItems: "center", paddingTop: 8, gap: 16 }}>
                    {/* Outer glow ring */}
                    <View
                      style={{
                        width: 120,
                        height: 120,
                        borderRadius: 60,
                        backgroundColor: "rgba(255,255,255,0.06)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {/* Inner circle */}
                      <View
                        style={{
                          width: 88,
                          height: 88,
                          borderRadius: 44,
                          backgroundColor: "rgba(255,255,255,0.1)",
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.15)",
                        }}
                      >
                        <Ionicons name="megaphone" size={40} color={colors["white-100"]} />
                      </View>
                    </View>

                    {/* Headline */}
                    <View style={{ alignItems: "center", gap: 6 }}>
                      <FlameText
                        variant="h3"
                        className="text-white-100 font-poppins-semibold text-center"
                      >
                        Host Your Own Events
                      </FlameText>
                      <FlameText
                        variant="subtitle1"
                        className="text-white-50 text-center"
                        style={{ lineHeight: 20 }}
                      >
                        Create a free organizer profile and start{"\n"}selling tickets in minutes.
                      </FlameText>
                    </View>
                  </View>

                  {/* Benefit pills */}
                  <View style={{ gap: 10 }}>
                    {[
                      { icon: "ticket-outline" as const, label: "Sell tickets & manage capacity" },
                      { icon: "bar-chart-outline" as const, label: "Track revenue & attendance" },
                      { icon: "people-outline" as const, label: "Approve RSVPs & check-in guests" },
                    ].map(({ icon, label }) => (
                      <View
                        key={label}
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
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: "rgba(255,255,255,0.1)",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons name={icon} size={18} color={colors["white-100"]} />
                        </View>
                        <FlameText variant="subtitle1" className="text-white-80 flex-1">
                          {label}
                        </FlameText>
                      </View>
                    ))}
                  </View>

                  {/* Divider */}
                  <View
                    style={{
                      height: 1,
                      backgroundColor: "rgba(255,255,255,0.08)",
                      marginHorizontal: -24,
                    }}
                  />

                  {/* Form */}
                  <View style={{ gap: 12 }}>
                    <FlameText
                      variant="subtitle2"
                      className="text-white-50 font-poppins-medium uppercase"
                      style={{ letterSpacing: 0.8 }}
                    >
                      Organization Name
                    </FlameText>
                    <TextInput
                      value={name}
                      onChangeText={handleNameChange}
                      placeholder="e.g., Acme Events"
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
                        borderColor: name.trim()
                          ? "rgba(255,255,255,0.25)"
                          : "rgba(255,255,255,0.1)",
                      }}
                      autoCapitalize="words"
                      autoCorrect={false}
                      maxLength={100}
                      editable={!isSubmitting}
                    />

                    {name.trim().length > 0 && (
                      <View
                        style={{
                          backgroundColor: "rgba(255,255,255,0.04)",
                          borderRadius: 10,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Ionicons name="link-outline" size={14} color={colors["white-30"]} />
                        <FlameText variant="subtitle2" className="text-white-30">
                          flme.co/
                        </FlameText>
                        <FlameText variant="subtitle2" className="text-white-70 font-poppins-medium">
                          {generateSlug(name)}
                        </FlameText>
                      </View>
                    )}

                    {error !== "" && (
                      <View
                        style={{
                          backgroundColor: "rgba(255,0,0,0.1)",
                          borderWidth: 1,
                          borderColor: "rgba(255,0,0,0.3)",
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                        }}
                      >
                        <FlameText variant="subtitle1" className="text-white-100">
                          {error}
                        </FlameText>
                      </View>
                    )}
                  </View>

                  {/* CTA */}
                  <Pressable
                    onPress={handleSubmit}
                    disabled={isSubmitting || !name.trim()}
                    style={{
                      backgroundColor: colors["white-100"],
                      borderRadius: 40,
                      paddingVertical: 16,
                      alignItems: "center",
                      opacity: isSubmitting || !name.trim() ? 0.45 : 1,
                      marginBottom: 8,
                    }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={colors.dark} />
                    ) : (
                      <Text
                        className="text-base leading-[22px] font-poppins-semibold"
                        style={{ color: colors.dark }}
                      >
                        Apply to Host
                      </Text>
                    )}
                  </Pressable>

                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
