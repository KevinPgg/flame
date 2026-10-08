/**
 * Flame i18n — dependency-free, shared by web, mobile and the server (emails, push).
 *
 * Why not i18next/next-intl: two languages, the same dictionaries must also run in API routes
 * (emails, push), and nothing has to be installed in either app. Keys are plain dotted paths,
 * so moving to a library later only means loading these same objects into it.
 *
 * The user's choice is stored in `users.language` ('en' | 'es', default 'en').
 */
import { en } from "./locales/en";
import { es } from "./locales/es";
import type { Messages, PluralMessage, TranslationKey, TranslationParams } from "./types";

export type { Messages, PluralMessage, TranslationKey, TranslationParams } from "./types";

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Flame 2.0 ships in English; users can switch in Settings. */
export const DEFAULT_LANGUAGE: Language = "en";

export const MESSAGES: Record<Language, Messages> = { en, es };

/** BCP-47 locale used for dates, numbers and currency per language. */
export const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  en: "en-US",
  es: "es-EC",
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Normalize anything (DB value, "es-EC", "ES", Accept-Language header, null) to a supported
 * language. Unknown → DEFAULT_LANGUAGE.
 */
export function resolveLanguage(value: unknown): Language {
  if (typeof value !== "string") return DEFAULT_LANGUAGE;
  for (const part of value.split(",")) {
    const base = part.trim().split(/[-_;]/)[0]?.toLowerCase();
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

function lookup(messages: Messages, key: string): string | PluralMessage | undefined {
  let node: unknown = messages;
  for (const segment of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "one" in node && "other" in node) {
    return node as PluralMessage;
  }
  return undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

function pluralCategory(language: Language, count: number): string {
  // Guard for JS engines without Intl.PluralRules; en/es only distinguish "one" vs "other".
  if (typeof Intl === "undefined" || typeof Intl.PluralRules !== "function") {
    return count === 1 ? "one" : "other";
  }
  return new Intl.PluralRules(LOCALE_BY_LANGUAGE[language]).select(count);
}

/**
 * Translate a key. Falls back to English, then to the key itself, so a missing string
 * never crashes a screen (it shows up visibly instead).
 */
export function translate(
  language: Language,
  key: TranslationKey,
  params?: TranslationParams
): string {
  const message = lookup(MESSAGES[language], key) ?? lookup(MESSAGES[DEFAULT_LANGUAGE], key);
  if (message === undefined) return key;
  if (typeof message === "string") return interpolate(message, params);

  const count = Number(params?.count ?? 0);
  return interpolate(pluralCategory(language, count) === "one" ? message.one : message.other, params);
}

/** Bind a language once: `const t = createTranslator("es"); t("event.getTickets")`. */
export function createTranslator(language: Language) {
  return (key: TranslationKey, params?: TranslationParams) => translate(language, key, params);
}

export type Translator = ReturnType<typeof createTranslator>;
