"use client";

/**
 * Edit profile (2026-11-02, client's ask; prototype ACTS.editProfile) — our own screen, apart from
 * Settings: photo (upload / remove), first and last name (saved to Clerk by the API), Instagram
 * and avatar colour (used when there is no photo). Clerk's own page stays only for password,
 * e-mails and security (Settings → "Password, e-mails and security").
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { PROFILE_COLORS, profileColor, profileFormFrom, validateProfile, type ProfileErrorKey, type ProfileForm } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Icon } from "../../../components/Icon";
import { Skeleton } from "../../../components/Skeleton";
import { ErrorBox } from "../../../components/ErrorBox";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { prepareAvatar } from "../../../lib/prepare-avatar";
import { ProfileAvatar } from "../../ProfileAvatar";
import { MY_PROFILE_KEY, useMyProfile } from "../../useMyProfile";

const input =
  "h-11 w-full min-w-0 rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30";
const label = "mb-1.5 block text-[12.5px] text-v2-c70";
const ghost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13.5px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50";
const primary =
  "inline-flex h-12 w-full items-center justify-center rounded-v2-pill bg-v2-cream px-5 text-[15px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-50";

export default function EditProfileView() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const profile = useMyProfile();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileForm, ProfileErrorKey>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile.data && !form) setForm(profileFormFrom(profile.data));
  }, [profile.data, form]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: MY_PROFILE_KEY }),
      queryClient.invalidateQueries({ queryKey: ["user-profile"] }),
    ]);
  };

  if (profile.isError) return <div className="mx-auto max-w-[560px] px-4 pt-8"><ErrorBox message={t("editProfile.loadError")} onRetry={() => void profile.refetch()} /></div>;
  if (!profile.data || !form) return <div className="mx-auto max-w-[560px] px-4 pt-8"><Skeleton className="h-[420px] rounded-v2-card" /></div>;
  const p = profile.data;
  const name = `${form.first_name} ${form.last_name}`.trim();
  const set = (k: keyof ProfileForm, v: string | null) => {
    setForm({ ...form, [k]: v });
    setErrors((e) => ({ ...e, [k]: undefined }));
    setSaveError(null);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(false);
    setPhotoBusy(true);
    try {
      const ready = await prepareAvatar(file);
      if (!ready) throw new Error("decode");
      const body = new FormData();
      body.append("file", ready);
      body.append("type", "personal");
      const res = await fetch("/api/upload-profile-image", { method: "POST", body });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      await refresh();
    } catch {
      setPhotoError(true);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setPhotoError(false);
    try {
      const path = p.photo_url ? new URL(p.photo_url).pathname.split("/object/public/profile-images/")[1] : null;
      if (!path) throw new Error("unknown photo url");
      const res = await fetch(`/api/upload-profile-image?path=${encodeURIComponent(path)}&type=personal`, { method: "DELETE" });
      if (!res.ok) throw new Error(`delete ${res.status}`);
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
      const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v.value) });
      const j = (await res.json().catch(() => ({}))) as { code?: string; fields?: typeof errors };
      if (!res.ok) {
        if (j.fields) setErrors(j.fields);
        setSaveError(j.code === "NAME_NOT_SAVED" ? t("editProfile.errors.nameNotSaved") : t("editProfile.errors.save"));
        return;
      }
      await refresh();
      await user?.reload().catch(() => undefined); // the name in the menus comes from Clerk
      router.push("/profile");
    } catch {
      setSaveError(t("editProfile.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const err = (k: keyof ProfileForm) => (errors[k] ? <small className="mt-1 block text-[12.5px] text-v2-dot">{t(`editProfile.errors.${errors[k]}`)}</small> : null);
  const shown = profileColor(form.avatar_color, name || p.email);

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-16 pt-6 lg:pt-10">
      <div className="mb-5 flex items-center gap-3">
        <Link href="/profile" aria-label={t("common.back")} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(28,28,28,0.82)] hover:bg-v2-ink4">
          <Icon name="back" size={19} />
        </Link>
        <div>
          <h1 className="font-v2-display-bold text-[24px] tracking-[-0.02em]">{t("editProfile.title")}</h1>
          <p className="text-[13.5px] text-v2-c50">{t("editProfile.lede")}</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-v2-card bg-v2-ink2 p-5">
        <ProfileAvatar name={name} email={p.email} photo={p.photo_url} color={form.avatar_color} size={96} />
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className={ghost} disabled={photoBusy} onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={16} />
            {photoBusy ? t("editProfile.photoUploading") : p.photo_url ? t("editProfile.photoChange") : t("editProfile.photoAdd")}
          </button>
          {p.photo_url ? (
            <button type="button" className={ghost} disabled={photoBusy} onClick={() => setConfirmRemove(true)}>
              {t("editProfile.photoRemove")}
            </button>
          ) : null}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t("editProfile.photoChange")} onChange={(e) => void pickPhoto(e.target.files?.[0])} />
        {photoError ? <small className="text-[12.5px] text-v2-dot">{t("editProfile.photoError")}</small> : null}
      </div>

      <form
        className="mt-4 flex flex-col gap-4 rounded-v2-card bg-v2-ink2 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ep-first" className={label}>{t("editProfile.firstName")}</label>
            <input id="ep-first" className={input} value={form.first_name} maxLength={50} autoComplete="given-name" onChange={(e) => set("first_name", e.target.value)} />
            {err("first_name")}
          </div>
          <div>
            <label htmlFor="ep-last" className={label}>{t("editProfile.lastName")}</label>
            <input id="ep-last" className={input} value={form.last_name} maxLength={50} autoComplete="family-name" onChange={(e) => set("last_name", e.target.value)} />
            {err("last_name")}
          </div>
        </div>
        <div>
          <label htmlFor="ep-ig" className={label}>{t("editProfile.instagram")}</label>
          <div className="flex items-center rounded-v2-md bg-v2-ink3 pl-4 focus-within:ring-1 focus-within:ring-v2-c30">
            <span className="text-[14px] text-v2-c50">@</span>
            <input id="ep-ig" className={`${input} bg-transparent pl-1 focus:ring-0`} value={form.instagram} placeholder={t("editProfile.instagramPlaceholder")} autoCapitalize="none" autoCorrect="off" onChange={(e) => set("instagram", e.target.value)} />
          </div>
          {err("instagram") ?? <small className="mt-1 block text-[12.5px] text-v2-c50">{t("editProfile.instagramHint")}</small>}
        </div>
        <fieldset>
          <legend className={label}>{t("editProfile.color")}</legend>
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={t("editProfile.color")}>
            {PROFILE_COLORS.map((c, i) => {
              const on = shown.toUpperCase() === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={t("editProfile.colorPick", { n: i + 1 })}
                  onClick={() => set("avatar_color", c)}
                  className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-v2-ink2 ${on ? "ring-2 ring-v2-cream" : ""}`}
                  style={{ backgroundColor: c }}
                />
              );
            })}
          </div>
          <small className="mt-1.5 block text-[12.5px] text-v2-c50">{t("editProfile.colorHint")}</small>
          {err("avatar_color")}
        </fieldset>
        {saveError ? <p role="alert" className="text-[13px] text-v2-dot">{saveError}</p> : null}
        <button type="submit" className={primary} disabled={saving}>
          {saving ? t("editProfile.saving") : t("editProfile.save")}
        </button>
      </form>

      <ConfirmDialog
        open={confirmRemove}
        message={t("editProfile.photoRemoveConfirm")}
        confirmLabel={t("editProfile.photoRemove")}
        busy={photoBusy}
        onConfirm={() => void removePhoto()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
