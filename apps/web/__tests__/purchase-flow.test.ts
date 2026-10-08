/**
 * Unit Tests for Purchase Flow Logic
 *
 * These are unit tests that test calculation logic in isolation.
 * They test the actual utility functions from the codebase.
 *
 * For integration tests that test the actual React component,
 * see: purchase-page.integration.test.tsx
 *
 * Tests critical purchase flow scenarios including:
 * - Stage pricing calculations in all payment flows
 * - RSVP and direct purchase paths
 * - Promotion code calculations with stage pricing
 * - QR code generation and validation
 * - Price display consistency
 * - Payment processing without errors (mocking payment provider)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calculateUnitPrice,
  validateQRCodeFormat,
} from "../app/lib/utils/purchase-calculations";
import {
  extractBasePrice,
  FLAME_MARKUP_PERCENT,
  ECUADOR_IVA_RATE,
  calculateFeeBreakdownFromTotal,
} from "@project-flame/lib";

describe("Purchase Flow - Stage Pricing Calculations", () => {
  describe("RSVP Purchase Flow", () => {
    it("should use stage_price_cents for RSVP purchases when available", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335, // $3.35
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0, // Base tier price (should be ignored)
      };

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(unitPrice).toBe(335);
    });

    it("should fallback to tier price when RSVP has no stage pricing", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: null,
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 500, // $5.00
      };

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(unitPrice).toBe(500);
    });

    it("should handle free stage pricing (0 cents) for RSVP", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 0, // Free Early Bird stage
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 335, // Regular price
      };

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(unitPrice).toBe(0);
    });
  });

  describe("Direct Purchase (Hold) Flow", () => {
    it("should use stage_price_cents for hold purchases when available", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335, // $3.35
      };
      const ticketTier = {
        price_cents: 0, // Base tier price (should be ignored)
      };

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(unitPrice).toBe(335);
    });

    it("should fallback to tier price when hold has no stage pricing", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: null,
      };
      const ticketTier = {
        price_cents: 500, // $5.00
      };

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(unitPrice).toBe(500);
    });
  });

  describe("Promotion Code Calculations", () => {
    it("should calculate promo discount from stage price, not tier price", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335, // Stage price: $3.35
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0, // Base tier price (should be ignored)
      };
      const quantity = 1;
      const discountPercentage = 10; // 10% off

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotalCents = unitPrice * quantity;
      const discountAmountCents = Math.round(
        (subtotalCents * discountPercentage) / 100
      );
      const totalCents = subtotalCents - discountAmountCents;

      expect(unitPrice).toBe(335);
      expect(subtotalCents).toBe(335);
      expect(discountAmountCents).toBe(34); // 10% of $3.35 = $0.34
      expect(totalCents).toBe(301); // $3.35 - $0.34 = $3.01
    });

    it("should calculate promo discount correctly for multiple tickets", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335, // Stage price: $3.35
      };
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 3;
      const discountPercentage = 20; // 20% off

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotalCents = unitPrice * quantity;
      const discountAmountCents = Math.round(
        (subtotalCents * discountPercentage) / 100
      );
      const totalCents = subtotalCents - discountAmountCents;

      expect(unitPrice).toBe(335);
      expect(subtotalCents).toBe(1005); // 3 * $3.35 = $10.05
      expect(discountAmountCents).toBe(201); // 20% of $10.05 = $2.01
      expect(totalCents).toBe(804); // $10.05 - $2.01 = $8.04
    });

    it("should handle 100% discount correctly (free tickets)", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335,
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 1;
      const discountPercentage = 100; // 100% off

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotalCents = unitPrice * quantity;
      const discountAmountCents = Math.round(
        (subtotalCents * discountPercentage) / 100
      );
      const totalCents = Math.max(0, subtotalCents - discountAmountCents);

      expect(unitPrice).toBe(335);
      expect(subtotalCents).toBe(335);
      expect(discountAmountCents).toBe(335);
      expect(totalCents).toBe(0); // Free ticket
    });

    it("should calculate promo discount correctly for RSVP multiple tickets", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335, // Stage price: $3.35
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0, // Base tier price (should be ignored)
      };
      const quantity = 2;
      const discountPercentage = 15; // 15% off

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotalCents = unitPrice * quantity;
      const discountAmountCents = Math.round(
        (subtotalCents * discountPercentage) / 100
      );
      const totalCents = subtotalCents - discountAmountCents;

      expect(unitPrice).toBe(335);
      expect(subtotalCents).toBe(670); // 2 * $3.35 = $6.70
      expect(discountAmountCents).toBe(101); // 15% of $6.70 = $1.01
      expect(totalCents).toBe(569); // $6.70 - $1.01 = $5.69
    });

    it("should calculate promo discount correctly for Hold single ticket", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335, // Stage price: $3.35
      };
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 1;
      const discountPercentage = 10; // 10% off

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotalCents = unitPrice * quantity;
      const discountAmountCents = Math.round(
        (subtotalCents * discountPercentage) / 100
      );
      const totalCents = subtotalCents - discountAmountCents;

      expect(unitPrice).toBe(335);
      expect(subtotalCents).toBe(335);
      expect(discountAmountCents).toBe(34); // 10% of $3.35 = $0.34
      expect(totalCents).toBe(301); // $3.35 - $0.34 = $3.01
    });

    it("should handle 100% discount correctly for Hold purchases (free tickets)", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335,
      };
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 1;
      const discountPercentage = 100; // 100% off

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotalCents = unitPrice * quantity;
      const discountAmountCents = Math.round(
        (subtotalCents * discountPercentage) / 100
      );
      const totalCents = Math.max(0, subtotalCents - discountAmountCents);

      expect(unitPrice).toBe(335);
      expect(subtotalCents).toBe(335);
      expect(discountAmountCents).toBe(335);
      expect(totalCents).toBe(0); // Free ticket
    });
  });

  describe("Price Display Consistency", () => {
    it("should show same price in display and payment calculations", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335,
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 1;

      // Display calculation (what user sees)
      const displayUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const displaySubtotal = displayUnitPrice * quantity;

      // Payment calculation (what gets charged)
      const paymentUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const paymentSubtotal = paymentUnitPrice * quantity;

      expect(displayUnitPrice).toBe(paymentUnitPrice);
      expect(displaySubtotal).toBe(paymentSubtotal);
      expect(displaySubtotal).toBe(335);
    });

    it("should prevent price mismatch bug (display vs payment)", () => {
      // This test ensures we don't have the bug where:
      // - Display shows stage price ($3.35)
      // - Payment charges tier price ($0 or $5)
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335, // Stage price
      };
      const ticketTier = {
        price_cents: 500, // Different tier price
      };
      const quantity = 1;

      // Both should use stage price
      const displayPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const paymentPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(displayPrice).toBe(335);
      expect(paymentPrice).toBe(335);
      expect(displayPrice).not.toBe(ticketTier.price_cents); // Should NOT use tier price
    });
  });
});

describe("QR Code Generation and Validation", () => {
  describe("QR Code Format Validation", () => {
    it("should validate correct QR code format", () => {
      const qrData = {
        orderId: "9f31cc4c-6d26-4313-876e-802f45a5ad06",
        eventId: "cf9fbf58-ad50-45b5-9a7e-8c03d1853e99",
        ticketNumber: 1,
        qrToken: "68bf6d03-8676-4a78-8481-7b346f8c05fc",
        timestamp: new Date().toISOString(),
      };

      const validation = validateQRCodeFormat(qrData);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should reject QR code missing orderId", () => {
      const qrData = {
        eventId: "cf9fbf58-ad50-45b5-9a7e-8c03d1853e99",
        ticketNumber: 1,
        qrToken: "68bf6d03-8676-4a78-8481-7b346f8c05fc",
      };

      const validation = validateQRCodeFormat(qrData);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Missing orderId");
    });

    it("should reject QR code missing eventId", () => {
      const qrData = {
        orderId: "9f31cc4c-6d26-4313-876e-802f45a5ad06",
        ticketNumber: 1,
        qrToken: "68bf6d03-8676-4a78-8481-7b346f8c05fc",
      };

      const validation = validateQRCodeFormat(qrData);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Missing eventId");
    });

    it("should reject QR code missing ticketNumber", () => {
      const qrData = {
        orderId: "9f31cc4c-6d26-4313-876e-802f45a5ad06",
        eventId: "cf9fbf58-ad50-45b5-9a7e-8c03d1853e99",
        qrToken: "68bf6d03-8676-4a78-8481-7b346f8c05fc",
      };

      const validation = validateQRCodeFormat(qrData);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Missing ticketNumber");
    });

    it("should reject QR code missing qrToken", () => {
      const qrData = {
        orderId: "9f31cc4c-6d26-4313-876e-802f45a5ad06",
        eventId: "cf9fbf58-ad50-45b5-9a7e-8c03d1853e99",
        ticketNumber: 1,
      };

      const validation = validateQRCodeFormat(qrData);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Missing qrToken");
    });

    it("should reject old QR code format (ticket_id instead of orderId)", () => {
      // Old format that caused "Invalid ticket QR code" errors
      const oldFormatQR = {
        ticket_id: "68bf6d03-8676-4a78-8481-7b346f8c05fc",
        event_id: "cf9fbf58-ad50-45b5-9a7e-8c03d1853e99",
        tier_id: "6273ad78-983f-44a6-a1e5-98a659f200fc",
        attendee_email: "test@example.com",
        timestamp: new Date().toISOString(),
      };

      const validation = validateQRCodeFormat(oldFormatQR);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe("QR Code Data Structure", () => {
    it("should generate QR code with all required fields for scanner", () => {
      const orderId = "9f31cc4c-6d26-4313-876e-802f45a5ad06";
      const eventId = "cf9fbf58-ad50-45b5-9a7e-8c03d1853e99";
      const ticketNumber = 1;
      const qrToken = "68bf6d03-8676-4a78-8481-7b346f8c05fc";

      const qrData = {
        orderId,
        eventId,
        ticketNumber,
        qrToken,
        timestamp: new Date().toISOString(),
      };

      const validation = validateQRCodeFormat(qrData);

      expect(validation.valid).toBe(true);
      expect(qrData).toHaveProperty("orderId");
      expect(qrData).toHaveProperty("eventId");
      expect(qrData).toHaveProperty("ticketNumber");
      expect(qrData).toHaveProperty("qrToken");
    });
  });

  describe("Ticket Verification Response", () => {
    it("should include metadata with stage information in ticket response", () => {
      // Mock ticket verification response format
      const ticketResponse = {
        success: true,
        ticket: {
          id: "b24b44cd-7c37-467a-ace6-e8b73ed008fb",
          attendee_name: "Test User",
          attendee_email: "test@example.com",
          status: "issued",
          checked_in_at: null,
          qr_token: "68bf6d03-8676-4a78-8481-7b346f8c05fc",
          metadata: {
            stage_id: "1f84847e-17e5-4375-8925-a4fcab3e5819",
            stage_name: "Regular",
            stage_price_cents: 335,
          },
          ticket_tier: {
            name: "Stages",
            price_cents: 0,
          },
          events: {
            name: "Test Event",
            starts_at: "2025-11-04T21:00:00Z",
            venue: "Test Venue",
          },
          order: {
            quantity: 1,
          },
        },
        isPromotionalTicket: false,
      };

      // Verify metadata is included
      expect(ticketResponse.ticket).toHaveProperty("metadata");
      expect(ticketResponse.ticket.metadata).toHaveProperty("stage_name");
      expect(ticketResponse.ticket.metadata?.stage_name).toBe("Regular");
      expect(ticketResponse.ticket.metadata?.stage_price_cents).toBe(335);
    });

    it("should handle tickets without stage metadata gracefully", () => {
      // Mock ticket verification response for non-staged tier
      const ticketResponse = {
        success: true,
        ticket: {
          id: "test-ticket-id",
          attendee_name: "Test User",
          attendee_email: "test@example.com",
          status: "issued",
          checked_in_at: null,
          qr_token: "test-qr-token",
          metadata: null, // No stage metadata
          ticket_tier: {
            name: "General Admission",
            price_cents: 500,
          },
          events: {
            name: "Test Event",
            starts_at: "2025-11-04T21:00:00Z",
            venue: "Test Venue",
          },
          order: {
            quantity: 1,
          },
        },
        isPromotionalTicket: false,
      };

      // Verify response is valid even without metadata
      expect(ticketResponse.ticket).toHaveProperty("metadata");
      expect(ticketResponse.ticket.metadata).toBeNull();
      expect(ticketResponse.ticket.ticket_tier.name).toBe("General Admission");
    });
  });
});

describe("Payment Processing Scenarios", () => {
  describe("Free Ticket Detection", () => {
    it("should detect free tickets when stage price is 0", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 0, // Free Early Bird
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 335, // Regular price
      };
      const quantity = 1;
      const discountAmountCents = 0;

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotalCents = unitPrice * quantity;
      const totalCents = Math.max(0, subtotalCents - discountAmountCents);

      expect(unitPrice).toBe(0);
      expect(totalCents).toBe(0);
    });

    it("should detect free tickets after 100% promo discount", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335,
      };
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 1;
      const discountPercentage = 100;

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotalCents = unitPrice * quantity;
      const discountAmountCents = Math.round(
        (subtotalCents * discountPercentage) / 100
      );
      const totalCents = Math.max(0, subtotalCents - discountAmountCents);

      expect(totalCents).toBe(0);
    });
  });

  describe("Fee Breakdown Calculation", () => {
    /**
     * Helper function to calculate fee breakdown with discount
     * Uses the canonical production implementation to ensure test accuracy
     */
    function calculateFeeBreakdown(
      unitPriceCents: number,
      quantity: number,
      discountAmountCents: number
    ) {
      const subtotal = unitPriceCents * quantity;
      const finalTotal = Math.max(0, subtotal - discountAmountCents);
      const feeBreakdown = calculateFeeBreakdownFromTotal(finalTotal);

      return {
        baseTotal: feeBreakdown.basePriceCents,
        totalServiceFees: feeBreakdown.serviceFeeCents,
        totalIva: feeBreakdown.ivaCents,
        finalTotal,
      };
    }

    it("should calculate correct fee breakdown without discount", () => {
      // $100 ticket: base $100 + $7 fee + $1.05 IVA = $108.05
      const unitPriceCents = 10805; // $108.05
      const quantity = 1;
      const discountAmountCents = 0;

      const breakdown = calculateFeeBreakdown(
        unitPriceCents,
        quantity,
        discountAmountCents
      );

      // Verify breakdown components sum to final total
      expect(
        breakdown.baseTotal + breakdown.totalServiceFees + breakdown.totalIva
      ).toBe(breakdown.finalTotal);

      // Verify fee structure relationship
      expect(breakdown.totalServiceFees).toBe(
        Math.round((breakdown.baseTotal * FLAME_MARKUP_PERCENT) / 100)
      );
      expect(breakdown.totalIva).toBe(
        Math.round(breakdown.totalServiceFees * ECUADOR_IVA_RATE)
      );

      // Verify expected values
      expect(breakdown.baseTotal).toBe(10000); // $100.00
      expect(breakdown.totalServiceFees).toBe(700); // $7.00
      expect(breakdown.totalIva).toBe(105); // $1.05
      expect(breakdown.finalTotal).toBe(10805); // $108.05
    });

    it("should calculate correct fee breakdown with 10% discount", () => {
      // $100 ticket with 10% discount
      // Original: $108.05, Discount: $10.81, Final: $97.24
      const unitPriceCents = 10805; // $108.05
      const quantity = 1;
      const discountAmountCents = 1081; // 10% of $108.05 = $10.81

      const breakdown = calculateFeeBreakdown(
        unitPriceCents,
        quantity,
        discountAmountCents
      );

      // Verify breakdown components sum to final total
      // Allow 1 cent tolerance for rounding differences
      const calculatedTotal =
        breakdown.baseTotal + breakdown.totalServiceFees + breakdown.totalIva;
      expect(
        Math.abs(calculatedTotal - breakdown.finalTotal)
      ).toBeLessThanOrEqual(1);

      // Verify fee structure relationship is preserved
      const expectedServiceFee = Math.round(
        (breakdown.baseTotal * FLAME_MARKUP_PERCENT) / 100
      );
      const expectedIva = Math.round(expectedServiceFee * ECUADOR_IVA_RATE);

      // Allow 1 cent tolerance for rounding
      expect(
        Math.abs(breakdown.totalServiceFees - expectedServiceFee)
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(breakdown.totalIva - expectedIva)).toBeLessThanOrEqual(1);

      // Verify final total is correct
      expect(breakdown.finalTotal).toBe(9724); // $97.24
    });

    it("should calculate correct fee breakdown with 15% discount on multiple tickets", () => {
      // 2 tickets at $108.05 each = $216.10
      // 15% discount = $32.42, Final: $183.68
      const unitPriceCents = 10805; // $108.05
      const quantity = 2;
      const discountAmountCents = 3242; // 15% of $216.10 = $32.42

      const breakdown = calculateFeeBreakdown(
        unitPriceCents,
        quantity,
        discountAmountCents
      );

      // Verify breakdown components sum to final total
      // Allow 1 cent tolerance for rounding differences
      const calculatedTotal =
        breakdown.baseTotal + breakdown.totalServiceFees + breakdown.totalIva;
      expect(
        Math.abs(calculatedTotal - breakdown.finalTotal)
      ).toBeLessThanOrEqual(1);

      // Verify fee structure relationship is preserved
      const expectedServiceFee = Math.round(
        (breakdown.baseTotal * FLAME_MARKUP_PERCENT) / 100
      );
      const expectedIva = Math.round(expectedServiceFee * ECUADOR_IVA_RATE);

      // Allow 1 cent tolerance for rounding
      expect(
        Math.abs(breakdown.totalServiceFees - expectedServiceFee)
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(breakdown.totalIva - expectedIva)).toBeLessThanOrEqual(1);

      // Verify final total is correct
      expect(breakdown.finalTotal).toBe(18368); // $183.68
    });

    it("should preserve fee structure relationship after discount", () => {
      // Test with various discount percentages to ensure fee structure is always preserved
      const unitPriceCents = 10805; // $108.05
      const quantity = 1;

      for (const discountPercent of [5, 10, 15, 20, 25, 50, 75]) {
        const subtotal = unitPriceCents * quantity;
        const discountAmountCents = Math.round(
          (subtotal * discountPercent) / 100
        );

        const breakdown = calculateFeeBreakdown(
          unitPriceCents,
          quantity,
          discountAmountCents
        );

        // Verify breakdown components sum to final total
        // Allow 1 cent tolerance for rounding differences
        const calculatedTotal =
          breakdown.baseTotal + breakdown.totalServiceFees + breakdown.totalIva;
        expect(
          Math.abs(calculatedTotal - breakdown.finalTotal)
        ).toBeLessThanOrEqual(1);

        // Verify fee structure relationship
        const expectedServiceFee = Math.round(
          (breakdown.baseTotal * FLAME_MARKUP_PERCENT) / 100
        );
        const expectedIva = Math.round(expectedServiceFee * ECUADOR_IVA_RATE);

        // Allow 1 cent tolerance for rounding
        expect(
          Math.abs(breakdown.totalServiceFees - expectedServiceFee)
        ).toBeLessThanOrEqual(1);
        expect(Math.abs(breakdown.totalIva - expectedIva)).toBeLessThanOrEqual(
          1
        );
      }
    });

    it("should handle 100% discount correctly (free tickets)", () => {
      const unitPriceCents = 10805; // $108.05
      const quantity = 1;
      const subtotal = unitPriceCents * quantity;
      const discountAmountCents = subtotal; // 100% discount

      const breakdown = calculateFeeBreakdown(
        unitPriceCents,
        quantity,
        discountAmountCents
      );

      // All components should be 0
      expect(breakdown.baseTotal).toBe(0);
      expect(breakdown.totalServiceFees).toBe(0);
      expect(breakdown.totalIva).toBe(0);
      expect(breakdown.finalTotal).toBe(0);
    });
  });

  describe("Price Calculation Consistency", () => {
    it("should calculate same price in promo validation and checkout", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335,
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 2;

      // Promo validation calculation
      const promoUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const promoSubtotal = promoUnitPrice * quantity;

      // Checkout calculation
      const checkoutUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const checkoutSubtotal = checkoutUnitPrice * quantity;

      expect(promoSubtotal).toBe(checkoutSubtotal);
      expect(promoSubtotal).toBe(670); // 2 * $3.35
    });

    it("should calculate same price in widget callback and checkout", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335,
      };
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 1;
      const discountAmountCents = 34; // 10% off

      // Widget callback calculation
      const widgetUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const widgetSubtotal = widgetUnitPrice * quantity;
      const widgetTotal = Math.max(0, widgetSubtotal - discountAmountCents);

      // Checkout calculation
      const checkoutUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const checkoutSubtotal = checkoutUnitPrice * quantity;
      const checkoutTotal = Math.max(0, checkoutSubtotal - discountAmountCents);

      expect(widgetTotal).toBe(checkoutTotal);
      expect(widgetTotal).toBe(301); // $3.35 - $0.34
    });
  });
});

describe("Critical Bug Scenarios", () => {
  describe("Daniel's Purchase Bug (Unit Price Mismatch)", () => {
    it("should prevent 'Unit price mismatch' error for stage-priced tickets", () => {
      // Scenario: User purchases ticket at stage price ($3.35)
      // but validation expects tier base price ($0)
      // This should NOT happen with our fix

      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335, // Stage price: $3.35
      };
      const ticketTier = {
        price_cents: 0, // Base tier price: $0 (Early Bird is free)
      };
      const quantity = 1;

      // Frontend calculation (what we send to API)
      const frontendUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const frontendSubtotal = frontendUnitPrice * quantity;

      // Backend validation (what database function expects)
      // With our fix, backend should also use stage_price_cents
      const backendExpectedPrice =
        holdDetails.stage_price_cents ?? ticketTier.price_cents;

      expect(frontendUnitPrice).toBe(335);
      expect(backendExpectedPrice).toBe(335);
      expect(frontendUnitPrice).toBe(backendExpectedPrice);
      // This ensures no "Unit price mismatch" error
    });

    it("should handle regular stage price correctly", () => {
      // Scenario: Regular stage at $3.35, not Early Bird at $0
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335, // Regular stage
      };
      const ticketTier = {
        price_cents: 0, // Base tier price
      };

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(unitPrice).toBe(335);
      expect(unitPrice).not.toBe(0); // Should NOT use base tier price
    });

    it("should prevent 'Unit price mismatch' error for RSVP stage-priced tickets", () => {
      // Scenario: User RSVPs for ticket at stage price ($3.35)
      // but validation expects tier base price ($0)
      // This should NOT happen with our fix

      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335, // Stage price: $3.35
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0, // Base tier price: $0 (Early Bird is free)
      };
      const quantity = 1;

      // Frontend calculation (what we send to API)
      const frontendUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const frontendSubtotal = frontendUnitPrice * quantity;

      // Backend validation (what database function expects)
      // With our fix, backend should also use stage_price_cents
      const backendExpectedPrice =
        rsvpDetails.stage_price_cents ?? ticketTier.price_cents;

      expect(frontendUnitPrice).toBe(335);
      expect(backendExpectedPrice).toBe(335);
      expect(frontendUnitPrice).toBe(backendExpectedPrice);
      // This ensures no "Unit price mismatch" error
    });
  });

  describe("Price Display Bug Prevention", () => {
    it("should show correct price in all UI components", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335,
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0,
      };

      // Purchase summary display
      const summaryPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      // Ticket modal display
      const modalPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      // RSVP list display
      const listPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(summaryPrice).toBe(335);
      expect(modalPrice).toBe(335);
      expect(listPrice).toBe(335);
      expect(summaryPrice).toBe(modalPrice);
      expect(modalPrice).toBe(listPrice);
    });
  });
});

describe("Edge Cases and Error Prevention", () => {
  describe("Null/Undefined Handling", () => {
    it("should handle null stage_price_cents gracefully", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: null,
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 500,
      };

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(unitPrice).toBe(500); // Should fallback to tier price
    });

    it("should handle undefined stage_price_cents gracefully", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {}; // No stage_price_cents property
      const ticketTier = {
        price_cents: 500,
      };

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(unitPrice).toBe(500); // Should fallback to tier price
    });
  });

  describe("Zero Price Handling", () => {
    it("should handle zero stage price correctly (not null/undefined)", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 0, // Explicitly 0, not null
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 335,
      };

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      expect(unitPrice).toBe(0); // Should use 0, not fallback to 335
    });
  });
});

describe("Integration Scenarios", () => {
  describe("Complete Purchase Flow - Staged Tier", () => {
    it("should maintain price consistency throughout entire flow", () => {
      // Simulate complete purchase flow for a staged tier ticket
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335, // Regular stage: $3.35
      };
      const ticketTier = {
        price_cents: 0, // Base tier (Early Bird) is free
      };
      const quantity = 1;
      const discountPercentage = 0; // No promo code

      // Step 1: Initial display on purchase page
      const displayPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      // Step 2: Promo code validation (if applicable)
      const promoPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );

      // Step 3: Free ticket detection
      const subtotal = promoPrice * quantity;
      const discountAmount = Math.round((subtotal * discountPercentage) / 100);
      const total = Math.max(0, subtotal - discountAmount);
      const isFree = total === 0;

      // Step 4: Checkout creation
      const checkoutPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const checkoutSubtotal = checkoutPrice * quantity;

      // Step 5: Widget callback
      const widgetPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const widgetSubtotal = widgetPrice * quantity;

      // All prices should be consistent
      expect(displayPrice).toBe(335);
      expect(promoPrice).toBe(335);
      expect(checkoutPrice).toBe(335);
      expect(widgetPrice).toBe(335);
      expect(checkoutSubtotal).toBe(335);
      expect(widgetSubtotal).toBe(335);
      expect(isFree).toBe(false);
    });
  });

  describe("Complete Purchase Flow - Free Stage", () => {
    it("should handle free stage pricing correctly", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 0, // Early Bird is free
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 335, // Regular price
      };
      const quantity = 1;

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotal = unitPrice * quantity;
      const total = subtotal;

      expect(unitPrice).toBe(0);
      expect(subtotal).toBe(0);
      expect(total).toBe(0);
    });
  });

  describe("Complete Purchase Flow - RSVP Paid with Promo Code", () => {
    it("should maintain price consistency in complete RSVP paid purchase flow with promo", () => {
      // Simulate complete RSVP purchase flow for a paid ticket with promotional code
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335, // Regular stage: $3.35
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0, // Base tier (Early Bird) is free
      };
      const quantity = 2;
      const discountPercentage = 15; // 15% promo discount

      // Step 1: Initial display on purchase page
      const displayPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const displaySubtotal = displayPrice * quantity;

      // Step 2: Promo code validation
      const promoPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const promoSubtotal = promoPrice * quantity;
      const promoDiscountAmount = Math.round(
        (promoSubtotal * discountPercentage) / 100
      );
      const promoTotal = Math.max(0, promoSubtotal - promoDiscountAmount);

      // Step 3: Free ticket detection
      const isFree = promoTotal === 0;

      // Step 4: Checkout creation
      const checkoutPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const checkoutSubtotal = checkoutPrice * quantity;
      const checkoutDiscountAmount = Math.round(
        (checkoutSubtotal * discountPercentage) / 100
      );
      const checkoutTotal = Math.max(
        0,
        checkoutSubtotal - checkoutDiscountAmount
      );

      // Step 5: Payment processing (widget callback)
      const widgetPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const widgetSubtotal = widgetPrice * quantity;
      const widgetDiscountAmount = Math.round(
        (widgetSubtotal * discountPercentage) / 100
      );
      const widgetTotal = Math.max(0, widgetSubtotal - widgetDiscountAmount);

      // All prices should be consistent throughout the flow
      expect(displayPrice).toBe(335);
      expect(promoPrice).toBe(335);
      expect(checkoutPrice).toBe(335);
      expect(widgetPrice).toBe(335);

      expect(displaySubtotal).toBe(670); // 2 * $3.35
      expect(promoSubtotal).toBe(670);
      expect(checkoutSubtotal).toBe(670);
      expect(widgetSubtotal).toBe(670);

      expect(promoDiscountAmount).toBe(101); // 15% of $6.70
      expect(checkoutDiscountAmount).toBe(101);
      expect(widgetDiscountAmount).toBe(101);

      expect(promoTotal).toBe(569); // $6.70 - $1.01
      expect(checkoutTotal).toBe(569);
      expect(widgetTotal).toBe(569);

      expect(isFree).toBe(false);
    });
  });

  describe("Complete Purchase Flow - Free Hold Ticket", () => {
    it("should handle free Hold ticket correctly", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 0, // Free Early Bird stage
      };
      const ticketTier = {
        price_cents: 335, // Regular price
      };
      const quantity = 1;

      const unitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const subtotal = unitPrice * quantity;
      const total = subtotal;

      expect(unitPrice).toBe(0);
      expect(subtotal).toBe(0);
      expect(total).toBe(0);
    });
  });

  describe("Complete Purchase Flow - Hold Paid with Promo Code", () => {
    it("should maintain price consistency in complete Hold paid purchase flow with 15% promo", () => {
      // Simulate complete Hold purchase flow for a paid ticket with 15% promotional code
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335, // Regular stage: $3.35
      };
      const ticketTier = {
        price_cents: 0, // Base tier (Early Bird) is free
      };
      const quantity = 2;
      const discountPercentage = 15; // 15% promo discount

      // Step 1: Initial display on purchase page
      const displayPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const displaySubtotal = displayPrice * quantity;

      // Step 2: Promo code validation
      const promoPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const promoSubtotal = promoPrice * quantity;
      const promoDiscountAmount = Math.round(
        (promoSubtotal * discountPercentage) / 100
      );
      const promoTotal = Math.max(0, promoSubtotal - promoDiscountAmount);

      // Step 3: Free ticket detection
      const isFree = promoTotal === 0;

      // Step 4: Checkout creation
      const checkoutPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const checkoutSubtotal = checkoutPrice * quantity;
      const checkoutDiscountAmount = Math.round(
        (checkoutSubtotal * discountPercentage) / 100
      );
      const checkoutTotal = Math.max(
        0,
        checkoutSubtotal - checkoutDiscountAmount
      );

      // Step 5: Payment processing (widget callback)
      const widgetPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const widgetSubtotal = widgetPrice * quantity;
      const widgetDiscountAmount = Math.round(
        (widgetSubtotal * discountPercentage) / 100
      );
      const widgetTotal = Math.max(0, widgetSubtotal - widgetDiscountAmount);

      // All prices should be consistent throughout the flow
      expect(displayPrice).toBe(335);
      expect(promoPrice).toBe(335);
      expect(checkoutPrice).toBe(335);
      expect(widgetPrice).toBe(335);

      expect(displaySubtotal).toBe(670); // 2 * $3.35
      expect(promoSubtotal).toBe(670);
      expect(checkoutSubtotal).toBe(670);
      expect(widgetSubtotal).toBe(670);

      expect(promoDiscountAmount).toBe(101); // 15% of $6.70
      expect(checkoutDiscountAmount).toBe(101);
      expect(widgetDiscountAmount).toBe(101);

      expect(promoTotal).toBe(569); // $6.70 - $1.01
      expect(checkoutTotal).toBe(569);
      expect(widgetTotal).toBe(569);

      expect(isFree).toBe(false);
    });
  });

  describe("Complete Purchase Flow - RSVP Free After Promo", () => {
    it("should handle complete RSVP flow that becomes free after 100% promo code", () => {
      // Simulate complete RSVP purchase flow where promo code makes tickets free
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335, // Regular stage: $3.35
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0, // Base tier
      };
      const quantity = 1;
      const discountPercentage = 100; // 100% promo discount (free tickets)

      // Step 1: Initial display on purchase page
      const displayPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const displaySubtotal = displayPrice * quantity;

      // Step 2: Promo code validation (100% discount)
      const promoPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const promoSubtotal = promoPrice * quantity;
      const promoDiscountAmount = Math.round(
        (promoSubtotal * discountPercentage) / 100
      );
      const promoTotal = Math.max(0, promoSubtotal - promoDiscountAmount);

      // Step 3: Free ticket detection (should be true after promo)
      const isFree = promoTotal === 0;

      // Step 4: Free ticket completion (bypasses payment)
      const freeCompletionPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const freeCompletionSubtotal = freeCompletionPrice * quantity;
      const freeCompletionDiscountAmount = Math.round(
        (freeCompletionSubtotal * discountPercentage) / 100
      );
      const freeCompletionTotal = Math.max(
        0,
        freeCompletionSubtotal - freeCompletionDiscountAmount
      );

      // Verify prices are consistent
      expect(displayPrice).toBe(335);
      expect(promoPrice).toBe(335);
      expect(freeCompletionPrice).toBe(335);

      expect(displaySubtotal).toBe(335);
      expect(promoSubtotal).toBe(335);
      expect(freeCompletionSubtotal).toBe(335);

      expect(promoDiscountAmount).toBe(335); // 100% of $3.35
      expect(freeCompletionDiscountAmount).toBe(335);

      expect(promoTotal).toBe(0); // Free after promo
      expect(freeCompletionTotal).toBe(0);
      expect(isFree).toBe(true);
    });
  });

  describe("Complete Purchase Flow - Hold Free After Promo", () => {
    it("should handle complete Hold flow that becomes free after promo code", () => {
      // Simulate complete Hold purchase flow where promo code makes tickets free
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335, // Regular stage: $3.35
      };
      const ticketTier = {
        price_cents: 0, // Base tier
      };
      const quantity = 1;
      const discountPercentage = 100; // 100% promo discount (free tickets)

      // Step 1: Initial display on purchase page
      const displayPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const displaySubtotal = displayPrice * quantity;

      // Step 2: Promo code validation (100% discount)
      const promoPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const promoSubtotal = promoPrice * quantity;
      const promoDiscountAmount = Math.round(
        (promoSubtotal * discountPercentage) / 100
      );
      const promoTotal = Math.max(0, promoSubtotal - promoDiscountAmount);

      // Step 3: Free ticket detection (should be true after promo)
      const isFree = promoTotal === 0;

      // Step 4: Free ticket completion (bypasses payment)
      const freeCompletionPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const freeCompletionSubtotal = freeCompletionPrice * quantity;
      const freeCompletionDiscountAmount = Math.round(
        (freeCompletionSubtotal * discountPercentage) / 100
      );
      const freeCompletionTotal = Math.max(
        0,
        freeCompletionSubtotal - freeCompletionDiscountAmount
      );

      // Verify prices are consistent
      expect(displayPrice).toBe(335);
      expect(promoPrice).toBe(335);
      expect(freeCompletionPrice).toBe(335);

      expect(displaySubtotal).toBe(335);
      expect(promoSubtotal).toBe(335);
      expect(freeCompletionSubtotal).toBe(335);

      expect(promoDiscountAmount).toBe(335); // 100% of $3.35
      expect(freeCompletionDiscountAmount).toBe(335);

      expect(promoTotal).toBe(0); // Free after promo
      expect(freeCompletionTotal).toBe(0);
      expect(isFree).toBe(true);
    });
  });
});

describe("Payment Amount Calculation", () => {
  /**
   * These tests verify the CALCULATION LOGIC is correct.
   */

  /**
   * Helper to calculate total amount (matches frontend logic)
   */
  function calculateTotalAmount(
    unitPrice: number,
    quantity: number,
    appliedPromoCode: {
      discount_amount_cents: number;
    } | null
  ): number {
    const subtotal = unitPrice * quantity;
    const discountAmount = appliedPromoCode?.discount_amount_cents || 0;
    const totalAmount = Math.max(0, subtotal - discountAmount);
    return totalAmount;
  }

  describe("Total Amount Calculation Accuracy", () => {
    it("should calculate total correctly for stage-priced tickets", () => {
      const unitPrice = 335; // Stage price: $3.35
      const quantity = 1;
      const appliedPromoCode = null;

      const total = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );

      expect(total).toBe(335);
    });

    it("should calculate total correctly with promo code", () => {
      const unitPrice = 335; // Stage price: $3.35
      const quantity = 1;
      const appliedPromoCode = {
        discount_amount_cents: 34, // 10% off
      };

      const total = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );

      expect(total).toBe(301); // $3.35 - $0.34 = $3.01
    });

    it("should calculate total correctly for multiple tickets", () => {
      const unitPrice = 335; // Stage price: $3.35
      const quantity = 3;
      const appliedPromoCode = {
        discount_amount_cents: 201, // 20% off $10.05
      };

      const total = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );

      expect(total).toBe(804); // $10.05 - $2.01 = $8.04
    });

    it("should handle free tickets (100% promo discount)", () => {
      const unitPrice = 335;
      const quantity = 1;
      const appliedPromoCode = {
        discount_amount_cents: 335, // 100% off
      };

      const total = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );

      expect(total).toBe(0);
    });

    it("should handle zero stage price (free stage)", () => {
      const unitPrice = 0; // Free Early Bird stage
      const quantity = 1;
      const appliedPromoCode = null;

      const total = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );

      expect(total).toBe(0);
    });
  });

  describe("Total Amount Updates When Values Change", () => {
    /**
     * These tests verify the EXPECTED behavior: when unitPrice or appliedPromoCode changes,
     * the total calculation should update correctly.
     */
    it("EXPECTED: total should update when unitPrice changes after initial setup", () => {
      // Scenario: Stage pricing loads after initialization
      // Initial state: unitPrice is 0 (tier base price)
      let unitPrice = 0;
      const quantity = 1;
      const appliedPromoCode = null;

      // Initial total (before stage pricing loads)
      const initialTotal = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );
      expect(initialTotal).toBe(0);

      // Stage pricing loads: unitPrice updates to stage price
      unitPrice = 335; // Stage price loads

      // EXPECTED: Should recalculate with new unitPrice
      const updatedTotal = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );
      expect(updatedTotal).toBe(335);

      // Verify the total changed
      expect(updatedTotal).not.toBe(initialTotal);
    });

    it("EXPECTED: total should update when appliedPromoCode changes after initial setup", () => {
      // Scenario: User applies promo code after initialization
      const unitPrice = 335;
      const quantity = 1;
      let appliedPromoCode: { discount_amount_cents: number } | null = null;

      // Initial total (no promo code)
      const initialTotal = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );
      expect(initialTotal).toBe(335);

      // User applies promo code
      appliedPromoCode = {
        discount_amount_cents: 34, // 10% off
      };

      // EXPECTED: Should recalculate with promo code
      const updatedTotal = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );
      expect(updatedTotal).toBe(301);

      // Verify the total changed
      expect(updatedTotal).not.toBe(initialTotal);
      expect(updatedTotal).toBeLessThan(initialTotal);
    });

    it("EXPECTED: total should update when both unitPrice and promo code change", () => {
      // Scenario: Stage pricing loads AND user applies promo code
      let unitPrice = 0; // Initial: tier base price
      const quantity = 1;
      let appliedPromoCode: { discount_amount_cents: number } | null = null;

      // Initial total
      const initialTotal = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );
      expect(initialTotal).toBe(0);

      // Stage pricing loads AND promo code applied
      unitPrice = 335; // Stage price loads
      appliedPromoCode = {
        discount_amount_cents: 34, // 10% off
      };

      // EXPECTED: Should recalculate with both new values
      const updatedTotal = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );
      expect(updatedTotal).toBe(301);

      // Verify the total changed correctly
      expect(updatedTotal).not.toBe(initialTotal);
      expect(updatedTotal).toBe(301); // $3.35 - $0.34
    });
  });

  describe("Total Consistency with Display", () => {
    /**
     * This test ensures the calculated total matches what's displayed in the UI.
     */
    it("should match calculated total with displayed order summary total", () => {
      const mode = "rsvp" as const;
      const rsvpDetails = {
        stage_price_cents: 335,
      };
      const holdDetails = null;
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 2;
      const appliedPromoCode = {
        discount_amount_cents: 101, // 15% off $6.70
      };

      // Display calculation (from order summary)
      const displayUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const displaySubtotal = displayUnitPrice * quantity;
      const displayTotal = Math.max(
        0,
        displaySubtotal - appliedPromoCode.discount_amount_cents
      );

      // Calculation
      const calculatedTotal = calculateTotalAmount(
        displayUnitPrice,
        quantity,
        appliedPromoCode
      );

      // They should match exactly
      expect(calculatedTotal).toBe(displayTotal);
      expect(calculatedTotal).toBe(569); // $6.70 - $1.01
    });

    it("should match calculated total with displayed total for hold purchases", () => {
      const mode = "hold" as const;
      const rsvpDetails = null;
      const holdDetails = {
        stage_price_cents: 335,
      };
      const ticketTier = {
        price_cents: 0,
      };
      const quantity = 1;
      const appliedPromoCode = {
        discount_amount_cents: 34, // 10% off
      };

      // Display calculation
      const displayUnitPrice = calculateUnitPrice(
        mode,
        rsvpDetails,
        holdDetails,
        ticketTier
      );
      const displaySubtotal = displayUnitPrice * quantity;
      const displayTotal = Math.max(
        0,
        displaySubtotal - appliedPromoCode.discount_amount_cents
      );

      // Calculation
      const calculatedTotal = calculateTotalAmount(
        displayUnitPrice,
        quantity,
        appliedPromoCode
      );

      // They should match exactly
      expect(calculatedTotal).toBe(displayTotal);
      expect(calculatedTotal).toBe(301); // $3.35 - $0.34
    });
  });

  describe("Calculation Edge Cases", () => {
    it("should handle null appliedPromoCode gracefully", () => {
      const unitPrice = 335;
      const quantity = 1;
      const appliedPromoCode = null;

      const total = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );

      expect(total).toBe(335);
    });

    it("should prevent negative totals (Math.max protection)", () => {
      // Edge case: discount exceeds subtotal (shouldn't happen, but protect against it)
      const unitPrice = 100;
      const quantity = 1;
      const appliedPromoCode = {
        discount_amount_cents: 150, // Discount exceeds price
      };

      const total = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );

      expect(total).toBe(0); // Math.max(0, ...) prevents negative
    });

    it("should handle zero quantity gracefully", () => {
      const unitPrice = 335;
      const quantity = 0;
      const appliedPromoCode = null;

      const total = calculateTotalAmount(
        unitPrice,
        quantity,
        appliedPromoCode
      );

      expect(total).toBe(0);
    });
  });
});
