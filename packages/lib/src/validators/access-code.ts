/**
 * Access code validation for QR scanner.
 *
 * Rules: 4-8 uppercase alphanumeric characters (A-Z, 0-9).
 * Web source: apps/web/app/api/qr-scanner/validate-code/route.ts,
 * apps/web/app/components/modals/QRScannerModal.tsx
 */

const ACCESS_CODE_REGEX = /^[A-Z0-9]{4,8}$/;
const MIN_LENGTH = 4;
const MAX_LENGTH = 8;

export interface AccessCodeValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Sanitizes access code input: uppercase, alphanumeric only, max 8 chars.
 * Use for TextInput onChangeText to normalize as user types.
 */
export function sanitizeAccessCodeInput(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, MAX_LENGTH);
}

/**
 * Validates an access code for the QR scanner.
 * Empty string is valid (clears the code); non-empty must match 4-8 A-Z0-9.
 */
export function validateAccessCode(code: string): AccessCodeValidationResult {
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    return { valid: true };
  }
  const normalized = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < MIN_LENGTH) {
    return {
      valid: false,
      error: "Code must be at least 4 characters",
    };
  }
  if (!ACCESS_CODE_REGEX.test(normalized)) {
    return {
      valid: false,
      error: "Code must be 4-8 uppercase letters/numbers",
    };
  }
  return { valid: true };
}
