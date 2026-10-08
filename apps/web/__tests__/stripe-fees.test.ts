import { describe, it, expect } from "vitest";
import { calculateFee, DEFAULT_PLATFORM_FEE_PERCENT, DEFAULT_FIXED_FEE_CENTS } from "../app/lib/stripe/fees";

describe("calculateFee", () => {
  describe("rounding edge cases", () => {
    it("rounds markup using Math.round for small values", () => {
      const result = calculateFee(1, 12.5, 0);

      expect(result.platformFeeCents).toBe(0);
      expect(result.totalAmountCents).toBe(1);
    });

    it("rounds half cents up", () => {
      const result = calculateFee(4, 12.5, 0);

      expect(result.platformFeeCents).toBe(1);
      expect(result.totalAmountCents).toBe(5);
    });
  });

  describe("edge cases", () => {
    it("handles zero base price", () => {
      const result = calculateFee(0, 12.5, 30);

      expect(result.platformFeeCents).toBe(30); // Only fixed fee
      expect(result.totalAmountCents).toBe(30);
    });

    it("handles large values without overflow", () => {
      // Test with $100,000 base price (10,000,000 cents)
      const result = calculateFee(10_000_000, 12.5, 30);

      expect(result.platformFeeCents).toBe(1_250_030); // 12.5% + $0.30
      expect(result.totalAmountCents).toBe(11_250_030);
    });

    it("uses default parameters when omitted", () => {
      const result = calculateFee(10000); // $100 base

      // Should use defaults: 10% + $0.99
      expect(result.platformFeeCents).toBe(1099); // $10.99
      expect(result.totalAmountCents).toBe(11099); // $110.99
    });

    it("handles zero percent fee", () => {
      const result = calculateFee(10000, 0, 30);

      expect(result.platformFeeCents).toBe(30); // Only fixed fee
      expect(result.totalAmountCents).toBe(10030);
    });

    it("handles zero fixed fee", () => {
      const result = calculateFee(10000, 12.5, 0);

      expect(result.platformFeeCents).toBe(1250); // Only percentage fee
      expect(result.totalAmountCents).toBe(11250);
    });
  });
});
