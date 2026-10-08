/**
 * Shared date/time formatters for web event display.
 * Used by EventsCatalog, HomeContent, and other components.
 * Pass `timezone` (IANA string, e.g. "America/Guayaquil") to render in the
 * event's local timezone rather than the browser's timezone.
 *
 * Each formatter validates the optional timezone with Intl.DateTimeFormat,
 * guards against Invalid Date inputs with isNaN, and wraps the locale call in
 * try/catch so an invalid IANA string never throws a RangeError — returning
 * an empty string instead.
 */

function safeTimeZoneOptions(timezone?: string | null): { timeZone: string } | Record<string, never> {
  if (!timezone) return {};
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return { timeZone: timezone };
  } catch {
    return {};
  }
}

export function formatDate(dateStr: string, timezone?: string | null): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...safeTimeZoneOptions(timezone),
    });
  } catch {
    return "";
  }
}

export function formatTime(dateStr: string, timezone?: string | null): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...safeTimeZoneOptions(timezone),
    });
  } catch {
    return "";
  }
}

export function formatDay(dateStr: string, timezone?: string | null): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      day: "numeric",
      ...safeTimeZoneOptions(timezone),
    });
  } catch {
    return "";
  }
}

export function formatMonth(dateStr: string, timezone?: string | null): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d
      .toLocaleDateString("en-US", {
        month: "short",
        ...safeTimeZoneOptions(timezone),
      })
      .toUpperCase();
  } catch {
    return "";
  }
}
