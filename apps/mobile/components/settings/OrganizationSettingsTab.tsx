import { useState, useEffect } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { SettingsField } from "./SettingsField";
import { SettingsTextArea } from "./SettingsTextArea";
import { SettingsPhotoSection } from "./SettingsPhotoSection";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { useOrgData } from "../../hooks/useOrgData";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";
import { getAuthenticatedClient } from "../../lib/supabase-auth";
import { apiUploadFormData, apiDelete, ApiError } from "../../lib/api";

const MAX_DESCRIPTION_LENGTH = 500;

export function OrganizationSettingsTab() {
  const { isSignedIn, signOut, getToken } = useOptionalAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedOrgId } = useMemberRoleContext();
  const { data: orgData, isLoading } = useOrgData(selectedOrgId);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [instagram, setInstagram] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (orgData) {
      setInstagram(orgData.instagramHandle ?? "");
      setDescription(orgData.description ?? "");
      setCity(orgData.city ?? "");
    }
  }, [orgData]);

  const handleEditOrgPhoto = async () => {
    if (!orgData || !getToken) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploading(true);

      const formData = new FormData();
      const uri = asset.uri;
      const filename = uri.split("/").pop() ?? "logo.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const ext = match ? match[1] : "jpg";
      const mimeType = asset.mimeType ?? `image/${ext}`;

      formData.append("file", {
        uri,
        name: filename,
        type: mimeType,
      } as unknown as Blob);
      formData.append("organizationSlug", orgData.organizationSlug);
      formData.append("type", "logo");

      await apiUploadFormData("/api/upload-org-image", formData, getToken);

      queryClient.invalidateQueries({ queryKey: ["org-data"] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to upload image";
      console.error("[OrganizationSettings] upload failed", err);
      Alert.alert("Upload Failed", message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteOrgPhoto = async () => {
    if (!orgData?.logoUrl || !getToken) return;

    Alert.alert(
      "Delete Logo",
      "Are you sure you want to remove the organization logo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setUploading(true);
              let storagePath: string | null = null;
              try {
                const urlObj = new URL(orgData.logoUrl!);
                const parts = urlObj.pathname.split(
                  "/object/public/organization-images/",
                );
                storagePath =
                  parts.length >= 2 && parts[1] ? parts[1] : null;
              } catch (parseErr) {
                console.error(
                  "[OrganizationSettings] logoUrl parse failed",
                  { url: orgData.logoUrl, error: parseErr },
                );
                throw parseErr;
              }

              if (!storagePath) {
                console.error(
                  "[OrganizationSettings] could not extract storage path from logoUrl",
                  { url: orgData.logoUrl },
                );
                throw new Error("Invalid logo URL; cannot extract storage path.");
              }

              await apiDelete(
                `/api/upload-org-image?path=${encodeURIComponent(storagePath)}&type=logo`,
                getToken,
              );
              queryClient.invalidateQueries({ queryKey: ["org-data"] });
              queryClient.invalidateQueries({ queryKey: ["organizations"] });
            } catch (err) {
              console.error("[OrganizationSettings] delete failed", err);
              Alert.alert(
                "Delete Failed",
                "Could not remove the logo. Please try again.",
              );
            } finally {
              setUploading(false);
            }
          },
        },
      ],
    );
  };

  const handleSavePress = async () => {
    if (!orgData || !getToken) return;
    setSaving(true);
    try {
      const cleanHandle = instagram.replace(/^@/, "").trim().slice(0, 30);
      const cleanDesc = description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
      const cleanCity = city.trim().slice(0, 100);

      const client = await getAuthenticatedClient(getToken);
      const { data, error } = await client
        .from("organizations")
        .update({
          instagram_handle: cleanHandle || null,
          description: cleanDesc || null,
          city: cleanCity || null,
        })
        .eq("id", orgData.organizationId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        console.error("[OrganizationSettings] update returned no row:", { organizationId: orgData.organizationId });
        throw new Error("Update did not affect any row.");
      }

      queryClient.invalidateQueries({ queryKey: ["org-data"] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      Alert.alert("Saved", "Organization profile updated.");
    } catch (err) {
      console.error("[OrganizationSettings] save failed", err);
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignInOutPress = async () => {
    if (isSignedIn) {
      try {
        await signOut();
        queryClient.clear();
        router.replace("/");
      } catch (err) {
        console.error("[OrganizationSettingsTab] signOut failed", err);
        Alert.alert("Sign Out Failed", "Unable to sign out. Please try again.");
      }
    } else {
      router.push("/sign-in");
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View className="px-4 gap-[21px]">
      <View className="relative">
        <SettingsPhotoSection
          photoUrl={orgData?.logoUrl}
          onEdit={handleEditOrgPhoto}
          onDelete={orgData?.logoUrl ? handleDeleteOrgPhoto : undefined}
        />
        {uploading && (
          <View className="absolute inset-0 bg-black/50 rounded-card items-center justify-center">
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        )}
      </View>

      <View className="gap-[32px]">
        <View className="gap-4">
          <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
            Organization Details
          </Text>
          <View className="gap-4">
            <SettingsField
              label="Instagram"
              value={instagram}
              onChangeText={setInstagram}
              placeholder="username (without @)"
              icon={
                <Ionicons name="at" size={24} color="rgba(255,255,255,0.5)" />
              }
            />
            <SettingsField
              label="Company Name"
              value={orgData?.organizationName ?? ""}
            />
            <SettingsField
              label="City"
              value={city}
              onChangeText={setCity}
              placeholder="e.g. Guayaquil"
              icon={
                <Ionicons name="location-outline" size={24} color="rgba(255,255,255,0.5)" />
              }
            />
            <SettingsTextArea
              label="Description"
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, MAX_DESCRIPTION_LENGTH))}
              placeholder="Tell people about your organization..."
              maxLength={MAX_DESCRIPTION_LENGTH}
            />
          </View>
        </View>

        <View className="items-end">
          <Pressable
            onPress={handleSavePress}
            disabled={saving}
            className={`bg-white-100 border border-white-50 rounded-pill px-6 py-[10px] items-center flex-row gap-2 ${saving ? "opacity-60" : ""}`}
          >
            {saving && <ActivityIndicator size="small" color="#041C2B" />}
            <Text className="text-dark text-sm leading-[22px] font-poppins-medium">
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={handleSignInOutPress}
          className="w-full bg-white-100 border border-white-50 rounded-pill py-[10px] items-center justify-center"
        >
          <Text className="text-dark text-sm leading-[22px] font-poppins-medium">
            {isSignedIn ? "Sign out" : "Sign in"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
