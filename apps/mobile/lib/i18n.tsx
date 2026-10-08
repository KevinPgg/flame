/**
 * Flame 2.0 i18n — React binding. Dictionaries and `translate()` live in @project-flame/lib.
 *
 * Usage:
 *   <I18nProvider initialLanguage={profile?.language} onLanguageChange={saveToProfile}>…
 *   const { t, language, setLanguage, locale } = useI18n();
 *   t("event.getTickets"); t("tickets.count", { count: 2 });
 *
 * Not mounted yet: the first Flame 2.0 screen (phase 1) mounts it at the root.
 * Persistence: `users.language` (migration 20261008170000). `onLanguageChange` is where the
 * caller saves it; this file does not talk to Supabase.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LANGUAGE,
  LOCALE_BY_LANGUAGE,
  createTranslator,
  resolveLanguage,
  type Language,
  type Translator,
} from "@project-flame/lib";

type I18nContextValue = {
  language: Language;
  /** BCP-47 locale for Intl date/number formatting ("en-US" | "es-EC"). */
  locale: string;
  t: Translator;
  setLanguage: (language: Language) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLanguage,
  onLanguageChange,
}: {
  children: ReactNode;
  /** Anything: DB value, device locale, null. Normalized with resolveLanguage(). */
  initialLanguage?: unknown;
  onLanguageChange?: (language: Language) => void;
}) {
  const [language, setLanguageState] = useState<Language>(() => resolveLanguage(initialLanguage));

  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);
      onLanguageChange?.(next);
    },
    [onLanguageChange]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: LOCALE_BY_LANGUAGE[language],
      t: createTranslator(language),
      setLanguage,
    }),
    [language, setLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Outside a provider it returns the default language instead of throwing, so a v2 component
 * rendered in an old v1 screen still works (in English).
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    language: DEFAULT_LANGUAGE,
    locale: LOCALE_BY_LANGUAGE[DEFAULT_LANGUAGE],
    t: createTranslator(DEFAULT_LANGUAGE),
    setLanguage: () => {},
  };
}
