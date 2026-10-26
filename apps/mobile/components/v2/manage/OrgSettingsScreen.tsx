/**
 * Organization settings (prototype "ow:settings", Organization; same APIs and rules as the web
 * SettingsView): logo, name (fixed), Instagram, city, description. Reads
 * GET /api/organizations/[id], saves PATCH /api/organizations/[id]; logo through
 * /api/upload-org-image. Any member reads; owner/admin edit. The person's own settings live
 * apart (decision 2026-10-23: one user settings, one organization settings).
 */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ORG_CITY_MAX,
  ORG_DESCRIPTION_MAX,
  canAccessOrgSettings,
  logoDimensionProblem,
  logoTargetSize,
  normalizeInstagram,
  orgFormDirty,
  orgFormFrom,
  orgFormPayload,
  orgImageStoragePath,
  validateOrgForm,
  type OrgForm,
  type OrgProfile,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient, apiGet, apiUploadFormData } from "../../../lib/api";
import { routes } from "../../../lib/v2/routes";
import { apiErrorText, type MyOrganization } from "../../../lib/v2/organizer-api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { OrganizerShell } from "../OrganizerShell";
import { Button, ConfirmDialog, ErrorBox, ErrorText, OrgAvatar, Skeleton } from "../ui";
import { FormScreen } from "../form/FormScreen";
import { FieldError, Hint, Input, Section } from "../form/ui";

type Details = OrgProfile & { id: string; name: string; slug: string; logo_url: string | null };

export function orgDetailsKey(orgId: string) {
  return ["v2", "org-details", orgId];
}

export function OrgSettingsScreen({ organization }: { organization: MyOrganization }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getToken } = useOptionalAuth();
  const { model } = useOrganizerModel(organization);
  const canEdit = canAccessOrgSettings(organization.role);
  const details = useQuery<{ organization: Details }>({
    queryKey: orgDetailsKey(organization.id),
    queryFn: () => apiGet(`/api/organizations/${organization.id}`, getToken),
  });

  const [saved, setSaved] = useState<OrgForm | null>(null);
  const [form, setForm] = useState<OrgForm | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Fill once (a refetch must not wipe what's being typed).
  useEffect(() => {
    if (details.data && !form) {
      const f = orgFormFrom(details.data.organization);
      setSaved(f);
      setForm(f);
    }
  }, [details.data, form]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.manage(organization) as Href));
  const shell = (children: React.ReactNode) => (
    <OrganizerShell organization={organization} pending={model?.pending ?? 0} section="manage" title={t("orgSettings.title")} onBack={back} hideTabbar>
      {children}
    </OrganizerShell>
  );

  if (details.isError) return shell(<View className="px-4 pt-6"><ErrorBox onRetry={() => void details.refetch()} /></View>);
  if (!details.data || !form || !saved) {
    return shell(
      <View className="gap-4 px-4 pt-6">
        <Skeleton width="100%" height={96} radius={16} />
        <Skeleton width="100%" height={260} radius={16} />
      </View>,
    );
  }
  const org = details.data.organization;
  const errors = validateOrgForm(form);
  const dirty = orgFormDirty(saved, form);
  const fieldError = (k: keyof OrgForm) => (touched && errors[k] ? (errors[k] === "instagram" ? t("orgSettings.instagramInvalid") : t("orgSettings.tooLong")) : null);
  const set = (k: keyof OrgForm) => (v: string) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setSaveError(false);
    setJustSaved(false);
  };
  const refreshOrg = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orgDetailsKey(organization.id) }),
      queryClient.invalidateQueries({ queryKey: ["v2", "organizations"] }),
    ]);

  const save = async () => {
    setTouched(true);
    if (!dirty || Object.keys(errors).length > 0) return;
    setSaving(true);
    setSaveError(false);
    try {
      await apiClient(`/api/organizations/${organization.id}`, { method: "PATCH", body: JSON.stringify(orgFormPayload(form)), getToken });
      const next = orgFormFrom(orgFormPayload(form));
      setSaved(next);
      setForm(next);
      setTouched(false);
      setJustSaved(true);
      void refreshOrg();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return shell(
    <FormScreen
      actions={
        canEdit ? (
          <View className="flex-row items-center gap-3">
            <Text accessibilityRole={saveError ? "alert" : undefined} className={`flex-1 font-v2-ui text-[13px] ${saveError ? "text-v2-errorText" : dirty ? "text-v2-warn" : "text-v2-c50"}`}>
              {saveError ? t("orgSettings.saveError") : dirty ? t("orgSettings.unsaved") : justSaved ? t("orgSettings.saved") : ""}
            </Text>
            <Button variant="primary" label={saving ? t("orgSettings.saving") : t("orgSettings.save")} onPress={() => void save()} disabled={saving || !dirty} />
          </View>
        ) : (
          <Text className="text-center font-v2-ui text-[13px] text-v2-c50">{t("orgSettings.readOnly")}</Text>
        )
      }
    >
      <Text className="font-v2-ui text-[13.5px] leading-[19px] text-v2-c70">{t("orgSettings.lede", { org: organization.name })}</Text>
      <View className="mt-4">
        <LogoEditor organization={organization} url={org.logo_url} canEdit={canEdit} onChanged={() => void refreshOrg()} />
      </View>

      <Section title={t("orgSettings.companyName")}>
        <View className="rounded-v2-md bg-v2-ink2 px-4 py-3">
          <Text className="font-v2-ui-semibold text-[16px] text-v2-cream">{org.name}</Text>
        </View>
        <Hint>{t("orgSettings.nameHint")}</Hint>
      </Section>

      <Section title={t("orgSettings.instagram")}>
        <View className={`h-11 flex-row items-center rounded-v2-md bg-v2-ink3 ${fieldError("instagram") ? "border border-v2-errorText" : ""}`}>
          <Text className="pl-4 font-v2-ui text-[14px] text-v2-c50">@</Text>
          <View className="min-w-0 flex-1">
            <Input
              bare
              value={canEdit ? form.instagram : normalizeInstagram(form.instagram)}
              onChangeText={set("instagram")}
              onBlur={() => setForm((f) => (f ? { ...f, instagram: normalizeInstagram(f.instagram) } : f))}
              placeholder={canEdit ? t("orgSettings.instagramPlaceholder") : t("orgSettings.empty")}
              editable={canEdit && !saving}
              autoCapitalize="none"
              accessibilityLabel={t("orgSettings.instagram")}
            />
          </View>
        </View>
        <FieldError message={fieldError("instagram")} />
      </Section>

      <Section title={t("orgSettings.city")}>
        <Input value={form.city} onChangeText={set("city")} maxLength={ORG_CITY_MAX} placeholder={canEdit ? t("orgSettings.cityPlaceholder") : t("orgSettings.empty")} editable={canEdit && !saving} accessibilityLabel={t("orgSettings.city")} />
        <FieldError message={fieldError("city")} />
      </Section>

      <Section title={t("orgSettings.description")} aside={canEdit ? `${form.description.length}/${ORG_DESCRIPTION_MAX}` : null}>
        <Input
          value={form.description}
          onChangeText={set("description")}
          maxLength={ORG_DESCRIPTION_MAX}
          placeholder={canEdit ? t("orgSettings.descriptionPlaceholder") : t("orgSettings.empty")}
          editable={canEdit && !saving}
          multiline
          textAlignVertical="top"
          accessibilityLabel={t("orgSettings.description")}
          className="h-auto min-h-[120px] py-3 leading-[20px]"
        />
      </Section>
    </FormScreen>,
  );
}

function LogoEditor({ organization, url, canEdit, onChanged }: { organization: MyOrganization; url: string | null; canEdit: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const { getToken } = useOptionalAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [shown, setShown] = useState<string | null>(url);
  useEffect(() => setShown(url), [url]);

  const upload = async () => {
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return setError(t("eventForm.flyerPermission"));
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (result.canceled || !result.assets[0]) return;
      const a = result.assets[0];
      if (a.width && a.height && logoDimensionProblem(a.width, a.height)) {
        return setError(t("orgSettings.logoTooSmall", { width: a.width, height: a.height }));
      }
      setBusy(true);
      // Clean re-encode, longest side ≤ 1024 (same rule as the web prepareLogo).
      const size = a.width && a.height ? logoTargetSize(a.width, a.height) : null;
      const out = await ImageManipulator.manipulateAsync(a.uri, size ? [{ resize: size }] : [], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
      const body = new FormData();
      body.append("file", { uri: out.uri, name: "logo.jpg", type: "image/jpeg" } as unknown as Blob);
      body.append("organizationSlug", organization.slug);
      body.append("type", "logo");
      const res = await apiUploadFormData<{ url?: string }>("/api/upload-org-image", body, getToken);
      if (!res.url) throw new Error("no url");
      setShown(res.url);
      onChanged();
    } catch (e) {
      const status = (e as { status?: number }).status;
      setError(status && status >= 400 && status < 500 ? t("orgSettings.logoRejected", { reason: apiErrorText(e, "") }) : t("orgSettings.logoError"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const path = shown ? orgImageStoragePath(shown) : null;
    setBusy(true);
    setError(null);
    try {
      if (!path) throw new Error("unknown logo url");
      await apiClient(`/api/upload-org-image?path=${encodeURIComponent(path)}&type=logo`, { method: "DELETE", getToken });
      setShown(null);
      onChanged();
    } catch {
      setError(t("orgSettings.logoError"));
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <View className="flex-row items-center gap-4 rounded-v2-card bg-v2-ink2 p-4">
      <OrgAvatar name={organization.name} logoUrl={shown} size={72} />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{t("orgSettings.logo")}</Text>
        {canEdit ? (
          <>
            <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("orgSettings.logoHint")}</Text>
            <View className="mt-1.5 flex-row flex-wrap gap-2">
              <Button small icon="camera" label={busy ? t("orgSettings.uploading") : t("orgSettings.uploadLogo")} onPress={() => void upload()} disabled={busy} />
              {shown ? <Button small variant="danger" label={t("orgSettings.removeLogo")} onPress={() => setConfirmRemove(true)} disabled={busy} /> : null}
            </View>
            {error ? <ErrorText>{error}</ErrorText> : null}
          </>
        ) : (
          <Text className="font-v2-ui text-[12.5px] text-v2-c50">{organization.name}</Text>
        )}
      </View>
      <ConfirmDialog
        open={confirmRemove}
        message={t("orgSettings.removeLogoConfirm")}
        detail={t("orgSettings.removeLogoDetail")}
        confirmLabel={t("orgSettings.removeLogo")}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </View>
  );
}
