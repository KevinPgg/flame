/**
 * Ecuadorian Cédula Validator
 *
 * @legacy — Cédula validation was required by the old Datafast payment processor
 * (Ecuador-specific). Since migrating to Stripe (Jan 2026), cédula is no longer
 * collected or validated for new purchases. This module is kept for backwards
 * compatibility with existing user profiles that have a stored document_id.
 * Do NOT use in new features.
 *
 * Validates Ecuadorian ID numbers (cédulas) according to official rules:
 * - Must be exactly 10 digits
 * - First 2 digits represent province (01-24)
 * - Third digit must be 0-5 for natural persons
 * - Last digit is a check digit calculated using modulo 10 algorithm
 *
 * This validator is shared between client and server to ensure
 * data integrity and prevent invalid IDs from being stored.
 */

export interface CedulaValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates an Ecuadorian cédula/ID number
 *
 * @param value - The cedula string to validate (can include non-digits)
 * @returns Object with isValid boolean and optional error message
 */
export function validateCedula(value: string): CedulaValidationResult {
  // Remove any non-digit characters
  const cleanValue = value.replace(/\D/g, "");

  // Must be exactly 10 digits
  if (cleanValue.length !== 10) {
    return {
      isValid: false,
      error: "ID number must be exactly 10 digits",
    };
  }

  // First two digits represent province (01-24)
  const province = parseInt(cleanValue.substring(0, 2));
  if (province < 1 || province > 24) {
    return {
      isValid: false,
      error: "Invalid province code (first 2 digits must be 01-24)",
    };
  }

  // Third digit must be less than 6 for natural persons
  const thirdDigit = parseInt(cleanValue.charAt(2));
  if (thirdDigit > 5) {
    return {
      isValid: false,
      error: "Invalid ID type (third digit must be 0-5 for natural persons)",
    };
  }

  // Validate check digit using Ecuadorian algorithm
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    let digitValue = parseInt(cleanValue.charAt(i)) * coefficients[i];
    // If product is greater than 9, subtract 9
    if (digitValue > 9) {
      digitValue -= 9;
    }
    sum += digitValue;
  }

  const checkDigit = parseInt(cleanValue.charAt(9));
  const calculatedCheck = (10 - (sum % 10)) % 10;

  if (checkDigit !== calculatedCheck) {
    return {
      isValid: false,
      error: "Invalid check digit (ID number verification failed)",
    };
  }

  // All validations passed
  return {
    isValid: true,
  };
}

/**
 * Formats a cedula for display (XXX-XXXX-XXX)
 *
 * @param cedula - The cedula string (must be 10 digits)
 * @returns Formatted string or original if invalid length
 */
export function formatCedula(cedula: string | null): string | null {
  if (!cedula) return null;

  const clean = cedula.replace(/\D/g, "");
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
  }

  return cedula;
}

/**
 * Cleans a cedula string (removes all non-digits)
 *
 * @param cedula - The cedula string to clean
 * @returns String with only digits
 */
export function cleanCedula(cedula: string): string {
  return cedula.replace(/\D/g, "");
}
