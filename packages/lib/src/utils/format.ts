/**
 * Formatting Utilities
 *
 * Common formatting functions used across the application.
 * All monetary formatters accept an optional currency parameter (ISO 4217).
 * When omitted, USD is used for backward compatibility.
 */

// Re-export formatPrice from pricing module (single source of truth)
export { formatPrice } from "../pricing/calculations";

export const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "VND", "VUV", "XAF", "XOF", "XPF",
]);
// UGX (Uganda Shilling): Stripe now classifies it as a zero-decimal currency
// (https://stripe.com/docs/currencies), but our code intentionally keeps a
// special-case branch in centsToAmount (divides by 100) for backward-compatibility:
// we have historically stored and sent UGX amounts multiplied by 100, so dividing
// here keeps display and payout math correct without a data migration.

export function centsToAmount(cents: number, currency: string): number {
  const upper = currency.toUpperCase();
  if (upper === "UGX") return cents / 100;
  return ZERO_DECIMAL_CURRENCIES.has(upper) ? cents : cents / 100;
}

export const STRIPE_MINIMUM_CENTS: Record<string, number> = {
  USD: 50, EUR: 50, GBP: 30, CAD: 50, AUD: 50,
  MXN: 1000, JPY: 50, KRW: 50, DOP: 50, COP: 50,
};

export function validateMinimumAmount(cents: number, currency: string): boolean {
  const min = STRIPE_MINIMUM_CENTS[currency.toUpperCase()] ?? 50;
  return cents >= min;
}

export const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "DOP", name: "Dominican Peso", symbol: "RD$" },
  { code: "COP", name: "Colombian Peso", symbol: "$" },
] as const;

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function formatCentsAsCurrency(cents: number, currency = "USD"): string {
  return formatCurrency(centsToAmount(cents, currency), currency);
}

export function formatCentsAsPrice(cents: number, currency = "USD"): string {
  const amount = centsToAmount(cents, currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export const DEFAULT_DISPLAY_TIMEZONE = "America/Guayaquil";

/**
 * Returns true if the given string is a valid IANA timezone identifier.
 * Uses Intl.DateTimeFormat to detect invalid values (avoids RangeError in formatters).
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the short IANA timezone abbreviation for a given timezone and date,
 * e.g. "ECT", "EST", "EDT", "PST", "CET", "GMT+1", "GMT-5".
 * Falls back to empty string on error.
 *
 * Hermes (React Native) on iOS has a known bug: formatToParts with timeZoneName: "short"
 * returns fragmented parts (e.g. "GMT" only, with offset in literals). When we get "GMT"
 * or empty for non-UTC zones, we fall back to formatting with "shortOffset" and
 * extracting the offset (e.g. "GMT+1", "GMT-5") from the full string.
 */
export function getTimezoneAbbr(timezone: string, dateString?: string): string {
  try {
    const date = dateString ? new Date(dateString) : new Date();
    if (isNaN(date.getTime())) return "";

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(date);
    const abbr = parts.find((p) => p.type === "timeZoneName")?.value ?? "";

    // Hermes/iOS bug: often returns just "GMT" or empty for non-UTC zones.
    // Fall back to shortOffset (GMT+1, GMT-5) extracted from formatted string.
    const isBrokenAbbr = !abbr || (abbr === "GMT" && !/^(UTC|Etc\/UTC|GMT)$/i.test(timezone));
    if (isBrokenAbbr) {
      const formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "shortOffset",
      }).format(date);
      const match = formatted.match(/GMT[+-]\d{1,2}(?::\d{2})?/);
      return match ? match[0] : abbr || "";
    }
    return abbr;
  } catch {
    return "";
  }
}

/**
 * Format a date string for event display (e.g., "Thursday, 06 Feb 2025")
 * Uses the event's IANA timezone when valid; otherwise omits `timeZone` so the
 * runtime uses the user's locale default (same as `buildTimeRange`).
 * @param timezone - Optional IANA id. Omitted → {@link DEFAULT_DISPLAY_TIMEZONE}. Passed but empty/invalid → locale-based date.
 */
export function formatEventDate(dateString: string, timezone?: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";

  const tzArgProvided = arguments.length >= 2;
  const trimmed = typeof timezone === "string" ? timezone.trim() : "";
  const timeZone =
    !tzArgProvided
      ? DEFAULT_DISPLAY_TIMEZONE
      : trimmed && isValidIanaTimezone(trimmed)
        ? trimmed
        : undefined;

  try {
    return date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return "";
  }
}

/**
 * Format a time string for event display (e.g., "14:30")
 * Uses the event's IANA timezone for correct local time display.
 * @param timezone - IANA timezone identifier (defaults to America/Guayaquil)
 */
export function formatEventTime(dateString: string, timezone = DEFAULT_DISPLAY_TIMEZONE): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  try {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    });
  } catch {
    return "";
  }
}

/**
 * Build a human-readable time range string in the Dice/Luma style.
 *
 * Uses 12-hour format in the event's local timezone. Appends the city as
 * geographic context instead of a timezone abbreviation (e.g. "GMT+1"),
 * matching the convention used by Dice ("9:00pm · London") and Luma.
 *
 * Examples:
 *   buildTimeRange("2026-03-20T14:30:00Z", "2026-03-20T16:30:00Z", "Europe/Madrid", "Madrid")
 *   → "2:30 PM - 4:30 PM · Madrid"
 *
 *   buildTimeRange("2026-03-20T14:30:00Z", null, "America/Guayaquil", "Quito")
 *   → "9:30 AM · Quito"
 *
 *   buildTimeRange("2026-03-20T14:30:00Z", null, "America/Guayaquil")
 *   → "9:30 AM"
 *
 *   buildTimeRange("2026-03-20T14:30:00Z", null)
 *   → uses DEFAULT_DISPLAY_TIMEZONE (same defaulting as formatEventDate when tz omitted)
 *
 *   buildTimeRange("2026-03-20T14:30:00Z", null, "")
 *   → blank/invalid IANA: locale-based time (no `timeZone` in Intl options)
 *
 * @param startsAt  - ISO date-time string for event start
 * @param endsAt    - ISO date-time string for event end (optional)
 * @param timezone  - IANA timezone; omitted arg uses DEFAULT_DISPLAY_TIMEZONE; blank/invalid uses locale
 * @param city      - City name to append as geographic context (optional)
 */
export function buildTimeRange(
  startsAt: string,
  endsAt: string | null | undefined,
  timezone?: string | null,
  city?: string | null,
): string {
  if (!startsAt) return "";
  const tzArgProvided = arguments.length >= 3;
  const validTz = !tzArgProvided
    ? DEFAULT_DISPLAY_TIMEZONE
    : typeof timezone === "string" &&
        timezone.trim() &&
        isValidIanaTimezone(timezone.trim())
      ? timezone.trim()
      : undefined;
  const startDate = new Date(startsAt);
  if (isNaN(startDate.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(validTz ? { timeZone: validTz } : {}),
  };
  try {
    const startTime = startDate.toLocaleTimeString("en-US", opts);
    let timeStr = startTime;
    if (endsAt) {
      const endDate = new Date(endsAt);
      if (!isNaN(endDate.getTime())) {
        timeStr = `${startTime} - ${endDate.toLocaleTimeString("en-US", opts)}`;
      }
    }
    return city?.trim() ? `${timeStr} · ${city.trim()}` : timeStr;
  } catch {
    return "";
  }
}

/**
 * Format a date string to a two-digit day (e.g., "06").
 * @param timezone - IANA timezone identifier (defaults to America/Guayaquil)
 */
export function formatDay(dateString: string, timezone = DEFAULT_DISPLAY_TIMEZONE): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  try {
    return date.toLocaleDateString("en-GB", { day: "2-digit", timeZone: timezone });
  } catch {
    return "";
  }
}

/**
 * Format a date string to a short month abbreviation (e.g., "Feb").
 * @param timezone - IANA timezone identifier (defaults to America/Guayaquil)
 */
export function formatMonth(dateString: string, timezone = DEFAULT_DISPLAY_TIMEZONE): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  try {
    return date.toLocaleDateString("en-GB", { month: "short", timeZone: timezone });
  } catch {
    return "";
  }
}
