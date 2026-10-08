import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { SettingsField } from "./SettingsField";
import { SettingsPhotoSection } from "./SettingsPhotoSection";
import { useUserProfile } from "../../hooks/useUserProfile";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { apiUploadFormData, apiDelete, ApiError } from "../../lib/api";

export function PersonalSettingsTab() {
  const { profile, isLoading, error, refetch } = useUserProfile();
  const { isSignedIn, signOut, getToken, userId } = useOptionalAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [uploading, setUploading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSignInOutPress = async () => {
    if (isSignedIn) {
      if (isSigningOut) return;
      setIsSigningOut(true);
      try {
        try {
          const { deregisterPushToken } = await import("../../lib/notifications");
          await deregisterPushToken(getToken);
        } catch (deregErr) {
          console.warn("[PersonalSettingsTab] deregisterPushToken failed (non-blocking)", deregErr);
        }
        await signOut();
        queryClient.clear();
        router.replace("/");
      } catch (err) {
        console.error("[PersonalSettingsTab] signOut failed", {
          userId,
          action: "signOut",
          error: err,
        });
        Alert.alert("Sign Out Failed", "Unable to sign out. Please try again.");
      } finally {
        setIsSigningOut(false);
      }
    } else {
      router.push("/sign-in");
    }
  };

  const handleEditProfilePhoto = async () => {
    if (!getToken) {
      console.error("[PersonalSettingsTab] upload failed", {
        userId,
        action: "uploadPhoto",
        reason: "missing auth token",
      });
      Alert.alert(
        "Authentication Required",
        "Please sign in to update your profile photo.",
      );
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploading(true);

      const formData = new FormData();
      const uri = asset.uri;
      const filename = uri.split("/").pop() ?? "photo.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const rawExt = match ? match[1].toLowerCase() : "jpg";
      const normalizedExt =
        rawExt === "jpeg" ? "jpeg" : rawExt === "jpg" ? "jpeg" : rawExt;
      const mimeType = asset.mimeType ?? `image/${normalizedExt}`;

      formData.append("file", {
        uri,
        name: filename,
        type: mimeType,
      } as unknown as Blob);
      formData.append("type", "personal");

      await apiUploadFormData("/api/upload-profile-image", formData, getToken);

      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to upload image";
      console.error("[PersonalSettingsTab] upload failed", {
        userId,
        action: "uploadPhoto",
        error: err,
      });
      Alert.alert("Upload Failed", message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProfilePhoto = async () => {
    if (!profile?.profile_image_url) return;

    if (!getToken) {
      console.error("[PersonalSettingsTab] delete failed", {
        userId,
        action: "deletePhoto",
        reason: "missing auth token",
      });
      Alert.alert(
        "Authentication Required",
        "Please sign in to remove your profile photo.",
      );
      return;
    }

    Alert.alert(
      "Delete Photo",
      "Are you sure you want to remove your profile photo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setUploading(true);
              const urlObj = new URL(profile.profile_image_url!);
              const parts = urlObj.pathname.split(
                "/object/public/profile-images/",
              );
              const storagePath =
                parts.length >= 2 ? (parts.pop() ?? null) : null;

              if (!storagePath) {
                throw new Error(
                  "Invalid profile image URL; cannot extract storage path",
                );
              }

              await apiDelete(
                `/api/upload-profile-image?path=${encodeURIComponent(storagePath)}&type=personal`,
                getToken,
              );
              queryClient.invalidateQueries({ queryKey: ["user-profile"] });
            } catch (err) {
              console.error("[PersonalSettingsTab] delete failed", {
                userId,
                action: "deletePhoto",
                error: err,
              });
              const message =
                err instanceof Error
                  ? err.message
                  : "Could not remove the photo. Please try again.";
              Alert.alert("Delete Failed", message);
            } finally {
              setUploading(false);
            }
          },
        },
      ],
    );
  };

  // Apple App Store Guideline 5.1.1(v) — account deletion.
  // Two-step Alert to prevent accidental taps. The server calls
  // `clerkClient.users.deleteUser()`, which triggers the Clerk webhook to
  // clean up Supabase (hard delete, or anonymize if there are dependent
  // records — see /api/webhooks/clerk/route.ts).
  const handleDeleteAccount = () => {
    if (isDeleting || !getToken) return;

    Alert.alert(
      "Delete Account",
      "This will permanently delete your Flame account. Your name, email, and profile will be removed.\n\nPast ticket purchases and event records are kept in anonymized form for attendee ticket validity and tax compliance. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you absolutely sure?",
              "Your name and email will be permanently removed from Flame. This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, delete forever",
                  style: "destructive",
                  onPress: async () => {
                    setIsDeleting(true);
                    try {
                      try {
                        const { deregisterPushToken } = await import(
                          "../../lib/notifications"
                        );
                        await deregisterPushToken(getToken);
                      } catch (deregErr) {
                        console.warn(
                          "[PersonalSettingsTab] deregisterPushToken failed before delete (non-blocking)",
                          deregErr,
                        );
                      }

                      await apiDelete("/api/user/delete", getToken);

                      try {
                        await signOut();
                      } catch (signOutErr) {
                        // Clerk session is already invalidated server-side;
                        // local signOut may throw but that's fine.
                        console.warn(
                          "[PersonalSettingsTab] signOut after delete failed (non-blocking)",
                          signOutErr,
                        );
                      }

                      queryClient.clear();
                      router.replace("/");
                    } catch (err) {
                      console.error("[PersonalSettingsTab] deleteAccount failed", {
                        userId,
                        action: "deleteAccount",
                        error: err,
                      });

                      // Organizer block: server returns 409 with code
                      // ACTIVE_ORGANIZER_DATA when the user owns an org with
                      // upcoming events or sold tickets. Route them to
                      // support rather than surfacing a generic "failed" msg.
                      if (
                        err instanceof ApiError &&
                        (err.status === 409 || err.code === "ACTIVE_ORGANIZER_DATA")
                      ) {
                        setIsDeleting(false);
                        Alert.alert(
                          "Can't Delete Right Now",
                          "Your account has active events or sold tickets. For your attendees' safety and our tax records, please email support@flme.co and we'll help you close out your events before deleting your account.",
                          [
                            { text: "OK", style: "cancel" },
                            {
                              text: "Email Support",
                              onPress: async () => {
                                const mailto =
                                  "mailto:support@flme.co?subject=Account%20deletion%20request";
                                try {
                                  const canOpen = await Linking.canOpenURL(mailto);
                                  if (canOpen) {
                                    await Linking.openURL(mailto);
                                  }
                                } catch (linkErr) {
                                  console.warn(
                                    "[PersonalSettingsTab] mailto open failed",
                                    linkErr,
                                  );
                                }
                              },
                            },
                          ],
                        );
                        return;
                      }

                      const message =
                        err instanceof ApiError
                          ? err.message
                          : "Could not delete your account. Please try again or contact support.";
                      Alert.alert("Delete Failed", message);
                      setIsDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleManageAccount = () => {
    const url = process.env.EXPO_PUBLIC_APP_URL ?? "https://flame.co";
    let displayHost = "flame.co";
    try {
      displayHost = new URL(url).hostname;
    } catch {
      // keep fallback if EXPO_PUBLIC_APP_URL is malformed
    }
    Alert.alert(
      "Manage Your Profile",
      `To manage your profile, please visit ${displayHost} and inside your account head to Settings.`,
      [
        { text: "OK", style: "cancel" },
        {
          text: `Open ${displayHost}`,
          onPress: async () => {
            try {
              const canOpen = await Linking.canOpenURL(url);
              if (!canOpen) {
                console.warn("[PersonalSettingsTab] manageAccount canOpenURL false", {
                  userId,
                  action: "manageAccount",
                  url,
                });
                Alert.alert(
                  "Cannot Open URL",
                  `This device cannot open the requested link. Please visit ${displayHost} manually in your browser.`
                );
                return;
              }
              await Linking.openURL(url);
            } catch (err) {
              console.error("[PersonalSettingsTab] handleManageAccount failed", {
                userId,
                action: "openAccountSettings",
                url,
                error: err,
              });
              Alert.alert(
                "Could Not Open",
                err instanceof Error ? err.message : `Failed to open the link. Please try visiting ${displayHost} manually.`
              );
            }
          },
        },
      ]
    );
  };

  if (isLoading && !profile) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text className="text-white-80 mt-4 text-sm font-poppins">
          Loading profile...
        </Text>
      </View>
    );
  }

  if (error && !profile) {
    return (
      <View className="flex-1 items-center justify-center py-12 px-6 gap-3">
        <Text className="text-white-100 text-lg font-poppins-semibold text-center">
          Failed to load profile
        </Text>
        <Text className="text-white-50 text-sm font-poppins text-center">
          {error instanceof Error ? error.message : "Please try again."}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="bg-white-100 rounded-pill px-6 py-2"
        >
          <Text className="text-dark font-poppins-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const fullName =
    profile?.first_name || profile?.last_name
      ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
      : "—";
  const email = profile?.email ?? "—";

  return (
    <View className="px-4 gap-[21px]">
      <View className="relative">
        <SettingsPhotoSection
          photoUrl={profile?.profile_image_url}
          onEdit={handleEditProfilePhoto}
          onDelete={
            profile?.profile_image_url ? handleDeleteProfilePhoto : undefined
          }
        />
        {uploading && (
          <View className="absolute inset-0 bg-black/50 rounded-card items-center justify-center">
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        )}
      </View>

      <View className="gap-[32px]">
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
              Personal Information
            </Text>
            <Pressable onPress={handleManageAccount} hitSlop={10}>
              <Text className="text-white-80 text-sm font-poppins-medium">
                Manage
              </Text>
            </Pressable>
          </View>
          <View className="gap-4">
            <SettingsField label="Full Name" value={fullName} />
            <SettingsField label="Email" value={email} />
          </View>
        </View>

        <Pressable
          onPress={handleSignInOutPress}
          disabled={isSigningOut || isDeleting}
          className={`w-full bg-white-100 border border-white-50 rounded-pill py-[10px] items-center justify-center ${isSigningOut || isDeleting ? "opacity-70" : ""}`}
        >
          <Text className="text-dark text-sm leading-[22px] font-poppins-medium">
            {isSignedIn ? "Sign out" : "Sign in"}
          </Text>
        </Pressable>

        {isSignedIn && (
          <Pressable
            onPress={handleDeleteAccount}
            disabled={isDeleting || isSigningOut}
            className={`w-full bg-transparent border border-[rgba(255,0,0,0.5)] rounded-pill py-[10px] items-center justify-center flex-row gap-2 ${isDeleting || isSigningOut ? "opacity-70" : ""}`}
          >
            {isDeleting && <ActivityIndicator size="small" color="#FF4444" />}
            <Text className="text-[#FF4444] text-sm leading-[22px] font-poppins-medium">
              {isDeleting ? "Deleting..." : "Delete Account"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
