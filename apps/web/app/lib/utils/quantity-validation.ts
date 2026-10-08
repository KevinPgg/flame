/**
 * Validates and parses a quantity value according to SPEC-RECOVER-003
 * 
 * SPEC-RECOVER-003: Quantity MUST be a positive integer
 * - Rejects non-integer numbers (e.g., 2.5)
 * - Rejects strings containing decimal points (e.g., "2.5")
 * - Rejects 0 and negative values
 * 
 * @param quantity - The quantity value to validate (number, string, or other)
 * @returns Object with `valid` boolean and `parsed` number if valid, or `error` string if invalid
 */
export function validateAndParseQuantity(quantity: any): {
  valid: boolean;
  parsed?: number;
  error?: string;
} {
  // Check if quantity exists (null/undefined not allowed)
  if (quantity === null || quantity === undefined) {
    return {
      valid: false,
      error: `Quantity not available in cart data: ${JSON.stringify(quantity)}`,
    };
  }

  // Reject non-integer numbers BEFORE parsing to prevent silent truncation
  // e.g., 2.5 should fail, not silently become 2
  if (typeof quantity === "number") {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return {
        valid: false,
        error: `Invalid quantity value: ${quantity}. Must be a positive integer.`,
      };
    }
    return { valid: true, parsed: quantity };
  }

  // String input - reject if it contains a decimal point
  const strQuantity = String(quantity);
  if (strQuantity.includes(".")) {
    return {
      valid: false,
      error: `Invalid quantity value: ${quantity}. Must be a positive integer (decimals not allowed).`,
    };
  }

  // Ensure the string contains only digits (reject malformed strings)
  // This prevents parseInt from silently accepting partial strings like "123abc" → 123
  if (!/^\d+$/.test(strQuantity)) {
    return {
      valid: false,
      error: `Invalid quantity value: ${quantity}. Must be a positive integer (no whitespace or non-numeric characters).`,
    };
  }

  const parsedQuantity = parseInt(strQuantity, 10);
  if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
    return {
      valid: false,
      error: `Invalid quantity value: ${quantity}. Must be a positive integer.`,
    };
  }

  return { valid: true, parsed: parsedQuantity };
}

