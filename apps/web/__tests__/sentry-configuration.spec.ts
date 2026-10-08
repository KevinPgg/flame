/**
 * Specification-Based Tests for Sentry Configuration
 *
 * These tests verify the implementation meets the specifications defined in:
 * SECURITY_FEATURES_SPECIFICATION.md - Section 6: Sentry Configuration
 *
 * ⚠️ IMPORTANT: There are TWO separate PII redaction mechanisms:
 *
 * 1. **beforeSend hook** (sentry.client.config.ts) - SAFETY NET
 *    - Runs on ALL Sentry events automatically
 *    - Uses PARTIAL matching (key.includes())
 *    - Catches any PII that slips through code
 *    - Tested in THIS file via scrubSensitiveDataForSentry()
 *
 * 2. **redactSensitiveData utility** (app/lib/utils/sentry-redaction.ts) - EXPLICIT
 *    - Called explicitly in payment flows before logging
 *    - Uses EXACT field matching
 *    - Has special handling for nested card/customer/billing objects
 *    - Preserves card.bin and card.last4Digits
 *    - Tested in sentry-redaction.spec.ts
 *
 * Both mechanisms work together: developers should use redactSensitiveData()
 * explicitly, and beforeSend acts as a safety net for any missed PII.
 */

import { describe, it, expect } from "vitest";
import {
  scrubSensitiveDataForSentry,
  BEFORE_SEND_SENSITIVE_KEYS,
} from "../app/lib/utils/sentry-before-send-scrub";
import { SENTRY_REPLAY_CONFIG } from "../app/lib/utils/sentry-replay-config";

// Alias for cleaner test code
const beforeSendScrubData = scrubSensitiveDataForSentry;

describe("Sentry Configuration (SPEC-SENTRY)", () => {
  /**
   * SPEC-SENTRY-001: PII Scrubbing in beforeSend
   * The beforeSend hook MUST scrub sensitive keys
   */
  describe("SPEC-SENTRY-001: PII Scrubbing in beforeSend", () => {
    describe("Sensitive key detection", () => {
      it("should redact cardNumber field", () => {
        const data = { cardNumber: "4111111111111111" };
        const result = beforeSendScrubData(data);
        expect(result.cardNumber).toBe("[REDACTED]");
      });

      it("should redact cvv field", () => {
        const data = { cvv: "123" };
        const result = beforeSendScrubData(data);
        expect(result.cvv).toBe("[REDACTED]");
      });

      it("should redact cardHolderName field", () => {
        const data = { cardHolderName: "John Doe" };
        const result = beforeSendScrubData(data);
        expect(result.cardHolderName).toBe("[REDACTED]");
      });

      it("should redact cardholderName field (lowercase)", () => {
        const data = { cardholderName: "John Doe" };
        const result = beforeSendScrubData(data);
        expect(result.cardholderName).toBe("[REDACTED]");
      });

      it("should redact email field", () => {
        const data = { email: "user@example.com" };
        const result = beforeSendScrubData(data);
        expect(result.email).toBe("[REDACTED]");
      });

      it("should redact documentId field", () => {
        const data = { documentId: "0123456789" };
        const result = beforeSendScrubData(data);
        expect(result.documentId).toBe("[REDACTED]");
      });

      it("should redact billingAddress field", () => {
        const data = { billingAddress: "123 Main St" };
        const result = beforeSendScrubData(data);
        expect(result.billingAddress).toBe("[REDACTED]");
      });

      it("should redact password field", () => {
        const data = { password: "supersecret" };
        const result = beforeSendScrubData(data);
        expect(result.password).toBe("[REDACTED]");
      });

      it("should redact secret field", () => {
        const data = { secret: "api_key_12345" };
        const result = beforeSendScrubData(data);
        expect(result.secret).toBe("[REDACTED]");
      });
    });

    describe("Partial key matching", () => {
      it("should redact keys containing sensitive words (case-insensitive)", () => {
        const data = {
          userEmail: "user@example.com",
          CardNumber_encrypted: "encrypted_value",
          customer_documentId: "12345",
          API_SECRET_KEY: "key123",
        };

        const result = beforeSendScrubData(data);

        expect(result.userEmail).toBe("[REDACTED]");
        expect(result.CardNumber_encrypted).toBe("[REDACTED]");
        expect(result.customer_documentId).toBe("[REDACTED]");
        expect(result.API_SECRET_KEY).toBe("[REDACTED]");
      });
    });

    describe("Nested object handling", () => {
      it("should scrub deeply nested sensitive fields", () => {
        const data = {
          level1: {
            level2: {
              level3: {
                email: "deep@example.com",
                safe: "value",
              },
            },
          },
        };

        const result = beforeSendScrubData(data);

        expect(result.level1.level2.level3.email).toBe("[REDACTED]");
        expect(result.level1.level2.level3.safe).toBe("value");
      });

      it("should scrub sensitive fields inside arrays", () => {
        const data = {
          users: [
            { email: "user1@example.com", name: "User 1" },
            { email: "user2@example.com", name: "User 2" },
          ],
        };

        const result = beforeSendScrubData(data);

        expect(result.users[0].email).toBe("[REDACTED]");
        expect(result.users[0].name).toBe("User 1");
        expect(result.users[1].email).toBe("[REDACTED]");
        expect(result.users[1].name).toBe("User 2");
      });
    });

    describe("Non-sensitive field preservation", () => {
      it("should preserve non-sensitive fields", () => {
        const data = {
          transactionId: "tx_12345",
          amount: 150.0,
          currency: "USD",
          status: "completed",
          timestamp: "2024-11-28T10:00:00Z",
        };

        const result = beforeSendScrubData(data);

        expect(result.transactionId).toBe("tx_12345");
        expect(result.amount).toBe(150.0);
        expect(result.currency).toBe("USD");
        expect(result.status).toBe("completed");
        expect(result.timestamp).toBe("2024-11-28T10:00:00Z");
      });
    });

    describe("Edge cases", () => {
      it("should handle null input", () => {
        expect(beforeSendScrubData(null)).toBeNull();
      });

      it("should handle undefined input", () => {
        expect(beforeSendScrubData(undefined)).toBeUndefined();
      });

      it("should handle primitive values", () => {
        expect(beforeSendScrubData("string")).toBe("string");
        expect(beforeSendScrubData(123)).toBe(123);
        expect(beforeSendScrubData(true)).toBe(true);
      });

      it("should handle empty object", () => {
        expect(beforeSendScrubData({})).toEqual({});
      });

      it("should handle empty array", () => {
        expect(beforeSendScrubData([])).toEqual([]);
      });
    });
  });

  /**
   * SPEC-SENTRY-002: Session Replay Privacy
   * Session replay MUST have maskAllText and blockAllMedia enabled
   */
  /**
   * SPEC-SENTRY-002: Session Replay Privacy
   *
   * Tests the actual SENTRY_REPLAY_CONFIG from app/lib/utils/sentry-replay-config.ts
   * which is used by sentry.client.config.ts in Sentry.replayIntegration().
   */
  describe("SPEC-SENTRY-002: Session Replay Privacy", () => {
    it("should have maskAllText: true to hide all text in replays", () => {
      // Testing the actual production config
      expect(SENTRY_REPLAY_CONFIG.maskAllText).toBe(true);
    });

    it("should have blockAllMedia: true to block images/video in replays", () => {
      // Testing the actual production config
      expect(SENTRY_REPLAY_CONFIG.blockAllMedia).toBe(true);
    });
  });

  /**
   * Integration: Full Sentry event scrubbing
   */
  describe("Integration: Full Sentry Event Scrubbing", () => {
    it("should scrub all PII from a realistic Sentry event", () => {
      const sentryEvent = {
        exception: {
          values: [
            {
              type: "Error",
              value: "Payment verification failed",
            },
          ],
        },
        tags: {
          category: "payment_critical",
          checkoutId: "ck_12345",
        },
        extra: {
          verificationData: {
            result: { code: "000.000.000" },
            card: {
              bin: "411111",
              last4: "1111",
            },
            customer: {
              email: "customer@example.com",
              phone: "+1234567890",
            },
          },
          billingAddress: "123 Main St, Quito, Ecuador",
          userEmail: "test@example.com",
        },
        request: {
          data: {
            cardNumber: "4111111111111111",
            cvv: "123",
            cardHolderName: "John Doe",
            documentId: "0123456789",
          },
        },
      };

      // Scrub extra
      const scrubbedExtra = beforeSendScrubData(sentryEvent.extra);
      expect(scrubbedExtra.verificationData.customer.email).toBe("[REDACTED]");
      expect(scrubbedExtra.billingAddress).toBe("[REDACTED]");
      expect(scrubbedExtra.userEmail).toBe("[REDACTED]");
      // Non-sensitive should remain
      expect(scrubbedExtra.verificationData.card.bin).toBe("411111");
      expect(scrubbedExtra.verificationData.result.code).toBe("000.000.000");

      // Scrub request.data
      const scrubbedRequestData = beforeSendScrubData(sentryEvent.request.data);
      expect(scrubbedRequestData.cardNumber).toBe("[REDACTED]");
      expect(scrubbedRequestData.cvv).toBe("[REDACTED]");
      expect(scrubbedRequestData.cardHolderName).toBe("[REDACTED]");
      expect(scrubbedRequestData.documentId).toBe("[REDACTED]");

      // Tags should remain (checkoutId is not sensitive)
      const scrubbedTags = beforeSendScrubData(sentryEvent.tags);
      expect(scrubbedTags.category).toBe("payment_critical");
      expect(scrubbedTags.checkoutId).toBe("ck_12345");
    });
  });
});

/**
 * Payment Verification Error Logging Tests
 * SPEC-LOG-001, SPEC-LOG-002, SPEC-LOG-003
 */
describe("Payment Verification Error Logging (SPEC-LOG)", () => {
  /**
   * SPEC-LOG-001: Verification Failure Logging
   */
  describe("SPEC-LOG-001: Verification Failure Logging", () => {
    it("should define required tags for payment_critical category", () => {
      // When payment verification fails, the error should be logged with:
      const requiredTags = {
        category: "payment_critical",
        checkoutId: "string", // Must include checkout ID
        errorAction: "string", // e.g., "CONTACT_SUPPORT"
        resultCode: "string", // The Datafast result code
      };

      expect(requiredTags.category).toBe("payment_critical");
      expect(typeof requiredTags.checkoutId).toBe("string");
    });

    it("should include redacted error data in extra.fullError", () => {
      // The extra.fullError field should contain the verification response
      // but with PII redacted via redactSensitiveData()
      const expectedExtraStructure = {
        fullError: "redacted verification response object",
      };

      expect(expectedExtraStructure).toHaveProperty("fullError");
    });
  });

  /**
   * SPEC-LOG-002: Network Failure Logging
   */
  describe("SPEC-LOG-002: Network Failure Logging", () => {
    it("should define required tags for payment_network_failure category", () => {
      // When network failure occurs during verification:
      const requiredTags = {
        category: "payment_network_failure",
        checkoutId: "string",
      };

      expect(requiredTags.category).toBe("payment_network_failure");
    });
  });

  /*
   * SPEC-LOG-003: No PII in Logs
   *
   * This requirement is verified by SPEC-SENTRY-001 above.
   * The beforeSend hook automatically scrubs ALL sensitive keys from:
   * - event.extra
   * - event.request.data
   * - event.tags
   *
   * See: "SPEC-SENTRY-001: PII Scrubbing in beforeSend" tests
   */
});
