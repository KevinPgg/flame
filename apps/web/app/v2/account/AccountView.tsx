"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { SUPPORTED_LANGUAGES, type Language } from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../components/Icon";
import { OrgAvatar } from "../components/OrgAvatar";
import { routes } from "../lib/routes";
import type { ShellUser } from "../organizer/OrganizerShell";

const ghost =
  "inline-flex h-9 items-center justify-center gap-2 rounded-v2-pill bg-v2-ink3 px-3.5 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50";
const input =
  "h-11 w-full min-w-0 rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30 read-only:text-v2-c70";
const label = "mb-1.5 block text-[12.5px] text-v2-c70";
const card = "flex flex-col gap-5 rounded-v2-card bg-v2-ink2 p-4 sm:p-6";

/** My account (v2): name and email from Clerk, language (users.language), sign out. */
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
        <h1 className="flex-1 truncate font-v2-display-bold text-[20px] tracking-[-0.03em]">{t("account.title")}</h1>
        <Link href={routes.organizers()} className="text-[13px] font-v2-ui-semibold text-v2-c70 hover:text-v2-cream">
          {t("organizer.myOrganizers")}
        </Link>
      </header>
      <main className="mx-auto max-w-[640px] px-4 pb-24 pt-6 lg:pt-10">
        <PersonalTab me={me} />
      </main>
    </div>
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

