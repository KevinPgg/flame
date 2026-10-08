/**
 * Masks an email address for privacy-compliant logging and user-facing messages.
 * Keeps only the first character of the local part and the full domain, but only masks
 * if there are additional characters in the local part.
 *
 * @param email - The email address to mask
 * @returns Masked email in format: "j***@example.com" or "a@example.com" if single char
 *
 * @example
 * maskEmail("john.doe@gmail.com") // Returns: "j***@gmail.com"
 * maskEmail("admin@company.org") // Returns: "a***@company.org"
 * maskEmail("a@example.com") // Returns: "a@example.com" (not masked)
 * maskEmail("invalid") // Returns: "***"
 */
export function maskEmail(email: string): string {
  // Handle edge cases
  if (!email || !email.includes("@")) {
    return "***";
  }
  return email.replace(/^(.)(.*)(@.+)$/, (_match, firstChar, rest, domain) =>
    rest ? firstChar + "***" + domain : firstChar + domain
  );
}
