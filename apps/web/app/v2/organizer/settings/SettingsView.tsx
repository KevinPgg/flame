"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ORG_DESCRIPTION_MAX,
  ORG_CITY_MAX,
  canAccessOrgSettings,
  logoFileProblem,
  normalizeInstagram,
  orgFormDirty,
  orgFormFrom,
  orgFormPayload,
  orgImageStoragePath,
  validateOrgForm,
  type OrgForm,
  type OrgMemberRole,
  type OrgProfile,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { OrgAvatar } from "../../components/OrgAvatar";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { routes } from "../../lib/routes";
import { prepareLogo } from "../../lib/prepare-logo";
import { OrganizerShell, type ShellUser } from "../OrganizerShell";
import { useOrganizerModel, type Org } from "../useOrganizerModel";

const primary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-50";
const ghost =
  "inline-flex h-9 items-center justify-center gap-2 rounded-v2-pill bg-v2-ink3 px-3.5 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50";
const input =
  "h-11 w-full min-w-0 rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30 read-only:text-v2-c70";
const label = "mb-1.5 block text-[12.5px] text-v2-c70";
const card = "flex flex-col gap-5 rounded-v2-card bg-v2-ink2 p-4 sm:p-6";

/**
 * Organization settings v2 (prototype "ow:settings", Organization tab): logo, name read-only,
 * Instagram, city, description. Same APIs as v1: PATCH /api/organizations/[id] and
 * /api/upload-org-image. The person's own settings (language, sign out) live apart, in
 * /v2/account (decision 2026-10-20: don't mix account and organization settings).
 */
export default function SettingsView({
  organization,
  organizations,
  role,
  me = null,
  details,
}: {
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  me?: ShellUser | null;
  details: OrgProfile & { name: string; logo_url: string | null };
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { model } = useOrganizerModel(organization, role);

  return (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      section="settings"
      title={t("orgSettings.title")}
      backHref={canAccessOrgSettings(role) ? routes.manage(organization.slug) : routes.dashboard(organization.slug)}
      crumbs={[
        { label: organization.name, href: routes.dashboard(organization.slug) },
        ...(canAccessOrgSettings(role) ? [{ label: t("manage.title"), href: routes.manage(organization.slug) }] : []),
        { label: t("orgSettings.title") },
      ]}
      me={me}
    >
      <section className="mx-auto max-w-[720px] px-4 pt-5 lg:px-10 lg:pt-8">
        <p className="mb-5 text-[13.5px] text-v2-c70">{t("orgSettings.lede", { org: organization.name })}</p>
        <OrganizationTab
          organization={organization}
          details={details}
          canEdit={canAccessOrgSettings(role)}
          onSaved={() => router.refresh()}
        />
      </section>
    </OrganizerShell>
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
    const picked = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!picked) return;
    if (logoFileProblem({ type: picked.type, size: 0 }) === "type") return setError(t("orgSettings.logoType"));
    setError(null);
    setBusy(true);
    try {
      // Real size check + clean re-encode in the browser (see prepareLogo).
      const prepared = await prepareLogo(picked);
      if (!prepared.ok) {
        setError(
          prepared.reason === "tooSmall"
            ? t("orgSettings.logoTooSmall", { width: prepared.width ?? 0, height: prepared.height ?? 0 })
            : t("orgSettings.logoUnreadable")
        );
        return;
      }
      if (logoFileProblem(prepared.file) === "size") return setError(t("orgSettings.logoSize"));
      const body = new FormData();
      body.append("file", prepared.file);
      body.append("organizationSlug", organization.slug);
      body.append("type", "logo");
      const res = await fetch("/api/upload-org-image", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !json?.url) {
        // Say why: the API's reason for 4xx (permissions, type…), our generic text otherwise.
        setError(
          res.status >= 400 && res.status < 500 && json?.error
            ? t("orgSettings.logoRejected", { reason: json.error })
            : t("orgSettings.logoError")
        );
        return;
      }
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
