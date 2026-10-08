/**
 * Validates the minMinutes parameter for pending checkout recovery
 * 
 * SPEC-PENDING-002: minMinutes parameter MUST be a positive integer between 1 and 1440
 * 
 * @param value - The raw string value from query parameter (or null/undefined for default)
 * @returns Object with `valid` boolean, `parsed` number if valid, or `error` string if invalid
 */
export function validateMinMinutes(
  value: string | null | undefined
): {
  valid: boolean;
  parsed?: number;
  error?: string;
} {
  // Default to 15 if not provided
  if (value === null || value === undefined) {
    return { valid: true, parsed: 15 };
  }

  const parsed = parseInt(value, 10);

  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 1440
  ) {
    return {
      valid: false,
      error: `minMinutes must be a positive integer between 1 and 1440 (inclusive), got: ${value}`,
    };
  }

  return { valid: true, parsed };
}

