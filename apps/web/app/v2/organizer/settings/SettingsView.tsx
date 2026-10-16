"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import {
  ORG_DESCRIPTION_MAX,
  ORG_CITY_MAX,
  SUPPORTED_LANGUAGES,
  canAccessOrgSettings,
  logoFileProblem,
  normalizeInstagram,
  orgFormDirty,
  orgFormFrom,
  orgFormPayload,
  orgImageStoragePath,
  validateOrgForm,
  type Language,
  type OrgForm,
  type OrgMemberRole,
  type OrgProfile,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { OrgAvatar } from "../../components/OrgAvatar";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { routes } from "../../lib/routes";
import { OrganizerShell, type ShellUser } from "../OrganizerShell";
import { useOrganizerModel, type Org } from "../useOrganizerModel";

export type SettingsTab = "personal" | "organization";

const primary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-50";
const ghost =
  "inline-flex h-9 items-center justify-center gap-2 rounded-v2-pill bg-v2-ink3 px-3.5 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50";
const input =
  "h-11 w-full min-w-0 rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30 read-only:text-v2-c70";
const label = "mb-1.5 block text-[12.5px] text-v2-c70";
const card = "flex flex-col gap-5 rounded-v2-card bg-v2-ink2 p-4 sm:p-6";

/**
 * Settings v2 (prototype "ow:settings"): Personal (account from Clerk, language, sign out) and
 * Organization (logo, name read-only, Instagram, city, description). Same APIs as v1:
 * PATCH /api/organizations/[id] and /api/upload-org-image; language → PUT /api/me/language.
 */
export default function SettingsView({
  organization,
  organizations,
  role,
  me = null,
  details,
  initialTab,
}: {
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  me?: ShellUser | null;
  details: OrgProfile & { name: string; logo_url: string | null };
  initialTab: SettingsTab;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { model } = useOrganizerModel(organization, role);
  const [tab, setTabState] = useState<SettingsTab>(initialTab);

  const setTab = (next: SettingsTab) => {
    setTabState(next);
    const q = new URLSearchParams(params.toString());
    q.set("tab", next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const tabs: Array<[SettingsTab, string, "user" | "settings"]> = [
    ["personal", t("orgSettings.tabPersonal"), "user"],
    ["organization", t("orgSettings.tabOrganization"), "settings"],
  ];

  return (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      section="settings"
      title={t("settings.title")}
      backHref={routes.dashboard(organization.slug)}
      crumbs={[
        { label: t("organizer.myOrganizers"), href: routes.organizers() },
        { label: organization.name, href: routes.dashboard(organization.slug) },
        { label: t("settings.title") },
      ]}
      me={me}
    >
      <section className="mx-auto max-w-[720px] px-4 pt-5 lg:px-10 lg:pt-8">
        <div role="tablist" aria-label={t("settings.title")} className="mb-5 flex gap-1 rounded-v2-pill bg-v2-ink2 p-1">
          {tabs.map(([key, text, icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-v2-pill text-[14px] font-v2-ui-semibold transition-colors ${
                tab === key ? "bg-v2-ink4 text-v2-cream" : "text-v2-c70 hover:text-v2-cream"
              }`}
            >
              <Icon name={icon} size={16} />
              {text}
            </button>
          ))}
        </div>

        {tab === "personal" ? (
          <PersonalTab me={me} />
        ) : (
          <OrganizationTab
            organization={organization}
            details={details}
            canEdit={canAccessOrgSettings(role)}
            onSaved={() => router.refresh()}
          />
        )}
      </section>
    </OrganizerShell>
  );
}

function PersonalTab({ me }: { me: ShellUser | null }) {
  const { t, language, setLanguage } = useI18n();
  const { signOut } = useClerk();
  const router = useRouter();
  const [langError, setLangError] = useState(false);
  const [savingLang, setSavingLang] = useState(false);

  const changeLanguage = async (next: Language) => {
    if (next === language) return;
    const previous = language;
    setLangError(false);
    setLanguage(next); // switch right away; roll back if it can't be saved
    setSavingLang(true);
    try {
      const res = await fetch("/api/me/language", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh(); // server-rendered text (and the layout) follow the saved language
    } catch {
      setLanguage(previous);
      setLangError(true);
    } finally {
      setSavingLang(false);
    }
  };

  const doSignOut = async () => {
    try {
      await signOut();
    } finally {
      router.push("/");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <div className="flex items-center gap-4">
          <OrgAvatar name={me?.name || "?"} logoUrl={me?.imageUrl} size={56} round />
          <p className="text-[13px] text-v2-c50">{t("orgSettings.accountHint")}</p>
        </div>
        <div>
          <label htmlFor="st-name" className={label}>
            {t("orgSettings.fullName")}
          </label>
          <input id="st-name" className={input} value={me?.name || t("orgSettings.empty")} readOnly />
        </div>
        <div>
          <label htmlFor="st-email" className={label}>
            {t("orgSettings.email")}
          </label>
          <input id="st-email" className={input} value={me?.email || t("orgSettings.empty")} readOnly />
        </div>
      </div>

      <div className={card}>
        <div>
          <label htmlFor="st-lang" className={label}>
            {t("settings.language")}
          </label>
          <select
            id="st-lang"
            className={input}
            value={language}
            disabled={savingLang}
            onChange={(e) => void changeLanguage(e.target.value as Language)}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {t(`languages.${l}`)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12.5px] text-v2-c50">{t("orgSettings.languageHint")}</p>
          {langError && (
            <p role="alert" className="mt-1.5 text-[13px] text-v2-errorText">
              {t("orgSettings.languageSaveError")}
            </p>
          )}
        </div>
      </div>

      <div>
        <button type="button" onClick={() => void doSignOut()} className={ghost}>
          {t("settings.signOut")}
        </button>
      </div>
    </div>
  );
}

function OrganizationTab({
  organization,
  details,
  canEdit,
  onSaved,
}: {
  organization: Org;
  details: OrgProfile & { name: string; logo_url: string | null };
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [saved, setSaved] = useState<OrgForm>(() => orgFormFrom(details));
  const [form, setForm] = useState<OrgForm>(() => orgFormFrom(details));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const errors = validateOrgForm(form);
  const dirty = orgFormDirty(saved, form);
  const set = (k: keyof OrgForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaveError(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!dirty || Object.keys(errors).length > 0) return;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orgFormPayload(form)),
      });
      if (!res.ok) throw new Error(String(res.status));
      const stored = orgFormPayload(form);
      const next = orgFormFrom(stored);
      setSaved(next);
      setForm(next);
      setTouched(false);
      onSaved();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (k: keyof OrgForm) =>
    touched && errors[k] ? (errors[k] === "instagram" ? t("orgSettings.instagramInvalid") : t("orgSettings.tooLong")) : null;

  return (
    <div className="flex flex-col gap-4">
      <LogoEditor organization={organization} initialUrl={details.logo_url} canEdit={canEdit} onChanged={onSaved} />

      <form onSubmit={save} noValidate className={card}>
        {!canEdit && <p className="text-[13px] text-v2-c50">{t("orgSettings.readOnly")}</p>}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="of-name" className={label}>
              {t("orgSettings.companyName")}
            </label>
            <input id="of-name" className={input} value={details.name} readOnly aria-describedby="of-name-hint" />
            <p id="of-name-hint" className="mt-1.5 text-[12px] text-v2-c50">
              {t("orgSettings.nameHint")}
            </p>
          </div>
          <div>
            <label htmlFor="of-ig" className={label}>
              {t("orgSettings.instagram")}
            </label>
            <div className="flex h-11 items-center rounded-v2-md bg-v2-ink3 focus-within:ring-1 focus-within:ring-v2-c30">
              <span className="pl-4 text-[14px] text-v2-c50">@</span>
              <input
                id="of-ig"
                className="h-full min-w-0 flex-1 bg-transparent pl-1 pr-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none read-only:text-v2-c70"
                value={canEdit ? form.instagram : normalizeInstagram(form.instagram)}
                onChange={set("instagram")}
                onBlur={() => setForm((f) => ({ ...f, instagram: normalizeInstagram(f.instagram) }))}
                placeholder={canEdit ? t("orgSettings.instagramPlaceholder") : t("orgSettings.empty")}
                readOnly={!canEdit}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(fieldError("instagram"))}
              />
            </div>
            {fieldError("instagram") && <p className="mt-1.5 text-[12.5px] text-v2-errorText">{fieldError("instagram")}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="of-city" className={label}>
            {t("orgSettings.city")}
          </label>
          <input
            id="of-city"
            className={input}
            value={form.city}
            onChange={set("city")}
            maxLength={ORG_CITY_MAX}
            placeholder={canEdit ? t("orgSettings.cityPlaceholder") : t("orgSettings.empty")}
            readOnly={!canEdit}
          />
          {fieldError("city") && <p className="mt-1.5 text-[12.5px] text-v2-errorText">{fieldError("city")}</p>}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="of-desc" className={label}>
              {t("orgSettings.description")}
            </label>
            {canEdit && (
              <span className="text-[12px] tabular-nums text-v2-c50">
                {form.description.length}/{ORG_DESCRIPTION_MAX}
              </span>
            )}
          </div>
          <textarea
            id="of-desc"
            rows={5}
            className={`${input} h-auto resize-none py-3 leading-relaxed`}
            value={form.description}
            onChange={set("description")}
            maxLength={ORG_DESCRIPTION_MAX}
            placeholder={canEdit ? t("orgSettings.descriptionPlaceholder") : t("orgSettings.empty")}
            readOnly={!canEdit}
          />
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-v2-c06 pt-4">
            {saveError ? (
              <span role="alert" className="mr-auto text-[13px] text-v2-errorText">
                {t("orgSettings.saveError")}
              </span>
            ) : (
              <span aria-live="polite" className={`mr-auto text-[13px] ${dirty ? "text-v2-warn" : "text-v2-c50"}`}>
                {dirty ? t("orgSettings.unsaved") : t("orgSettings.saved")}
              </span>
            )}
            <button type="submit" disabled={saving || !dirty} className={primary}>
              {saving ? t("orgSettings.saving") : t("orgSettings.save")}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function LogoEditor({
  organization,
  initialUrl,
  canEdit,
  onChanged,
}: {
  organization: Org;
  initialUrl: string | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const problem = logoFileProblem(file);
    if (problem) return setError(problem === "type" ? t("orgSettings.logoType") : t("orgSettings.logoSize"));
    setError(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("organizationSlug", organization.slug);
      body.append("type", "logo");
      const res = await fetch("/api/upload-org-image", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!res.ok || !json?.url) throw new Error(String(res.status));
      setUrl(json.url);
      onChanged();
    } catch {
      setError(t("orgSettings.logoError"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!url) return;
    const path = orgImageStoragePath(url);
    setBusy(true);
    setError(null);
    try {
      if (!path) throw new Error("unknown logo url");
      const res = await fetch(`/api/upload-org-image?path=${encodeURIComponent(path)}&type=logo`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setUrl(null);
      onChanged();
    } catch {
      setError(t("orgSettings.logoError"));
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <div className={`${card} !flex-row items-center gap-4`}>
      <OrgAvatar name={organization.name} logoUrl={url} size={72} />
      <div className="min-w-0 flex-1">
        <b className="block text-[14px] font-v2-ui-semibold">{t("orgSettings.logo")}</b>
        {canEdit ? (
          <>
            <p className="mb-2.5 mt-0.5 text-[12.5px] text-v2-c50">{t("orgSettings.logoHint")}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={ghost}>
                <Icon name="camera" size={15} />
                {busy ? t("orgSettings.uploading") : t("orgSettings.uploadLogo")}
              </button>
              {url && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmRemove(true)}
                  className="inline-flex h-9 items-center rounded-v2-pill px-3.5 text-[13px] font-v2-ui-semibold text-v2-errorText hover:bg-v2-ink3 disabled:opacity-50"
                >
                  {t("orgSettings.removeLogo")}
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              data-testid="logo-input"
              onChange={(e) => void upload(e)}
            />
            {error && (
              <p role="alert" className="mt-2 text-[13px] text-v2-errorText">
                {error}
              </p>
            )}
          </>
        ) : (
          <p className="mt-0.5 text-[12.5px] text-v2-c50">{organization.name}</p>
        )}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        message={t("orgSettings.removeLogoConfirm")}
        detail={t("orgSettings.removeLogoDetail")}
        confirmLabel={t("orgSettings.removeLogo")}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
