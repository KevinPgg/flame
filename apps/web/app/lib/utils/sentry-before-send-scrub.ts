/**
 * Sentry beforeSend Scrubbing Utility
 *
 * This is the PII scrubbing function used in beforeSend as a SAFETY NET.
 * It uses PARTIAL matching to catch any PII that wasn't explicitly redacted.
 *
 * ⚠️ This is SEPARATE from redactSensitiveData() in sentry-redaction.ts:
 * - This: PARTIAL matching ("userEmail" matches "email"), safety net
 * - That: EXACT matching, explicit call, preserves card.bin/last4Digits
 *
 * Both mechanisms work together for defense in depth.
 */

/**
 * Sensitive keys to scrub from Sentry events (beforeSend safety net)
 * Uses PARTIAL matching - e.g., "userEmail" will match "email"
 */
export const BEFORE_SEND_SENSITIVE_KEYS = [
  "cardNumber",
  "cvv",
  "cardHolderName",
  "cardholderName",
  "email",
  "documentId",
  "billingAddress",
  "password",
  "secret",
];

/**
 * Scrubs sensitive data from objects before sending to Sentry.
 * Used as a safety net in beforeSend to catch any PII that wasn't
 * explicitly redacted via redactSensitiveData().
 *
 * @param data - Any object/array to scrub
 * @param sensitiveKeys - Keys to check for (uses partial matching)
 * @returns Scrubbed copy of data
 */
export function scrubSensitiveDataForSentry(
  data: any,
  sensitiveKeys: string[] = BEFORE_SEND_SENSITIVE_KEYS
): any {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(item => scrubSensitiveDataForSentry(item, sensitiveKeys));
  }

  const scrubbed: any = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(k =>
        lowerKey.includes(k.toLowerCase())
      );

      if (isSensitive) {
        scrubbed[key] = "[REDACTED]";
      } else {
        scrubbed[key] = scrubSensitiveDataForSentry(data[key], sensitiveKeys);
      }
    }
  }
  return scrubbed;
}

