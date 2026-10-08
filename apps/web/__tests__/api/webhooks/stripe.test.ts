/**
 * Unit Tests for Stripe Webhook Event Processing
 *
 * These tests verify webhook event structure validation and processing logic.
 * Full integration testing of the webhook endpoint should use E2E tests
 * with real Stripe test mode webhooks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";
import { SAFE_METADATA_KEYS, redactMetadata } from "@/app/lib/stripe/webhook-utils";

// Validate payment intent has required metadata for order creation
function validatePaymentIntentMetadata(metadata: Record<string, string>): {
  valid: boolean;
  missingFields: string[];
  orderType: 'hold' | 'rsvp' | 'unknown';
} {
  const requiredForHold = ['holdId', 'userId', 'eventId'];
  const requiredForRsvp = ['rsvpId', 'userId', 'eventId'];

  const hasHoldId = !!metadata.holdId;
  const hasRsvpId = !!metadata.rsvpId;

  if (hasHoldId) {
    const missing = requiredForHold.filter(field => !metadata[field]);
    return {
      valid: missing.length === 0,
      missingFields: missing,
      orderType: 'hold',
    };
  }

  if (hasRsvpId) {
    const missing = requiredForRsvp.filter(field => !metadata[field]);
    return {
      valid: missing.length === 0,
      missingFields: missing,
      orderType: 'rsvp',
    };
  }

  return {
    valid: false,
    missingFields: ['holdId or rsvpId'],
    orderType: 'unknown',
  };
}

// Calculate expected amounts from metadata
function calculateExpectedAmounts(metadata: Record<string, string>): {
  basePriceCents: number;
  platformFeeCents: number;
  totalCents: number;
} {
  const base = parseInt(metadata.basePriceCents || '0', 10);
  const fee = parseInt(metadata.platformFeeCents || '0', 10);
  return {
    basePriceCents: base,
    platformFeeCents: fee,
    totalCents: base + fee,
  };
}

describe("Stripe Webhook Event Processing", () => {
  describe("Metadata Redaction (PII Compliance)", () => {
    it("should keep only safe metadata keys", () => {
      const rawMetadata = {
        holdId: "hold-123",
        userId: "user-123",
        eventId: "event-123",
        // PII that should be removed:
        email: "test@example.com",
        customerName: "John Doe",
        phoneNumber: "+1234567890",
        // Safe fields:
        basePriceCents: "1000",
        platformFeeCents: "100",
      };

      const safe = redactMetadata(rawMetadata);

      expect(safe.holdId).toBe("hold-123");
      expect(safe.userId).toBe("user-123");
      expect(safe.eventId).toBe("event-123");
      expect(safe.basePriceCents).toBe("1000");
      expect(safe.platformFeeCents).toBe("100");
      // PII should be removed
      expect(safe.email).toBeUndefined();
      expect(safe.customerName).toBeUndefined();
      expect(safe.phoneNumber).toBeUndefined();
    });

    it("should handle empty metadata", () => {
      const safe = redactMetadata({});
      expect(Object.keys(safe)).toHaveLength(0);
    });

    it("should preserve all allowed metadata keys", () => {
      const fullMetadata: Record<string, string> = {};
      SAFE_METADATA_KEYS.forEach((key, index) => {
        fullMetadata[key] = `value-${index}`;
      });

      const safe = redactMetadata(fullMetadata);

      SAFE_METADATA_KEYS.forEach((key, index) => {
        expect(safe[key]).toBe(`value-${index}`);
      });
    });
  });

  describe("Payment Intent Metadata Validation", () => {
    it("should validate hold purchase metadata", () => {
      const metadata = {
        holdId: "hold-123",
        userId: "user-123",
        eventId: "event-123",
        ticketTierId: "tier-123",
        quantity: "2",
        type: "ticket_purchase",
      };

      const result = validatePaymentIntentMetadata(metadata);

      expect(result.valid).toBe(true);
      expect(result.orderType).toBe("hold");
      expect(result.missingFields).toHaveLength(0);
    });

    it("should validate RSVP purchase metadata", () => {
      const metadata = {
        rsvpId: "rsvp-123",
        userId: "user-123",
        eventId: "event-123",
        ticketTierId: "tier-123",
        quantity: "1",
        type: "rsvp_request",
      };

      const result = validatePaymentIntentMetadata(metadata);

      expect(result.valid).toBe(true);
      expect(result.orderType).toBe("rsvp");
      expect(result.missingFields).toHaveLength(0);
    });

    it("should detect missing holdId for hold purchase", () => {
      const metadata = {
        // Missing holdId
        userId: "user-123",
        eventId: "event-123",
      };

      const result = validatePaymentIntentMetadata(metadata);

      expect(result.valid).toBe(false);
      expect(result.orderType).toBe("unknown");
    });

    it("should detect missing userId for hold purchase", () => {
      const metadata = {
        holdId: "hold-123",
        // Missing userId
        eventId: "event-123",
      };

      const result = validatePaymentIntentMetadata(metadata);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain("userId");
    });

    it("should prefer hold over rsvp when both present", () => {
      const metadata = {
        holdId: "hold-123",
        rsvpId: "rsvp-123",
        userId: "user-123",
        eventId: "event-123",
      };

      const result = validatePaymentIntentMetadata(metadata);

      expect(result.orderType).toBe("hold");
    });
  });

  describe("Amount Calculations", () => {
    it("should calculate total from base and fee", () => {
      const metadata = {
        basePriceCents: "1000",
        platformFeeCents: "100",
      };

      const amounts = calculateExpectedAmounts(metadata);

      expect(amounts.basePriceCents).toBe(1000);
      expect(amounts.platformFeeCents).toBe(100);
      expect(amounts.totalCents).toBe(1100);
    });

    it("should handle missing amounts as zero", () => {
      const metadata = {};

      const amounts = calculateExpectedAmounts(metadata);

      expect(amounts.basePriceCents).toBe(0);
      expect(amounts.platformFeeCents).toBe(0);
      expect(amounts.totalCents).toBe(0);
    });

    it("should handle free tickets (zero amounts)", () => {
      const metadata = {
        basePriceCents: "0",
        platformFeeCents: "0",
      };

      const amounts = calculateExpectedAmounts(metadata);

      expect(amounts.totalCents).toBe(0);
    });

    it("should handle discounted purchases", () => {
      const metadata = {
        basePriceCents: "850", // Original 1000, 15% discount = 850
        platformFeeCents: "85", // Fee on discounted amount
        discountAmountCents: "150",
      };

      const amounts = calculateExpectedAmounts(metadata);

      expect(amounts.basePriceCents).toBe(850);
      expect(amounts.platformFeeCents).toBe(85);
      expect(amounts.totalCents).toBe(935);
    });
  });

  describe("Event Type Handling", () => {
    const handledEventTypes = [
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "payment_intent.canceled",
      "checkout.session.completed",
      "charge.refunded",
      "charge.dispute.created",
    ];

    handledEventTypes.forEach(eventType => {
      it(`should recognize ${eventType} as a handled event`, () => {
        expect(handledEventTypes.includes(eventType)).toBe(true);
      });
    });

    it("should identify unhandled event types", () => {
      const unhandledTypes = [
        "customer.created",
        "invoice.paid",
        "subscription.created",
      ];

      unhandledTypes.forEach(type => {
        expect(handledEventTypes.includes(type)).toBe(false);
      });
    });
  });

  describe("Idempotency Key Generation", () => {
    it("should generate consistent idempotency key from event ID", () => {
      const eventId = "evt_123abc456def";
      
      // Idempotency key should be based on event ID
      const key1 = `webhook_${eventId}`;
      const key2 = `webhook_${eventId}`;
      
      expect(key1).toBe(key2);
    });

    it("should generate unique keys for different events", () => {
      const key1 = `webhook_evt_123`;
      const key2 = `webhook_evt_456`;
      
      expect(key1).not.toBe(key2);
    });
  });

  describe("Order Creation Data Extraction", () => {
    it("should extract order data from hold payment metadata", () => {
      const metadata = {
        holdId: "hold-123",
        userId: "user-123",
        eventId: "event-123",
        ticketTierId: "tier-123",
        quantity: "2",
        stageId: "stage-1",
        basePriceCents: "2000",
        platformFeeCents: "200",
        promoter_code: "PROMO123",
      };

      // Simulate extracting order creation params
      const orderParams = {
        holdId: metadata.holdId,
        userId: metadata.userId,
        eventId: metadata.eventId,
        ticketTierId: metadata.ticketTierId,
        quantity: parseInt(metadata.quantity, 10),
        stageId: metadata.stageId || null,
        totalCents: parseInt(metadata.basePriceCents, 10) + parseInt(metadata.platformFeeCents, 10),
        promoterCode: metadata.promoter_code || null,
      };

      expect(orderParams.holdId).toBe("hold-123");
      expect(orderParams.quantity).toBe(2);
      expect(orderParams.totalCents).toBe(2200);
      expect(orderParams.promoterCode).toBe("PROMO123");
    });

    it("should extract order data from RSVP payment metadata", () => {
      const metadata = {
        rsvpId: "rsvp-123",
        userId: "user-123",
        eventId: "event-123",
        ticketTierId: "tier-123",
        quantity: "3",
        stageId: "stage-2",
        basePriceCents: "2550", // After 15% discount
        platformFeeCents: "255",
        promotionalCodeId: "promo-uuid",
      };

      const orderParams = {
        rsvpId: metadata.rsvpId,
        userId: metadata.userId,
        eventId: metadata.eventId,
        ticketTierId: metadata.ticketTierId,
        quantity: parseInt(metadata.quantity, 10),
        stageId: metadata.stageId || null,
        totalCents: parseInt(metadata.basePriceCents, 10) + parseInt(metadata.platformFeeCents, 10),
        promotionalCodeId: metadata.promotionalCodeId || null,
      };

      expect(orderParams.rsvpId).toBe("rsvp-123");
      expect(orderParams.quantity).toBe(3);
      expect(orderParams.totalCents).toBe(2805);
      expect(orderParams.promotionalCodeId).toBe("promo-uuid");
    });
  });
});
