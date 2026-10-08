/**
 * Specification-Based Tests for Sensitive Data Redaction
 *
 * These tests verify the implementation meets the specifications defined in:
 * SECURITY_FEATURES_SPECIFICATION.md - Section 1: Sensitive Data Redaction
 *
 * The specifications define WHAT the function must do, independent of implementation.
 */

import { describe, it, expect } from "vitest";
import { redactSensitiveData } from "../app/lib/utils/sentry-redaction";

describe("Sensitive Data Redaction (SPEC-REDACT)", () => {
  /**
   * SPEC-REDACT-001: Sensitive Field Replacement
   * The following field names MUST be replaced with "[REDACTED]" when present
   */
  describe("SPEC-REDACT-001: Sensitive Field Replacement", () => {
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

    sensitiveFields.forEach(field => {
      it(`should redact "${field}" field`, () => {
        const input = { [field]: "sensitive_value_12345" };
        const result = redactSensitiveData(input);
        expect(result[field]).toBe("[REDACTED]");
      });
    });

    it("should redact multiple sensitive fields in a single object", () => {
      const input = {
        email: "customer@example.com",
        phone: "+593999123456",
        card_number: "4111111111111111",
        transaction_id: "tx_abc123", // non-sensitive, should remain
      };

      const result = redactSensitiveData(input);

      expect(result.email).toBe("[REDACTED]");
      expect(result.phone).toBe("[REDACTED]");
      expect(result.card_number).toBe("[REDACTED]");
      expect(result.transaction_id).toBe("tx_abc123");
    });
  });

  /**
   * SPEC-REDACT-002: Nested Object Handling (card object)
   * When `card` object is present, only `bin` and `last4Digits` should be preserved
   * When `card.holder` is present, it MUST be replaced with "[REDACTED]"
   */
  describe("SPEC-REDACT-002: Nested Object Handling (card)", () => {
    it("should preserve card.bin and card.last4Digits", () => {
      const input = {
        card: {
          bin: "411111",
          last4Digits: "1111",
          holder: "JOHN DOE",
          expiryMonth: "12",
          expiryYear: "2025",
        },
      };

      const result = redactSensitiveData(input);

      expect(result.card.bin).toBe("411111");
      expect(result.card.last4Digits).toBe("1111");
    });

    it("should redact card.holder", () => {
      const input = {
        card: {
          bin: "411111",
          last4Digits: "1111",
          holder: "JOHN DOE",
        },
      };

      const result = redactSensitiveData(input);

      expect(result.card.holder).toBe("[REDACTED]");
    });

    it("should redact payment_method.details", () => {
      const input = {
        payment_method: {
          type: "card",
          details: { number: "4111111111111111", cvv: "123" },
        },
      };

      const result = redactSensitiveData(input);

      expect(result.payment_method.details).toBe("[REDACTED]");
      expect(result.payment_method.type).toBe("card");
    });
  });

  /**
   * SPEC-REDACT-003: Customer Object Handling
   */
  describe("SPEC-REDACT-003: Customer Object Handling", () => {
    it("should redact customer.email, customer.phone, and customer.name", () => {
      const input = {
        customer: {
          id: "cust_123", // non-sensitive
          email: "customer@example.com",
          phone: "+1234567890",
          name: "John Doe",
        },
      };

      const result = redactSensitiveData(input);

      expect(result.customer.id).toBe("cust_123");
      expect(result.customer.email).toBe("[REDACTED]");
      expect(result.customer.phone).toBe("[REDACTED]");
      expect(result.customer.name).toBe("[REDACTED]");
    });
  });

  /**
   * SPEC-REDACT-004: Billing Object Handling
   */
  describe("SPEC-REDACT-004: Billing Object Handling", () => {
    it("should redact billing.email, billing.phone, and billing.address", () => {
      const input = {
        billing: {
          country: "EC", // non-sensitive
          email: "billing@example.com",
          phone: "+593999999999",
          address: "123 Main St, Quito, Ecuador",
        },
      };

      const result = redactSensitiveData(input);

      expect(result.billing.country).toBe("EC");
      expect(result.billing.email).toBe("[REDACTED]");
      expect(result.billing.phone).toBe("[REDACTED]");
      expect(result.billing.address).toBe("[REDACTED]");
    });
  });

  /**
   * SPEC-REDACT-005: Non-Destructive Operation
   * The original input object MUST NOT be mutated
   */
  describe("SPEC-REDACT-005: Non-Destructive Operation", () => {
    it("should not mutate the original object", () => {
      const original = {
        email: "test@example.com",
        nested: {
          phone: "+1234567890",
        },
      };

      // Create a deep copy of original for comparison
      const originalCopy = JSON.parse(JSON.stringify(original));

      redactSensitiveData(original);

      // Original should be unchanged
      expect(original).toEqual(originalCopy);
      expect(original.email).toBe("test@example.com");
      expect(original.nested.phone).toBe("+1234567890");
    });

    it("should return a new object (not the same reference)", () => {
      const input = { email: "test@example.com" };
      const result = redactSensitiveData(input);

      expect(result).not.toBe(input);
    });
  });

  /**
   * SPEC-REDACT-006: Null/Undefined Handling
   */
  describe("SPEC-REDACT-006: Null/Undefined Handling", () => {
    it("should return null when input is null", () => {
      expect(redactSensitiveData(null)).toBeNull();
    });

    it("should return undefined when input is undefined", () => {
      expect(redactSensitiveData(undefined)).toBeUndefined();
    });

    it("should handle empty object", () => {
      expect(redactSensitiveData({})).toEqual({});
    });
  });

  /**
   * Edge cases and integration scenarios
   */
  describe("Integration: Real-world payment response redaction", () => {
    it("should properly redact a typical Datafast verification response", () => {
      // This represents a real-world Datafast payment response structure
      const datafastResponse = {
        id: "8ac7a4a292e09e0d0192e5bd26a8790e",
        result: {
          code: "000.000.000",
          description: "Transaction succeeded",
        },
        buildNumber: "1.0.0",
        timestamp: "2024-01-15T10:30:00.000Z",
        ndc: "8a829418533cf31d01533d058f2b06b3_66bc5b9ee4b03c6e2c30dd9a",
        card: {
          bin: "411111",
          last4Digits: "1111",
          holder: "JOHN SMITH",
          expiryMonth: "12",
          expiryYear: "2025",
        },
        customer: {
          email: "john.smith@example.com",
          phone: "+593991234567",
        },
        billing: {
          street1: "123 Main Street",
          city: "Quito",
          country: "EC",
          email: "billing@example.com",
        },
        merchantTransactionId: "flame_tx_12345",
        cart: {
          items: [
            { name: "VIP Ticket", quantity: 2, price: 50.0 },
          ],
        },
      };

      const result = redactSensitiveData(datafastResponse);

      // Non-sensitive fields should be preserved
      expect(result.id).toBe("8ac7a4a292e09e0d0192e5bd26a8790e");
      expect(result.result.code).toBe("000.000.000");
      expect(result.merchantTransactionId).toBe("flame_tx_12345");
      expect(result.cart.items[0].name).toBe("VIP Ticket");

      // Card partial info preserved
      expect(result.card.bin).toBe("411111");
      expect(result.card.last4Digits).toBe("1111");

      // Sensitive fields redacted
      expect(result.card.holder).toBe("[REDACTED]");
      expect(result.customer.email).toBe("[REDACTED]");
      expect(result.customer.phone).toBe("[REDACTED]");
      expect(result.billing.email).toBe("[REDACTED]");
    });
  });
});

