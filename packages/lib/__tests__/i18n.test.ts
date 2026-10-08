import { describe, it, expect } from "vitest";
import {
  MESSAGES,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  createTranslator,
  resolveLanguage,
  translate,
} from "../src/i18n";
import type { TranslationKey } from "../src/i18n";

/** Flatten a message tree to dotted keys (plural objects count as one leaf). */
function keysOf(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  const obj = node as Record<string, unknown>;
  if ("one" in obj && "other" in obj) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
}

describe("i18n dictionaries", () => {
  it("every language has exactly the same keys as English", () => {
    const base = keysOf(MESSAGES.en).sort();
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(keysOf(MESSAGES[lang]).sort()).toEqual(base);
    }
  });

  it("no message is empty", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const key of keysOf(MESSAGES[lang])) {
        expect(translate(lang, key as TranslationKey, { count: 2 }).trim()).not.toBe("");
      }
    }
  });

  it("placeholders match between languages", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of keysOf(MESSAGES.en)) {
      for (const count of [1, 2]) {
        const enText = translate("en", key as TranslationKey, { count });
        const esText = translate("es", key as TranslationKey, { count });
        // Untouched placeholders (other than count) must be the same set in both.
        expect(placeholders(esText)).toEqual(placeholders(enText));
      }
    }
  });
});

describe("translate", () => {
  it("defaults to English", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(translate("en", "event.getTickets")).toBe("Get tickets");
    expect(translate("es", "event.getTickets")).toBe("Comprar tickets");
  });

  it("interpolates params and leaves unknown placeholders visible", () => {
    expect(translate("es", "tickets.holdNotice", { minutes: 30 })).toBe(
      "Te guardamos los tickets 30 minutos mientras completas el pago."
    );
    expect(translate("en", "common.from")).toBe("From {price}");
  });

  it("picks plural forms", () => {
    const t = createTranslator("en");
    expect(t("tickets.count", { count: 1 })).toBe("1 ticket");
    expect(t("tickets.count", { count: 3 })).toBe("3 tickets");
    expect(translate("es", "tickets.count", { count: 0 })).toBe("0 tickets");
  });

  it("returns the key for an unknown key instead of throwing", () => {
    expect(translate("es", "nope.missing" as TranslationKey)).toBe("nope.missing");
  });
});

describe("resolveLanguage", () => {
  it.each([
    ["es", "es"],
    ["es-EC", "es"],
    ["ES", "es"],
    ["en-US", "en"],
    ["fr-FR,es;q=0.8", "es"],
    ["fr", "en"],
    [null, "en"],
    [undefined, "en"],
    ["", "en"],
  ])("%s → %s", (input, expected) => {
    expect(resolveLanguage(input)).toBe(expected);
  });
});
