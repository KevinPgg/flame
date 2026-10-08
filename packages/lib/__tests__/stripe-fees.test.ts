import { describe, it, expect } from "vitest";
import {
  calculateFee,
  DEFAULT_PLATFORM_FEE_PERCENT,
  DEFAULT_FIXED_FEE_CENTS,
  DEFAULT_FIXED_FEE_BY_CURRENCY,
  getDefaultFixedFeeCents,
} from "../src";

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

  describe("input validation", () => {
    it("throws TypeError for non-numeric basePriceCents", () => {
      expect(() => calculateFee("100" as unknown as number)).toThrow(TypeError);
      expect(() => calculateFee(NaN)).toThrow(TypeError);
      expect(() => calculateFee(Infinity)).toThrow(TypeError);
    });

    it("throws RangeError for negative basePriceCents", () => {
      expect(() => calculateFee(-100)).toThrow(RangeError);
    });

    it("throws TypeError for non-numeric feePercent", () => {
      expect(() => calculateFee(100, "12.5" as unknown as number)).toThrow(
        TypeError
      );
    });

    it("throws RangeError for negative feePercent", () => {
      expect(() => calculateFee(100, -5)).toThrow(RangeError);
    });
  });
});

describe("getDefaultFixedFeeCents", () => {
  it("returns 99 for USD", () => {
    expect(getDefaultFixedFeeCents("USD")).toBe(99);
  });

  it("returns 99 for EUR", () => {
    expect(getDefaultFixedFeeCents("EUR")).toBe(99);
  });

  it("returns 75 for GBP", () => {
    expect(getDefaultFixedFeeCents("GBP")).toBe(75);
  });

  it("returns 1800 for MXN (~$0.99 USD)", () => {
    expect(getDefaultFixedFeeCents("MXN")).toBe(1800);
  });

  it("returns 6000 for DOP (~$0.99 USD)", () => {
    expect(getDefaultFixedFeeCents("DOP")).toBe(6000);
  });

  it("returns 420000 for COP (~$0.99 USD)", () => {
    expect(getDefaultFixedFeeCents("COP")).toBe(420000);
  });

  it("falls back to DEFAULT_FIXED_FEE_CENTS for unknown currencies", () => {
    expect(getDefaultFixedFeeCents("unknown")).toBe(DEFAULT_FIXED_FEE_CENTS);
    expect(getDefaultFixedFeeCents("XYZ")).toBe(99);
  });

  it("is case-insensitive", () => {
    expect(getDefaultFixedFeeCents("mxn")).toBe(1800);
    expect(getDefaultFixedFeeCents("Cop")).toBe(420000);
    expect(getDefaultFixedFeeCents("usd")).toBe(99);
  });
});
