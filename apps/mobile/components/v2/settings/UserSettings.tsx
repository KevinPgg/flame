/**
 * One Settings for the person (decision 2026-10-23: settings live in three places only — Clerk
 * account management, this, and the organization's settings in Manage). Replaces the v1
 * Settings, Account (personal tab) and Notifications screens:
 * account (photo, name, e-mail, Clerk portal) · language · notifications · scan tickets ·
 * help & legal · sign out · delete account · version. Web API only (GET /api/user/profile,
 * /api/me/language, /api/me/notification-preferences, /api/upload-profile-image, /api/user/delete).
 */
import { useState, type ReactNode } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as WebBrowser from "expo-web-browser";
import * as Application from "expo-application";
import {
  NOTIFICATION_PREFERENCE_ITEMS,
  NON_DISMISSABLE_NOTIFICATION_TYPES,
  SUPPORTED_LANGUAGES,
  flameV2Colors as c,
  type Language,
  type NotificationPreferences,
  type NotificationType,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient, apiGet, apiUploadFormData } from "../../../lib/api";
import { PUBLIC_SITE_URL } from "../../../lib/v2/organizer-api";
import { clerkAccountPortalUrl } from "../../../lib/v2/clerk-portal";
import { deregisterPushToken } from "../../../lib/notifications";
import { SCANNING_SUPPORTED } from "../../../lib/scanner-platform";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useMyOrganizations } from "../../../hooks/v2/useOrganizerModel";
import { Button, ConfirmDialog, ErrorBox, ErrorText, Icon, Skeleton, type IconName } from "../ui";
import { Group, SelectRow, Toggle } from "../form/ui";
import { Avatar } from "../people/PeoplePicker";

type Profile = { id: string; email: string; first_name: string | null; last_name: string | null; profile_image_url: string | null };

/** Best-effort step: never throws (also when the callee returns nothing). */
async function quietly(fn: () => unknown) {
  try {
    await fn();
  } catch {
    /* non-blocking */
  }
}

export const PROFILE_KEY = ["v2", "me-profile"];
export const NOTIF_KEY = ["v2", "me-notification-preferences"];

export function UserSettings() {
  const { t, language, setLanguage } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isSignedIn, signOut, getToken } = useOptionalAuth();
  const signedIn = isSignedIn === true;
  const [linkError, setLinkError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/" as Href));
  const open = async (url: string) => {
    setLinkError(false);
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      setLinkError(true);
    }
  };

  const doSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      await quietly(() => deregisterPushToken(getToken));
      await signOut();
      queryClient.clear();
      router.replace("/" as Href);
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  };

  // Apple 5.1.1(v): account deletion, two confirmations (same server flow as v1).
  const doDelete = async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      await quietly(() => deregisterPushToken(getToken));
      await apiClient("/api/user/delete", { method: "DELETE", getToken });
    } catch {
      setDeleteError(true);
      setDeleteStep(0);
      setDeleting(false);
      return;
    }
    // Deleted on the server: whatever happens locally, leave the signed-in screens.
    await quietly(() => signOut()); // the session is already gone server-side
    queryClient.clear();
    setDeleting(false);
    router.replace("/" as Href);
  };

  const portal = clerkAccountPortalUrl(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, process.env.EXPO_PUBLIC_CLERK_ACCOUNT_URL);
  const version = Application.nativeApplicationVersion;

  return (
    <View className="flex-1 bg-v2-ink">
      <View style={{ paddingTop: insets.top }} className="border-b border-[#141414] bg-v2-ink">
        <View className="h-14 flex-row items-center gap-1 px-2">
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={6} className="h-10 w-10 items-center justify-center rounded-v2-sm active:bg-v2-c10">
            <Icon name="back" size={22} color={c.cream} />
          </Pressable>
          <Text accessibilityRole="header" className="flex-1 px-1 font-v2-display-bold text-[18px] tracking-[-0.5px] text-v2-cream">{t("userSettings.title")}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {signedIn && (
          <Block title={t("userSettings.account")}>
            <AccountCard />
            {portal && (
              <View className="mt-3">
                <Group>
                  <LinkRow icon="settings" label={t("userSettings.manageAccount")} hint={t("userSettings.manageAccountHint")} onPress={() => void open(portal)} external />
                </Group>
              </View>
            )}
          </Block>
        )}

        {signedIn && (
          <Block title={t("userSettings.language")}>
            <Group>
              <SelectRow
                label={t("userSettings.language")}
                value={language}
                options={SUPPORTED_LANGUAGES.map((l) => ({ value: l, label: t(`languages.${l}`) }))}
                onChange={(l) => setLanguage(l as Language)}
              />
            </Group>
            <Text className="mt-1.5 font-v2-ui text-[12.5px] text-v2-c50">{t("userSettings.languageHint")}</Text>
          </Block>
        )}

        {signedIn && <NotificationsBlock />}

        {SCANNING_SUPPORTED && (
          <Block title={t("userSettings.scan")}>
            <Group>
              <LinkRow
                icon="qr"
                label={t("userSettings.scan")}
                hint={signedIn ? t("userSettings.scanHint") : t("userSettings.scanHintSignedOut")}
                onPress={() => router.push((signedIn ? "/v2/scanner" : "/scanner?public=1") as Href)}
              />
            </Group>
          </Block>
        )}

        <Block title={t("userSettings.help")}>
          <Group>
            <LinkRow icon="alert" label={t("userSettings.support")} onPress={() => router.push("/support" as Href)} />
            <LinkRow icon="copy" label={t("userSettings.privacy")} onPress={() => void open(`${PUBLIC_SITE_URL}/privacy-policy`)} external />
            <LinkRow icon="copy" label={t("userSettings.terms")} onPress={() => void open(`${PUBLIC_SITE_URL}/terms-of-use`)} external />
            <LinkRow icon="copy" label={t("userSettings.purchaseTerms")} onPress={() => void open(`${PUBLIC_SITE_URL}/purchase-terms`)} external />
            <LinkRow icon="settings" label={t("userSettings.cookies")} onPress={() => void open(`${PUBLIC_SITE_URL}/cookie-settings`)} external />
          </Group>
          {linkError ? <ErrorText>{t("userSettings.linkError")}</ErrorText> : null}
        </Block>

        <View className="mt-8 gap-3">
          {signedIn ? (
            <>
              <Button label={signingOut ? t("userSettings.signingOut") : t("userSettings.signOut")} onPress={() => void doSignOut()} disabled={signingOut || deleting} />
              {signOutError ? <ErrorText>{t("userSettings.signOutError")}</ErrorText> : null}
              <Button variant="danger" label={deleting ? t("userSettings.deleting") : t("userSettings.deleteAccount")} onPress={() => setDeleteStep(1)} disabled={deleting || signingOut} />
              {deleteError ? <ErrorText>{t("userSettings.deleteError")}</ErrorText> : null}
            </>
          ) : isSignedIn === false ? (
            <Button variant="primary" label={t("userSettings.signIn")} onPress={() => router.push("/sign-in" as Href)} />
          ) : null}
          {version ? <Text className="text-center font-v2-ui text-[12px] text-v2-c30">{t("userSettings.version", { version })}</Text> : null}
        </View>
      </ScrollView>

      <ConfirmDialog
        open={deleteStep === 1}
        message={t("userSettings.deleteTitle")}
        detail={t("userSettings.deleteDetail")}
        confirmLabel={t("userSettings.deleteContinue")}
        onConfirm={() => setDeleteStep(2)}
        onCancel={() => setDeleteStep(0)}
      />
      <ConfirmDialog
        open={deleteStep === 2}
        message={t("userSettings.deleteSureTitle")}
        detail={t("userSettings.deleteSureDetail")}
        confirmLabel={t("userSettings.deleteConfirm")}
        busy={deleting}
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleteStep(0)}
      />
    </View>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-6">
      <Text accessibilityRole="header" className="mb-2.5 font-v2-ui-semibold text-[12px] uppercase tracking-[0.7px] text-v2-c50">{title}</Text>
      {children}
    </View>
  );
}

function LinkRow({ icon, label, hint, onPress, external }: { icon: IconName; label: string; hint?: string; onPress: () => void; external?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole={external ? "link" : "button"} accessibilityLabel={label} className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-v2-ink3">
      <Icon name={icon} size={19} />
      <View className="min-w-0 flex-1">
        <Text className="font-v2-ui-medium text-[15px] text-v2-cream">{label}</Text>
        {hint ? <Text className="mt-0.5 font-v2-ui text-[12.5px] leading-[17px] text-v2-c50">{hint}</Text> : null}
      </View>
      <Icon name="chev" size={16} color={c.c50} />
    </Pressable>
  );
}

function AccountCard() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { getToken } = useOptionalAuth();
  const profile = useQuery<Profile>({ queryKey: PROFILE_KEY, queryFn: () => apiGet("/api/user/profile", getToken) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (profile.isLoading) return <Skeleton width="100%" height={120} radius={16} />;
  if (profile.isError || !profile.data) return <ErrorBox message={t("userSettings.loadError")} onRetry={() => void profile.refetch()} />;
  const p = profile.data;
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();

  const change = async () => {
    setError(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return setError(true);
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (result.canceled || !result.assets[0]) return;
      setBusy(true);
      const a = result.assets[0];
      const out = await ImageManipulator.manipulateAsync(a.uri, a.width && a.width > 800 ? [{ resize: { width: 800 } }] : [], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
      const body = new FormData();
      body.append("file", { uri: out.uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);
      body.append("type", "personal");
      await apiUploadFormData("/api/upload-profile-image", body, getToken);
      await queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(false);
    try {
      const path = p.profile_image_url ? new URL(p.profile_image_url).pathname.split("/object/public/profile-images/")[1] : null;
      if (!path) throw new Error("unknown photo url");
      await apiClient(`/api/upload-profile-image?path=${encodeURIComponent(path)}&type=personal`, { method: "DELETE", getToken });
      await queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <View className="gap-3 rounded-v2-card bg-v2-ink2 p-4">
      <View className="flex-row items-center gap-4">
        {p.profile_image_url ? (
          <Image source={{ uri: p.profile_image_url }} style={{ width: 64, height: 64, borderRadius: 32 }} accessibilityIgnoresInvertColors />
        ) : (
          <Avatar name={name || p.email} size={64} />
        )}
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-v2-ui-semibold text-[17px] text-v2-cream">{name || "—"}</Text>
          <Text numberOfLines={1} className="font-v2-ui text-[13px] text-v2-c70">{p.email}</Text>
          <Text className="mt-1 font-v2-ui text-[12px] text-v2-c50">{t("userSettings.accountHint")}</Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button small icon="camera" label={busy ? t("userSettings.photoUploading") : t("userSettings.photoChange")} onPress={() => void change()} disabled={busy} />
        {p.profile_image_url ? <Button small variant="danger" label={t("userSettings.photoRemove")} onPress={() => setConfirmRemove(true)} disabled={busy} /> : null}
      </View>
      {error ? <ErrorText>{t("userSettings.photoError")}</ErrorText> : null}
      <ConfirmDialog open={confirmRemove} message={t("userSettings.photoRemoveConfirm")} confirmLabel={t("userSettings.photoRemove")} busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirmRemove(false)} />
    </View>
  );
}

function NotificationsBlock() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { getToken } = useOptionalAuth();
  const prefs = useQuery<{ preferences: NotificationPreferences }>({ queryKey: NOTIF_KEY, queryFn: () => apiGet("/api/me/notification-preferences", getToken) });
  const orgs = useMyOrganizations();
  const isOrganizer = (orgs.data?.organizations ?? []).length > 0;
  const [error, setError] = useState(false);

  const toggle = async (type: NotificationType, on: boolean) => {
    if (NON_DISMISSABLE_NOTIFICATION_TYPES.has(type)) return;
    setError(false);
    const previous = queryClient.getQueryData<{ preferences: NotificationPreferences }>(NOTIF_KEY);
    if (previous) queryClient.setQueryData(NOTIF_KEY, { preferences: { ...previous.preferences, [type]: on } });
    try {
      const saved = await apiClient<{ preferences: NotificationPreferences }>("/api/me/notification-preferences", { method: "PUT", body: JSON.stringify({ [type]: on }), getToken });
      queryClient.setQueryData(NOTIF_KEY, saved);
    } catch {
      if (previous) queryClient.setQueryData(NOTIF_KEY, previous);
      setError(true);
    }
  };

  const section = (organizer: boolean) => {
    const items = NOTIFICATION_PREFERENCE_ITEMS.filter((i) => i.organizer === organizer);
    return (
      <View className="mt-3">
        <Text className="mb-1.5 px-1 font-v2-ui text-[12.5px] text-v2-c70">{organizer ? t("userSettings.notificationsOrganizer") : t("userSettings.notificationsGeneral")}</Text>
        <Group>
          {items.map(({ type }) => {
            const locked = NON_DISMISSABLE_NOTIFICATION_TYPES.has(type);
            const on = locked || (prefs.data?.preferences[type] ?? true);
            const title = t(`userSettings.notif.${type}.title`);
            return (
              <Pressable
                key={type}
                onPress={() => !locked && void toggle(type, !on)}
                accessibilityRole="switch"
                accessibilityLabel={title}
                accessibilityState={{ checked: on, disabled: locked }}
                className="flex-row items-center gap-3 px-4 py-3"
              >
                <View className="min-w-0 flex-1">
                  <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{title}</Text>
                  <Text className="mt-0.5 font-v2-ui text-[12.5px] leading-[17px] text-v2-c50">
                    {t(`userSettings.notif.${type}.hint`)}
                    {locked ? ` · ${t("userSettings.alwaysOn")}` : ""}
                  </Text>
                </View>
                <View style={{ opacity: locked ? 0.5 : 1 }}>
                  <Toggle on={on} />
                </View>
              </Pressable>
            );
          })}
        </Group>
      </View>
    );
  };

  return (
    <Block title={t("userSettings.notifications")}>
      {prefs.isLoading ? (
        <Skeleton width="100%" height={200} radius={16} />
      ) : prefs.isError ? (
        <ErrorBox onRetry={() => void prefs.refetch()} />
      ) : (
        <>
          {section(false)}
          {isOrganizer && section(true)}
          {error ? <View className="mt-2"><ErrorText>{t("userSettings.notificationsError")}</ErrorText></View> : null}
        </>
      )}
    </Block>
  );
}
