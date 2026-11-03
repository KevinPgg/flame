/**
 * Timezone Utilities for Ecuador (ECT - UTC-5, no DST)
 *
 * All dates in the database are stored in UTC.
 * All dates displayed to users should be in Ecuador time.
 * All dates entered by users are assumed to be in Ecuador time.
 */

// Ecuador timezone offset in minutes (UTC-5 = -300 minutes)
const ECUADOR_OFFSET_MINUTES = -300;

/**
 * Convert a UTC date string from database to Ecuador local time string for datetime-local input
 * @param utcDateString - ISO string from database (e.g., "2025-11-01T10:00:00Z")
 * @returns Local time string for datetime-local input (e.g., "2025-11-01T05:00"), or empty string if invalid
 */
export function utcToEcuadorLocal(utcDateString: string): string {
  if (!utcDateString) return "";

  const utcDate = new Date(utcDateString);

  // Guard against invalid dates
  if (isNaN(utcDate.getTime())) {
    return "";
  }

  // Get UTC timestamp and add Ecuador offset
  const ecuadorTime = new Date(
    utcDate.getTime() + ECUADOR_OFFSET_MINUTES * 60 * 1000
  );

  // Format as YYYY-MM-DDTHH:MM for datetime-local input
  const year = ecuadorTime.getUTCFullYear();
  const month = String(ecuadorTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ecuadorTime.getUTCDate()).padStart(2, "0");
  const hours = String(ecuadorTime.getUTCHours()).padStart(2, "0");
  const minutes = String(ecuadorTime.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Convert Ecuador local time string from datetime-local input to UTC for database storage
 * @param localDateTimeString - String from datetime-local input (e.g., "2025-11-01T05:00")
 * @returns ISO string in UTC for database (e.g., "2025-11-01T10:00:00.000Z"), or empty string if invalid
 */
export function ecuadorLocalToUtc(localDateTimeString: string): string {
  if (!localDateTimeString) return "";

  // Add seconds if not present
  const dateTimeWithSeconds = localDateTimeString.includes(":")
    ? localDateTimeString.split(":").length === 2
      ? localDateTimeString + ":00"
      : localDateTimeString
    : localDateTimeString;

  // Create a date object treating the input as UTC
  const localAsUtc = new Date(dateTimeWithSeconds + "Z");

  // Guard against invalid dates
  if (isNaN(localAsUtc.getTime())) {
    return "";
  }

  // Subtract the Ecuador offset to get actual UTC time
  const utcDate = new Date(
    localAsUtc.getTime() - ECUADOR_OFFSET_MINUTES * 60 * 1000
  );

  if (isNaN(utcDate.getTime())) {
    return "";
  }

  return utcDate.toISOString();
}

/**
 * Get current Ecuador time formatted for datetime-local input
 * @param hoursAhead - Optional hours to add (for minimum date validation)
 * @returns Local time string for datetime-local input
 */
export function getEcuadorNow(hoursAhead: number = 0): string {
  const now = new Date();
  const ecuadorNow = new Date(
    now.getTime() + ECUADOR_OFFSET_MINUTES * 60 * 1000
  );

  if (hoursAhead > 0) {
    ecuadorNow.setUTCHours(ecuadorNow.getUTCHours() + hoursAhead);
  }

  const year = ecuadorNow.getUTCFullYear();
  const month = String(ecuadorNow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ecuadorNow.getUTCDate()).padStart(2, "0");
  const hours = String(ecuadorNow.getUTCHours()).padStart(2, "0");
  const minutes = String(ecuadorNow.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format a UTC date string for display to users in Ecuador time
 * @param utcDateString - ISO string from database
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string in Ecuador time, or empty string if invalid
 */
export function formatEcuadorDate(
  utcDateString: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!utcDateString) return "";

  const date = new Date(utcDateString);

  // Guard against invalid dates
  if (isNaN(date.getTime())) {
    return "";
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Guayaquil",
    ...options,
  };

  return new Intl.DateTimeFormat("en-US", defaultOptions).format(date);
}

/**
 * Convert a local datetime string (YYYY-MM-DDTHH:MM format) in the given timezone to UTC ISO string.
 * Uses Intl to compute the offset for the target timezone at the given date.
 * @param localDateTimeString - String from datetime-local input
 * @param timezone - IANA timezone (e.g., "America/Guayaquil")
 * @returns ISO string in UTC for database storage
 */
export function localToUtc(localDateTimeString: string, timezone: string): string {
  if (!localDateTimeString || !timezone) return "";
  const withSeconds =
    localDateTimeString.includes(":") && localDateTimeString.split(":").length === 2
      ? localDateTimeString + ":00"
      : localDateTimeString;
  const localAsUtc = new Date(withSeconds + "Z");
  if (isNaN(localAsUtc.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const currentDisplay = formatter.format(localAsUtc);
  const [datePart, timePart] = currentDisplay.split(", ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min, sec] = timePart.split(":").map(Number);
  const currentDisplayParsed = new Date(Date.UTC(y, m - 1, d, h, min, sec || 0, 0));
  const adjustment = localAsUtc.getTime() - currentDisplayParsed.getTime();
  const realUtc = new Date(localAsUtc.getTime() + adjustment);
  return realUtc.toISOString();
}

/**
 * Convert UTC date string to local time string for datetime-local input in the given timezone.
 * @param utcDateString - ISO string from database
 * @param timezone - IANA timezone
 * @returns Local time string for datetime-local input
 */
export function utcToLocal(utcDateString: string, timezone: string): string {
  if (!utcDateString || !timezone) return "";
  const utcDate = new Date(utcDateString);
  if (isNaN(utcDate.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Get current time in the given timezone formatted for datetime-local input.
 * @param timezone - IANA timezone
 * @param hoursAhead - Optional hours to add (for minimum date validation)
 */
export function getNowInTimezone(timezone: string, hoursAhead: number = 0): string {
  const now = new Date();
  if (hoursAhead > 0) {
    now.setUTCHours(now.getUTCHours() + hoursAhead);
  }
  return utcToLocal(now.toISOString(), timezone);
}

export const SUPPORTED_TIMEZONES = [
  { value: "America/Guayaquil", label: "Ecuador (ECT, UTC-5)" },
  { value: "America/New_York", label: "Eastern US (ET)" },
  { value: "America/Chicago", label: "Central US (CT)" },
  { value: "America/Denver", label: "Mountain US (MT)" },
  { value: "America/Los_Angeles", label: "Pacific US (PT)" },
  { value: "America/Bogota", label: "Colombia (COT, UTC-5)" },
  { value: "America/Lima", label: "Peru (PET, UTC-5)" },
  { value: "America/Mexico_City", label: "Mexico City (CST)" },
  { value: "America/Merida", label: "Mérida, Mexico (CST)" },
  { value: "America/Cancun", label: "Cancún, Mexico (EST, UTC-5)" },
  { value: "America/Panama", label: "Panama (EST, UTC-5)" },
  { value: "America/Santo_Domingo", label: "Dominican Republic (AST, UTC-4)" },
  { value: "America/Sao_Paulo", label: "Brazil (BRT, UTC-3)" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (ART, UTC-3)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Madrid", label: "Madrid (CET/CEST)" },
  { value: "Europe/Lisbon", label: "Lisbon (WET/WEST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST, UTC+9)" },
] as const;
