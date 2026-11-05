import { describe, it, expect } from "vitest";
import {
  sanitizeAccessCodeInput,
  validateAccessCode,
  normalizeTicketTierSecretCode,
  normalizeOptionalTicketTierSecretCode,
  validateCedula,
  formatCedula,
  cleanCedula,
  validateAndParseQuantity,
  validateQRCodeFormat,
  parseMetadataCents,
  isPresentMetadataValue,
} from "../src";

describe("Access Code Validator", () => {
  describe("sanitizeAccessCodeInput", () => {
    it("uppercases and removes non-alphanumeric", () => {
      expect(sanitizeAccessCodeInput("abc123")).toBe("ABC123");
      expect(sanitizeAccessCodeInput("a-b_c")).toBe("ABC");
    });

    it("truncates to 8 characters", () => {
      expect(sanitizeAccessCodeInput("ABCD1234").length).toBe(8);
      expect(sanitizeAccessCodeInput("ABCD12345")).toBe("ABCD1234");
    });
  });

  describe("validateAccessCode", () => {
    it("accepts empty string", () => {
      expect(validateAccessCode("")).toEqual({ valid: true });
      expect(validateAccessCode("   ")).toEqual({ valid: true });
    });

    it("accepts valid 4-8 char codes", () => {
      expect(validateAccessCode("ABC1")).toEqual({ valid: true });
      expect(validateAccessCode("ABCD1234")).toEqual({ valid: true });
    });

    it("rejects too short", () => {
      const r = validateAccessCode("AB1");
      expect(r.valid).toBe(false);
      expect(r.error).toContain("at least 4");
    });

    it("rejects invalid format (e.g. too long after stripping)", () => {
      const r = validateAccessCode("ABCD-123-45");
      expect(r.valid).toBe(false);
      expect(r.error).toContain("4-8 uppercase");
    });

    it("rejects over 8 chars", () => {
      const r = validateAccessCode("ABCD12345");
      expect(r.valid).toBe(false);
    });
  });
});

describe("Ticket tier secret code", () => {
  it("normalizeTicketTierSecretCode trims and uppercases", () => {
    expect(normalizeTicketTierSecretCode("  vip99  ")).toBe("VIP99");
  });

  it("normalizeOptionalTicketTierSecretCode returns null for blank", () => {
    expect(normalizeOptionalTicketTierSecretCode("")).toBeNull();
    expect(normalizeOptionalTicketTierSecretCode("  ")).toBeNull();
    expect(normalizeOptionalTicketTierSecretCode(null)).toBeNull();
    expect(normalizeOptionalTicketTierSecretCode(undefined)).toBeNull();
  });

  it("normalizeOptionalTicketTierSecretCode returns uppercase when present", () => {
    expect(normalizeOptionalTicketTierSecretCode("early")).toBe("EARLY");
  });
});

describe("Cedula Validator", () => {
  describe("validateCedula", () => {
    it("validates a correct cedula", () => {
      // Using a valid test cedula
      const result = validateCedula("1710034065");
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects cedula with wrong length", () => {
      const result = validateCedula("123456789");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("10 digits");
    });

    it("rejects cedula with invalid province code", () => {
      const result = validateCedula("2510034065"); // Province 25 doesn't exist
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("province");
    });

    it("rejects cedula with invalid third digit", () => {
      const result = validateCedula("1760034065"); // Third digit > 5
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("third digit");
    });

    it("rejects cedula with invalid check digit", () => {
      const result = validateCedula("1710034066"); // Wrong check digit
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("check digit");
    });

    it("handles cedula with dashes", () => {
      const result = validateCedula("171-0034-065");
      expect(result.isValid).toBe(true);
    });
  });

  describe("formatCedula", () => {
    it("formats a valid cedula", () => {
      expect(formatCedula("1710034065")).toBe("171-0034-065");
    });

    it("returns original for invalid length", () => {
      expect(formatCedula("12345")).toBe("12345");
    });

    it("returns null for null input", () => {
      expect(formatCedula(null)).toBeNull();
    });
  });

  describe("cleanCedula", () => {
    it("removes non-digits", () => {
      expect(cleanCedula("171-0034-065")).toBe("1710034065");
      expect(cleanCedula("17.1.0034065")).toBe("1710034065");
    });
  });
});

describe("Quantity Validator", () => {
  describe("validateAndParseQuantity", () => {
    it("accepts valid positive integers", () => {
      expect(validateAndParseQuantity(1)).toEqual({ valid: true, parsed: 1 });
      expect(validateAndParseQuantity(100)).toEqual({
        valid: true,
        parsed: 100,
      });
    });

    it("accepts valid string integers", () => {
      expect(validateAndParseQuantity("5")).toEqual({ valid: true, parsed: 5 });
    });

    it("rejects null/undefined", () => {
      expect(validateAndParseQuantity(null).valid).toBe(false);
      expect(validateAndParseQuantity(undefined).valid).toBe(false);
    });

    it("rejects zero and negative numbers", () => {
      expect(validateAndParseQuantity(0).valid).toBe(false);
      expect(validateAndParseQuantity(-1).valid).toBe(false);
    });

    it("rejects decimals", () => {
      expect(validateAndParseQuantity(2.5).valid).toBe(false);
      expect(validateAndParseQuantity("2.5").valid).toBe(false);
    });

    it("rejects strings with non-numeric characters", () => {
      expect(validateAndParseQuantity("5 tickets").valid).toBe(false);
      expect(validateAndParseQuantity("abc").valid).toBe(false);
    });
  });
});

describe("QR Code Validator", () => {
  describe("validateQRCodeFormat", () => {
    it("validates a correct QR code", () => {
      const validQR = {
        orderId: "order-123",
        eventId: "event-456",
        ticketNumber: 1,
        qrToken: "token-abc",
        timestamp: "2025-11-01T10:00:00Z",
      };

      const result = validateQRCodeFormat(validQR);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects null input", () => {
      const result = validateQRCodeFormat(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid QR data: expected object");
    });

    it("rejects undefined input", () => {
      const result = validateQRCodeFormat(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid QR data: expected object");
    });

    it("rejects primitive values", () => {
      expect(validateQRCodeFormat("string").valid).toBe(false);
      expect(validateQRCodeFormat(123).valid).toBe(false);
      expect(validateQRCodeFormat(true).valid).toBe(false);
    });

    it("reports missing required fields", () => {
      const result = validateQRCodeFormat({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing orderId");
      expect(result.errors).toContain("Missing eventId");
      expect(result.errors).toContain("Missing ticketNumber");
      expect(result.errors).toContain("Missing qrToken");
      expect(result.errors).toContain("Missing timestamp");
    });

    it("validates timestamp format", () => {
      const invalidTimestamp = {
        orderId: "order-123",
        eventId: "event-456",
        ticketNumber: 1,
        qrToken: "token-abc",
        timestamp: "not-a-date",
      };

      const result = validateQRCodeFormat(invalidTimestamp);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "timestamp must be a valid ISO-8601 date string"
      );
    });

    it("rejects non-string timestamp", () => {
      const nonStringTimestamp = {
        orderId: "order-123",
        eventId: "event-456",
        ticketNumber: 1,
        qrToken: "token-abc",
        timestamp: 12345,
      };

      const result = validateQRCodeFormat(nonStringTimestamp);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("timestamp must be a string");
    });

    it("rejects PLACEHOLDER orderId", () => {
      const placeholderQR = {
        orderId: "PLACEHOLDER",
        eventId: "event-456",
        ticketNumber: 1,
        qrToken: "token-abc",
        timestamp: "2025-11-01T10:00:00Z",
      };

      const result = validateQRCodeFormat(placeholderQR);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "orderId should not be 'PLACEHOLDER' in final QR code"
      );
    });

    it("rejects invalid ticketNumber", () => {
      const invalidTicketNumber = {
        orderId: "order-123",
        eventId: "event-456",
        ticketNumber: 0,
        qrToken: "token-abc",
        timestamp: "2025-11-01T10:00:00Z",
      };

      const result = validateQRCodeFormat(invalidTicketNumber);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("ticketNumber should be >= 1");
    });

    it("rejects old format fields", () => {
      const oldFormatQR = {
        orderId: "order-123",
        eventId: "event-456",
        ticketNumber: 1,
        qrToken: "token-abc",
        timestamp: "2025-11-01T10:00:00Z",
        ticket_id: "old-field",
      };

      const result = validateQRCodeFormat(oldFormatQR);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Found old format field: ticket_id (should not be present)"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Stripe metadata cents parsing (W7-H6)
// ---------------------------------------------------------------------------
describe("parseMetadataCents", () => {
  it("accepts plain non-negative integer strings", () => {
    expect(parseMetadataCents("3000")).toBe(3000);
    expect(parseMetadataCents("0")).toBe(0);
    expect(parseMetadataCents("1")).toBe(1);
  });

  it("rejects trailing garbage that parseInt would silently accept", () => {
    // parseInt("100abc") === 100 — the bug this validator exists to prevent.
    expect(parseMetadataCents("100abc")).toBeNull();
    expect(parseMetadataCents("3000 ")).toBeNull();
    expect(parseMetadataCents("  3000")).toBeNull();
  });

  it("rejects decimals, signs and exponent notation", () => {
    // parseInt("12.9") === 12 — a real price silently truncated.
    expect(parseMetadataCents("12.9")).toBeNull();
    expect(parseMetadataCents("-5")).toBeNull();
    expect(parseMetadataCents("+5")).toBeNull();
    expect(parseMetadataCents("3e3")).toBeNull();
  });

  it("rejects values beyond safe-integer range", () => {
    // Number.isFinite would pass this; integer arithmetic would lose precision.
    expect(parseMetadataCents("999999999999999999999")).toBeNull();
  });

  it("rejects empty, whitespace and absent values", () => {
    expect(parseMetadataCents("")).toBeNull();
    expect(parseMetadataCents(" ")).toBeNull();
    expect(parseMetadataCents(undefined)).toBeNull();
    expect(parseMetadataCents(null)).toBeNull();
  });
});

describe("isPresentMetadataValue", () => {
  it("distinguishes an absent key from a present but invalid one", () => {
    // The distinction that matters: absent => legacy fallback is fine;
    // present-but-invalid => corrupt money data, must be surfaced.
    expect(isPresentMetadataValue(undefined)).toBe(false);
    expect(isPresentMetadataValue(null)).toBe(false);
    expect(isPresentMetadataValue("")).toBe(true);
    expect(isPresentMetadataValue("100abc")).toBe(true);
    expect(isPresentMetadataValue("3000")).toBe(true);
  });
});
