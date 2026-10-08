/**
 * Validates and normalizes a promoter code
 * @param promoter_code - The promoter code to validate (can be any type)
 * @returns Validation result with normalized code or error message
 */
export function validateAndNormalizePromoterCode(
  promoter_code: unknown
):
  | { valid: false; error: string }
  | { valid: true; code: string | null } {
  // If undefined or null, treat as optional (no code provided)
  if (promoter_code === undefined || promoter_code === null) {
    return { valid: true, code: null };
  }

  // Convert to string and trim
  const trimmedCode = String(promoter_code).trim();

  // If empty after trimming, treat as no code provided
  if (!trimmedCode) {
    return { valid: true, code: null };
  }

  // Normalize to uppercase
  const upperCode = trimmedCode.toUpperCase();

  // Validate format: alphanumeric uppercase, 3-50 characters
  if (!/^[A-Z0-9]{3,50}$/.test(upperCode)) {
    return {
      valid: false,
      error: "Promoter code must be alphanumeric and between 3-50 characters",
    };
  }

  return { valid: true, code: upperCode };
}

