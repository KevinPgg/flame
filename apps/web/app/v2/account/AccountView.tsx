"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  NON_DISMISSABLE_NOTIFICATION_TYPES,
  NOTIFICATION_PREFERENCE_ITEMS,
  SUPPORTED_LANGUAGES,
  type Language,
  type NotificationPreferences,
  type NotificationType,
} from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import { useIsSupportAdmin, useAdminOrganizations } from "../../lib/hooks/useAdminOrganizations";
import { Icon, type IconName } from "../components/Icon";
import { OrgAvatar } from "../components/OrgAvatar";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { routes } from "../lib/routes";
import type { ShellUser } from "../organizer/OrganizerShell";

const ghost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13.5px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50";
const input =
  "h-11 w-full min-w-0 rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30 read-only:text-v2-c70";
const label = "mb-1.5 block text-[12.5px] text-v2-c70";
const card = "flex flex-col gap-5 rounded-v2-card bg-v2-ink2 p-4 sm:p-6";

/**
 * One Settings for the person (decision 2026-10-23: settings live in three places only — Clerk
 * account management, this, and the organization's settings in Manage). Same sections as the
 * app's Settings: account (from Clerk, with Clerk's own profile for password / e-mails /
 * security), language, notifications (GET/PUT /api/me/notification-preferences), organizer
 * approvals (Flame support only), sign out, delete account.
 */
export default function AccountView({ me }: { me: ShellUser | null }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#161616] bg-v2-ink/90 px-4 backdrop-blur lg:px-10">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("common.back")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-v2-c70 hover:bg-v2-ink3 hover:text-v2-cream"
        >
          <Icon name="back" size={20} />
        </button>
        <h1 className="flex-1 truncate font-v2-display-bold text-[20px] tracking-[-0.03em]">{t("userSettings.title")}</h1>
        <Link href={routes.organizers()} className="text-[13px] font-v2-ui-semibold text-v2-c70 hover:text-v2-cream">
          {t("organizer.myOrganizers")}
        </Link>
      </header>
      <main className="mx-auto flex max-w-[640px] flex-col gap-7 px-4 pb-24 pt-6 lg:pt-10">
        <AccountSection me={me} />
        <LanguageSection />
        <NotificationsSection />
        <SupportSection />
        <SessionSection />
      </main>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[12px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50">{title}</h2>
      {children}
    </section>
  );
}

function RowLink({ icon, title, hint, onClick, href, badge }: { icon: IconName; title: string; hint?: string; onClick?: () => void; href?: string; badge?: number }) {
  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-v2-md bg-v2-ink3 text-v2-c90">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <b className="block text-[14.5px] font-v2-ui-semibold">{title}</b>
        {hint && <small className="block text-[12.5px] leading-snug text-v2-c50">{hint}</small>}
      </span>
      {badge ? <span className="min-w-[22px] rounded-v2-pill bg-v2-dot px-1.5 text-center text-[12px] font-v2-ui-bold">{badge}</span> : null}
      <Icon name="chev" size={16} className="text-v2-c50" />
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-v2-card bg-v2-ink2 px-4 py-3.5 hover:bg-v2-ink3";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

function AccountSection({ me }: { me: ShellUser | null }) {
  const { t } = useI18n();
  const clerk = useClerk();
  return (
    <Block title={t("userSettings.account")}>
      <div className={card}>
        <div className="flex items-center gap-4">
          <OrgAvatar name={me?.name || "?"} logoUrl={me?.imageUrl} size={56} round />
          <p className="text-[13px] text-v2-c50">{t("userSettings.accountHint")}</p>
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
      {typeof clerk.openUserProfile === "function" && (
        <div className="mt-2.5">
          {/* Clerk's own profile (password, e-mails, security, photo): the "Clerk account management" place. */}
          <RowLink icon="shield" title={t("userSettings.manageAccount")} onClick={() => clerk.openUserProfile()} />
        </div>
      )}
    </Block>
  );
}

function LanguageSection() {
  const { t, language, setLanguage } = useI18n();
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

  return (
    <Block title={t("userSettings.language")}>
      <div className={card}>
        <div>
          <label htmlFor="st-lang" className={label}>
            {t("settings.language")}
          </label>
          <select id="st-lang" className={input} value={language} disabled={savingLang} onChange={(e) => void changeLanguage(e.target.value as Language)}>
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
    </Block>
  );
}

const NOTIF_KEY = ["me-notification-preferences"];

function NotificationsSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = useState(false);
  const prefs = useQuery<{ preferences: NotificationPreferences }>({
    queryKey: NOTIF_KEY,
    queryFn: async () => {
      const res = await fetch("/api/me/notification-preferences");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
  });
  // Organizer notifications only for people in an organization.
  const orgs = useQuery<{ organizations?: unknown[] }>({
    queryKey: ["organizations"],
    queryFn: async () => {
      const res = await fetch("/api/organizations");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 60_000,
  });
  const isOrganizer = (orgs.data?.organizations ?? []).length > 0;

  const toggle = async (type: NotificationType, on: boolean) => {
    if (NON_DISMISSABLE_NOTIFICATION_TYPES.has(type)) return;
    setError(false);
    const previous = queryClient.getQueryData<{ preferences: NotificationPreferences }>(NOTIF_KEY);
    if (previous) queryClient.setQueryData(NOTIF_KEY, { preferences: { ...previous.preferences, [type]: on } });
    try {
      const res = await fetch("/api/me/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [type]: on }),
      });
      if (!res.ok) throw new Error(String(res.status));
      queryClient.setQueryData(NOTIF_KEY, await res.json());
    } catch {
      if (previous) queryClient.setQueryData(NOTIF_KEY, previous);
      setError(true);
    }
  };

  const group = (organizer: boolean) => (
    <div>
      <h3 className="mb-1.5 px-1 text-[12.5px] text-v2-c70">{organizer ? t("userSettings.notificationsOrganizer") : t("userSettings.notificationsGeneral")}</h3>
      <ul className="divide-y divide-v2-c10 overflow-hidden rounded-v2-card bg-v2-ink2">
        {NOTIFICATION_PREFERENCE_ITEMS.filter((i) => i.organizer === organizer).map(({ type }) => {
          const locked = NON_DISMISSABLE_NOTIFICATION_TYPES.has(type);
          const on = locked || (prefs.data?.preferences[type] ?? true);
          return (
            <li key={type}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-disabled={locked}
                disabled={locked}
                onClick={() => void toggle(type, !on)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
              >
                <span className="min-w-0 flex-1">
                  <b className="block text-[14px] font-v2-ui-semibold">{t(`userSettings.notif.${type}.title`)}</b>
                  <small className="block text-[12.5px] text-v2-c50">
                    {t(`userSettings.notif.${type}.hint`)}
                    {locked ? ` · ${t("userSettings.alwaysOn")}` : ""}
                  </small>
                </span>
                <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-v2-pill transition-colors ${on ? "bg-v2-flame" : "bg-v2-ink4"} ${locked ? "opacity-50" : ""}`}>
                  <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <Block title={t("userSettings.notifications")}>
      {prefs.isLoading ? (
        <div className="h-48 animate-pulse rounded-v2-card bg-v2-ink2" />
      ) : prefs.isError ? (
        <p className="rounded-v2-card bg-v2-ink2 p-4 text-[13.5px] text-v2-errorText">{t("errors.generic")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {group(false)}
          {isOrganizer && group(true)}
          {error && (
            <p role="alert" className="text-[13px] text-v2-errorText">
              {t("userSettings.notificationsError")}
            </p>
          )}
        </div>
      )}
    </Block>
  );
}

/** Flame support only: entry to the organizer approvals (2.0). */
function SupportSection() {
  const { t } = useI18n();
  const { isAdmin, isLoading } = useIsSupportAdmin();
  const pending = useAdminOrganizations("pending", isAdmin);
  if (isLoading || !isAdmin) return null;
  const n = pending.data?.organizations.length ?? 0;
  return (
    <Block title={t("supportQueue.title")}>
      <RowLink
        icon="check"
        title={t("supportQueue.entry")}
        hint={n > 0 ? t("supportQueue.entryHint", { count: n }) : t("supportQueue.entryNone")}
        href={routes.supportQueue()}
        badge={n || undefined}
      />
    </Block>
  );
}

function SessionSection() {
  const { t } = useI18n();
  const { signOut } = useClerk();
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const doSignOut = async () => {
    try {
      await signOut();
    } finally {
      router.push("/");
    }
  };

  // Same server flow as the app (Clerk deletes the user; its webhook cleans up / anonymizes).
  const doDelete = async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      const res = await fetch("/api/user/delete", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setDeleteError(true);
      setDeleting(false);
      setStep(0);
      return;
    }
    try {
      await signOut();
    } catch {
      /* the session is already gone server-side */
    }
    router.push("/");
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-v2-c10 pt-6">
      <button type="button" onClick={() => void doSignOut()} className={ghost}>
        {t("settings.signOut")}
      </button>
      <button
        type="button"
        onClick={() => setStep(1)}
        disabled={deleting}
        className="inline-flex h-10 items-center rounded-v2-pill px-4 text-[13.5px] font-v2-ui-semibold text-v2-errorText hover:bg-v2-ink3 disabled:opacity-50"
      >
        {deleting ? t("userSettings.deleting") : t("userSettings.deleteAccount")}
      </button>
      {deleteError && (
        <p role="alert" className="w-full text-[13px] text-v2-errorText">
          {t("userSettings.deleteError")}
        </p>
      )}
      <ConfirmDialog
        open={step === 1}
        message={t("userSettings.deleteTitle")}
        detail={t("userSettings.deleteDetail")}
        confirmLabel={t("userSettings.deleteContinue")}
        onConfirm={() => setStep(2)}
        onCancel={() => setStep(0)}
      />
      <ConfirmDialog
        open={step === 2}
        message={t("userSettings.deleteSureTitle")}
        detail={t("userSettings.deleteSureDetail")}
        confirmLabel={t("userSettings.deleteConfirm")}
        busy={deleting}
        onConfirm={() => void doDelete()}
        onCancel={() => setStep(0)}
      />
    </div>
  );
}
