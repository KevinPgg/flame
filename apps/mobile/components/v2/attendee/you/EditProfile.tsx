/**
 * Edit profile in the app (2026-11-02, client's ask; prototype ACTS.editProfile) — its own screen,
 * apart from Settings: photo (upload / remove), first and last name (saved to Clerk by the API),
 * Instagram and avatar colour (used when there is no photo). Same API as the web
 * (/api/me/profile, /api/upload-profile-image).
 */
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { PROFILE_COLORS, flameV2Colors as c, profileColor, profileFormFrom, validateProfile, type ProfileErrorKey, type ProfileForm } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { ApiError, apiClient, apiUploadFormData } from "../../../../lib/api";
import { useOptionalAuth } from "../../../../hooks/useOptionalAuth";
import { MY_PROFILE_KEY, useMyProfile } from "../../../../hooks/v2/useMyProfile";
import { Button, ConfirmDialog, ErrorBox, ErrorText, Icon, Skeleton } from "../../ui";
import { Input, Labeled } from "../../form/ui";
import { ProfileAvatar } from "./ProfileAvatar";

export function EditProfile() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getToken } = useOptionalAuth();
  const profile = useMyProfile();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileForm, ProfileErrorKey>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (profile.data && !form) setForm(profileFormFrom(profile.data));
  }, [profile.data, form]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/profile" as Href));
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: MY_PROFILE_KEY }),
      queryClient.invalidateQueries({ queryKey: ["user-profile"] }),
    ]);
  };

  const header = (
    <View style={{ paddingTop: insets.top }} className="border-b border-[#141414] bg-v2-ink">
      <View className="h-14 flex-row items-center gap-1 px-2">
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={6} className="h-10 w-10 items-center justify-center rounded-v2-sm active:bg-v2-c10">
          <Icon name="back" size={22} color={c.cream} />
        </Pressable>
        <Text accessibilityRole="header" className="flex-1 px-1 font-v2-display-bold text-[18px] tracking-[-0.5px] text-v2-cream">{t("editProfile.title")}</Text>
      </View>
    </View>
  );

  if (profile.isError)
    return (
      <View className="flex-1 bg-v2-ink">
        {header}
        <View className="p-4"><ErrorBox message={t("editProfile.loadError")} onRetry={() => void profile.refetch()} /></View>
      </View>
    );
  if (!profile.data || !form)
    return (
      <View className="flex-1 bg-v2-ink">
        {header}
        <View className="p-4"><Skeleton width="100%" height={360} radius={16} /></View>
      </View>
    );

  const p = profile.data;
  const name = `${form.first_name} ${form.last_name}`.trim();
  const shown = profileColor(form.avatar_color, name || p.email);
  const set = (k: keyof ProfileForm, v: string | null) => {
    setForm({ ...form, [k]: v });
    setErrors((e) => ({ ...e, [k]: undefined }));
    setSaveError(null);
  };
  const err = (k: keyof ProfileForm) => (errors[k] ? t(`editProfile.errors.${errors[k]}`) : null);

  const pickPhoto = async () => {
    setPhotoError(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return setPhotoError(true);
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (result.canceled || !result.assets[0]) return;
      setPhotoBusy(true);
      const a = result.assets[0];
      const out = await ImageManipulator.manipulateAsync(a.uri, a.width && a.width > 800 ? [{ resize: { width: 800 } }] : [], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
      const body = new FormData();
      body.append("file", { uri: out.uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);
      body.append("type", "personal");
      await apiUploadFormData("/api/upload-profile-image", body, getToken);
      await refresh();
    } catch {
      setPhotoError(true);
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setPhotoError(false);
    try {
      const path = p.photo_url ? new URL(p.photo_url).pathname.split("/object/public/profile-images/")[1] : null;
      if (!path) throw new Error("unknown photo url");
      await apiClient(`/api/upload-profile-image?path=${encodeURIComponent(path)}&type=personal`, { method: "DELETE", getToken });
      await refresh();
    } catch {
      setPhotoError(true);
    } finally {
      setPhotoBusy(false);
      setConfirmRemove(false);
    }
  };

  const save = async () => {
    const v = validateProfile(form);
    if (!v.ok) return setErrors(v.errors);
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient("/api/me/profile", { method: "PATCH", body: JSON.stringify(v.value), getToken });
      await refresh();
      back();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setSaveError(code === "NAME_NOT_SAVED" ? t("editProfile.errors.nameNotSaved") : t("editProfile.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-v2-ink">
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>
        <Text className="font-v2-ui text-[14px] text-v2-c70">{t("editProfile.lede")}</Text>
        <View className="items-center gap-3 rounded-v2-card bg-v2-ink2 p-5">
          <ProfileAvatar name={name} email={p.email} photo={p.photo_url} color={form.avatar_color} size={96} />
          <View className="flex-row flex-wrap justify-center gap-2">
            <Button small icon="camera" label={photoBusy ? t("editProfile.photoUploading") : p.photo_url ? t("editProfile.photoChange") : t("editProfile.photoAdd")} onPress={() => void pickPhoto()} disabled={photoBusy} />
            {p.photo_url ? <Button small variant="danger" label={t("editProfile.photoRemove")} onPress={() => setConfirmRemove(true)} disabled={photoBusy} /> : null}
          </View>
          {photoError ? <ErrorText>{t("editProfile.photoError")}</ErrorText> : null}
        </View>

        <View className="gap-4 rounded-v2-card bg-v2-ink2 p-4">
          <Labeled label={t("editProfile.firstName")} error={err("first_name")}>
            <Input value={form.first_name} onChangeText={(v) => set("first_name", v)} maxLength={50} autoComplete="given-name" accessibilityLabel={t("editProfile.firstName")} invalid={!!errors.first_name} />
          </Labeled>
          <Labeled label={t("editProfile.lastName")} error={err("last_name")}>
            <Input value={form.last_name} onChangeText={(v) => set("last_name", v)} maxLength={50} autoComplete="family-name" accessibilityLabel={t("editProfile.lastName")} invalid={!!errors.last_name} />
          </Labeled>
          <Labeled label={t("editProfile.instagram")} error={err("instagram")}>
            <View className="h-11 flex-row items-center rounded-v2-md bg-v2-ink3 pl-4">
              <Text className="font-v2-ui text-[14px] text-v2-c50">@</Text>
              <Input bare className="flex-1" value={form.instagram} onChangeText={(v) => set("instagram", v)} placeholder={t("editProfile.instagramPlaceholder")} autoCapitalize="none" accessibilityLabel={t("editProfile.instagram")} />
            </View>
          </Labeled>
          {!errors.instagram ? <Text className="-mt-2 font-v2-ui text-[12.5px] text-v2-c50">{t("editProfile.instagramHint")}</Text> : null}
          <View className="gap-2">
            <Text className="font-v2-ui text-[12.5px] text-v2-c70">{t("editProfile.color")}</Text>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2.5">
              {PROFILE_COLORS.map((col, i) => {
                const on = shown.toUpperCase() === col;
                return (
                  <Pressable
                    key={col}
                    onPress={() => set("avatar_color", col)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={t("editProfile.colorPick", { n: i + 1 })}
                    style={{ backgroundColor: col, borderWidth: on ? 2 : 0, borderColor: c.cream }}
                    className="h-9 w-9 rounded-full"
                  />
                );
              })}
            </View>
            <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("editProfile.colorHint")}</Text>
          </View>
        </View>

        {saveError ? <ErrorText>{saveError}</ErrorText> : null}
        <Button variant="primary" label={saving ? t("editProfile.saving") : t("editProfile.save")} onPress={() => void save()} disabled={saving} />
      </ScrollView>
      <ConfirmDialog
        open={confirmRemove}
        message={t("editProfile.photoRemoveConfirm")}
        confirmLabel={t("editProfile.photoRemove")}
        busy={photoBusy}
        onConfirm={() => void removePhoto()}
        onCancel={() => setConfirmRemove(false)}
      />
    </View>
  );
}
