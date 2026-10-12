"use client";

import type { Language } from "@project-flame/lib";
import { I18nProvider } from "../lib/i18n";

export default function V2Providers({
  language,
  children,
}: {
  language: Language;
  children: React.ReactNode;
}) {
  // Language changes (Settings, phase 2) will persist through onLanguageChange.
  return <I18nProvider initialLanguage={language}>{children}</I18nProvider>;
}
