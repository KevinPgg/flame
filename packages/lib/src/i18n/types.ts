import type { en } from "./locales/en";

/** A plural message: chosen with `count` (Intl.PluralRules). */
export type PluralMessage = { readonly one: string; readonly other: string };

/** Same shape as `en`, with every literal widened to `string` (what other locales must match). */
type Widen<T> = T extends string
  ? string
  : T extends PluralMessage
    ? PluralMessage
    : { readonly [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof en>;

/** Dotted keys that resolve to a message, e.g. "event.getTickets" or "tickets.count". */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | PluralMessage
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Messages>;

export type TranslationParams = Record<string, string | number>;
