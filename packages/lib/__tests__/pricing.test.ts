import { describe, it, expect } from "vitest";
import {
  calculateFinalPrice,
  extractBasePrice,
  extractBasePriceHistorical,
  formatPrice,
  isFreePrice,
  getOrderDisplayCents,
  FLAME_MARKUP_PERCENT,
  ECUADOR_IVA_RATE,
} from "../src";

describe("Pricing Calculations", () => {
  describe("calculateFinalPrice", () => {
    it("calculates correct breakdown for $100 base price", () => {
      const result = calculateFinalPrice(100);

      expect(result.basePrice).toBe(100);
      expect(result.serviceFee).toBe(7); // 7% of $100
      expect(result.iva).toBe(1.05); // 15% of $7
      expect(result.finalPrice).toBe(108.05);
    });

    it("handles zero base price", () => {
      const result = calculateFinalPrice(0);

      expect(result.basePrice).toBe(0);
      expect(result.serviceFee).toBe(0);
      expect(result.iva).toBe(0);
      expect(result.finalPrice).toBe(0);
    });

    it("throws for non-finite numbers", () => {
      expect(() => calculateFinalPrice(NaN)).toThrow(
        "Base price must be a non-negative finite number"
      );
      expect(() => calculateFinalPrice(Infinity)).toThrow(
        "Base price must be a non-negative finite number"
      );
    });

    it("throws for negative numbers", () => {
      expect(() => calculateFinalPrice(-50)).toThrow(
        "Base price must be a non-negative finite number"
      );
      expect(() => calculateFinalPrice(-0.01)).toThrow(
        "Base price must be a non-negative finite number"
      );
    });
  });

  describe("extractBasePrice", () => {
    it("extracts base price from final price (round trip)", () => {
      // $100 base → $108.05 final
      const forward = calculateFinalPrice(100);
      const backward = extractBasePrice(forward.finalPriceCents);

      expect(backward.basePriceCents).toBe(forward.basePriceCents);
    });

    it("handles common ticket prices", () => {
      // Test common round dollar amounts
      const prices = [25, 50, 75, 100, 150, 200];

      for (const price of prices) {
        const forward = calculateFinalPrice(price);
        const backward = extractBasePrice(forward.finalPriceCents);

        expect(backward.basePriceCents).toBe(price * 100);
      }
    });
  });

  describe("extractBasePriceHistorical", () => {
    it("uses stored fee percentage when provided", () => {
      const result = extractBasePriceHistorical(11150, "2025-10-01", 10);

      // With 10% markup: $100 base → $111.50 final
      expect(result.basePriceCents).toBe(10000);
    });

    it("auto-detects markup based on round dollar amounts", () => {
      // $100 with 7% markup = $108.05
      const result7 = extractBasePriceHistorical(10805, "2026-01-01");
      expect(result7.basePriceCents).toBe(10000);

      // $100 with 10% markup = $111.50
      const result10 = extractBasePriceHistorical(11150, "2025-10-01");
      expect(result10.basePriceCents).toBe(10000);
    });

    it("handles invalid date by defaulting to current markup", () => {
      // Invalid date string should fall back to 7% (current markup)
      const result = extractBasePriceHistorical(10805, "invalid-date");
      expect(result.basePriceCents).toBe(10000); // Still uses round-dollar heuristics first
    });
  });

  describe("formatPrice", () => {
    it("formats price with dollar sign and two decimals", () => {
      expect(formatPrice(100)).toBe("$100.00");
      expect(formatPrice(99.5)).toBe("$99.50");
      expect(formatPrice(0)).toBe("$0.00");
    });
  });

  describe("isFreePrice", () => {
    it("returns true for zero cents", () => {
      expect(isFreePrice(0)).toBe(true);
    });

    it("returns false for non-zero cents", () => {
      expect(isFreePrice(1)).toBe(false);
      expect(isFreePrice(100)).toBe(false);
    });
  });

  describe("getOrderDisplayCents", () => {
    it("returns null for null/undefined order", () => {
      expect(getOrderDisplayCents(null)).toBeNull();
      expect(getOrderDisplayCents(undefined)).toBeNull();
    });

    it("returns total_cents for stripe orders (fees included — what user paid)", () => {
      const order = {
        total_cents: 11099,
        subtotal_cents: 10000,
        unit_price_cents: 10000,
        quantity: 1,
        payment_provider: "stripe",
        created_at: "2026-04-01",
      };
      expect(getOrderDisplayCents(order)).toBe(11099);
    });

    it("returns subtotal_cents for bank-transfer orders (no platform fee)", () => {
      const order = {
        total_cents: 10000,
        subtotal_cents: 10000,
        unit_price_cents: 10000,
        quantity: 1,
        payment_provider: "bank_transfer",
        created_at: "2026-04-01",
      };
      expect(getOrderDisplayCents(order)).toBe(10000);
    });

    it("falls back to unit_price_cents × quantity when subtotal is missing", () => {
      const order = {
        total_cents: 30000,
        unit_price_cents: 10000,
        quantity: 3,
        payment_provider: "bank_transfer",
        created_at: "2026-04-01",
      };
      expect(getOrderDisplayCents(order)).toBe(30000);
    });

    it("falls back to extractBasePriceHistorical for legacy bank-transfer rows with fees baked into total_cents", () => {
      const order = {
        total_cents: 10805,
        payment_provider: "bank_transfer",
        created_at: "2026-01-01",
      };
      const result = getOrderDisplayCents(order);
      expect(result).toBe(10000);
    });

    it("returns total_cents as-is for post-migration sparse bank-transfer rows (no phantom markup extraction)", () => {
      // Modern rows (created_at >= STRIPE_CONNECT_MIGRATION_DATE = 2026-01-15)
      // already store base price in total_cents. The migration-date guard inside
      // getBasePriceFromTicket prevents the legacy 1.0805 reverse-divide that
      // produced the $25 → $23.14 bug. See MAY_2026_FIXES.md #2.
      const order = {
        total_cents: 10805,
        payment_provider: "bank_transfer",
        created_at: "2026-06-01",
      };
      const result = getOrderDisplayCents(order);
      expect(result).toBe(10805);
    });

    it("does not throw on malformed created_at — falls through to total_cents (locks in defensive try/catch)", () => {
      // Regression test for the try/catch in MAY_2026_FIXES.md #2.1.
      // getBasePriceFromTicket throws on invalid date strings; the wrapper
      // must catch and fall through to total_cents rather than propagating.
      const order = {
        total_cents: 10805,
        payment_provider: "bank_transfer",
        created_at: "invalid-date",
      };
      expect(() => getOrderDisplayCents(order)).not.toThrow();
      expect(getOrderDisplayCents(order)).toBe(10805);
    });

    it("returns 0 for free bank-transfer orders", () => {
      const order = {
        total_cents: 0,
        subtotal_cents: 0,
        unit_price_cents: 0,
        quantity: 1,
        payment_provider: "bank_transfer",
        created_at: "2026-04-01",
      };
      expect(getOrderDisplayCents(order)).toBe(0);
    });

    it("treats orders without payment_provider as non-bank-transfer (returns total_cents)", () => {
      const order = {
        total_cents: 11099,
        subtotal_cents: 10000,
        created_at: "2026-04-01",
      };
      expect(getOrderDisplayCents(order)).toBe(11099);
    });
  });
});
