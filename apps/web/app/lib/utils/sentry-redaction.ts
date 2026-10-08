/**
 * Sentry Data Redaction Utility
 * 
 * Removes sensitive PII before sending data to Sentry.
 * Used across payment flows to ensure no customer data is leaked.
 */

/**
 * Redacts sensitive fields from any object before sending to Sentry
 * @param data - Any object that might contain sensitive data
 * @returns A deep copy with sensitive fields replaced with "[REDACTED]"
 */
export function redactSensitiveData(data: any): any {
  if (!data) return data;

  const sensitiveFields = [
    "card_number",
    "pan",
    "cvv",
    "card_cvv",
    "card_expiry",
    "expiry",
    "cardholder_name",
    "email",
    "phone",
    "mobile",
    "customer_email",
    "billing_email",
    "documentId",
    "document_id",
    "billingAddress",
    "billing_address",
  ];

  // Deep clone to avoid mutating original
  const redacted = JSON.parse(JSON.stringify(data));

  // Redact top-level fields
  for (const field of sensitiveFields) {
    if (redacted[field]) redacted[field] = "[REDACTED]";
  }

  // Redact nested card/payment objects
  if (redacted.card) {
    redacted.card = {
      bin: redacted.card.bin,
      last4Digits: redacted.card.last4Digits,
      // Redact holder name and other sensitive fields
      ...(redacted.card.holder && { holder: "[REDACTED]" }),
    };
  }

  if (redacted.payment_method?.details) {
    redacted.payment_method.details = "[REDACTED]";
  }

  if (redacted.customer) {
    if (redacted.customer.email) redacted.customer.email = "[REDACTED]";
    if (redacted.customer.phone) redacted.customer.phone = "[REDACTED]";
    if (redacted.customer.name) redacted.customer.name = "[REDACTED]";
  }

  // Redact nested billing information
  if (redacted.billing) {
    if (redacted.billing.email) redacted.billing.email = "[REDACTED]";
    if (redacted.billing.phone) redacted.billing.phone = "[REDACTED]";
    if (redacted.billing.address) redacted.billing.address = "[REDACTED]";
  }

  return redacted;
}

