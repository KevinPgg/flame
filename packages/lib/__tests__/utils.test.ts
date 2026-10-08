import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatCurrency,
  formatCentsAsCurrency,
  utcToEcuadorLocal,
  ecuadorLocalToUtc,
  isTierAvailable,
  hasNotStartedTiers,
  findFirstAvailableStage,
  enrichTicketStagesWithWaterfall,
  generateSlug,
} from "../src";

describe("Format Utils", () => {
  describe("formatCurrency", () => {
    it("formats as USD currency", () => {
      expect(formatCurrency(100)).toBe("$100.00");
      expect(formatCurrency(99.5)).toBe("$99.50");
      expect(formatCurrency(0)).toBe("$0.00");
      expect(formatCurrency(1234.56)).toBe("$1,234.56");
    });
  });

  describe("formatCentsAsCurrency", () => {
    it("converts cents to dollars and formats", () => {
      expect(formatCentsAsCurrency(10000)).toBe("$100.00");
      expect(formatCentsAsCurrency(9950)).toBe("$99.50");
      expect(formatCentsAsCurrency(0)).toBe("$0.00");
    });
  });
});

describe("generateSlug", () => {
  it("generates slug from event name", () => {
    expect(generateSlug("Summer Music Festival 2025")).toBe("summer-music-festival-2025");
  });
  it("removes leading and trailing hyphens", () => {
    expect(generateSlug("  My Event  ")).toBe("my-event");
  });
  it("handles empty string", () => {
    expect(generateSlug("")).toBe("");
  });
  it("collapses multiple non-alphanumeric chars to single hyphen", () => {
    expect(generateSlug("Hello   World!!!")).toBe("hello-world");
  });
});

describe("Timezone Utils", () => {
  describe("utcToEcuadorLocal", () => {
    it("converts UTC to Ecuador local time", () => {
      // 10:00 UTC = 05:00 Ecuador (UTC-5)
      const result = utcToEcuadorLocal("2025-11-01T10:00:00Z");
      expect(result).toBe("2025-11-01T05:00");
    });

    it("handles empty string", () => {
      expect(utcToEcuadorLocal("")).toBe("");
    });

    it("handles invalid date string", () => {
      expect(utcToEcuadorLocal("invalid-date")).toBe("");
      expect(utcToEcuadorLocal("not-a-date")).toBe("");
    });
  });

  describe("ecuadorLocalToUtc", () => {
    it("converts Ecuador local time to UTC", () => {
      // 05:00 Ecuador = 10:00 UTC
      const result = ecuadorLocalToUtc("2025-11-01T05:00");
      expect(result).toBe("2025-11-01T10:00:00.000Z");
    });

    it("handles empty string", () => {
      expect(ecuadorLocalToUtc("")).toBe("");
    });

    it("handles invalid date string", () => {
      expect(ecuadorLocalToUtc("invalid-date")).toBe("");
    });
  });
});

describe("Availability Utils", () => {
  describe("isTierAvailable", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns true for available tier", () => {
      const tier = {
        quantity_total: 100,
        quantity_sold: 50,
        sales_start: "2025-06-01T00:00:00Z",
        sales_end: "2025-06-30T00:00:00Z",
      };

      expect(isTierAvailable(tier)).toBe(true);
    });

    it("returns false for sold out tier", () => {
      const tier = {
        quantity_total: 100,
        quantity_sold: 100,
      };

      expect(isTierAvailable(tier)).toBe(false);
    });

    it("returns false if sales haven't started", () => {
      const tier = {
        quantity_total: 100,
        quantity_sold: 0,
        sales_start: "2025-07-01T00:00:00Z", // Future date
      };

      expect(isTierAvailable(tier)).toBe(false);
    });

    it("returns false if sales have ended", () => {
      const tier = {
        quantity_total: 100,
        quantity_sold: 0,
        sales_end: "2025-06-01T00:00:00Z", // Past date
      };

      expect(isTierAvailable(tier)).toBe(false);
    });

    it("returns false if per_user_limit is 0", () => {
      const tier = {
        quantity_total: 100,
        quantity_sold: 0,
        per_user_limit: 0,
      };

      expect(isTierAvailable(tier)).toBe(false);
    });

    it("returns false when quantity_reserved fills remaining capacity", () => {
      // 9 sold + 1 reserved = 10 total claimed — exactly sold out
      const tier = {
        quantity_total: 10,
        quantity_sold: 9,
        quantity_reserved: 1,
      };

      expect(isTierAvailable(tier)).toBe(false);
    });

    it("returns false when quantity_reserved alone exhausts capacity", () => {
      // 0 sold + 10 reserved = 10 total claimed — sold out via holds/RSVPs only
      const tier = {
        quantity_total: 10,
        quantity_sold: 0,
        quantity_reserved: 10,
      };

      expect(isTierAvailable(tier)).toBe(false);
    });

    it("returns true when sold + reserved is still below total", () => {
      // 7 sold + 2 reserved = 9 claimed — 1 ticket still available
      const tier = {
        quantity_total: 10,
        quantity_sold: 7,
        quantity_reserved: 2,
      };

      expect(isTierAvailable(tier)).toBe(true);
    });

    it("treats missing quantity_reserved as zero", () => {
      // Without quantity_reserved field: falls back to zero — should behave like pre-fix
      const tier = {
        quantity_total: 10,
        quantity_sold: 5,
      };

      expect(isTierAvailable(tier)).toBe(true);
    });

    // W4-C1 (May 2026): organizer manual sold-out toggle.
    it("returns false when is_manually_sold_out=true even with capacity remaining", () => {
      const tier = {
        quantity_total: 100,
        quantity_sold: 0,
        is_manually_sold_out: true,
      };

      expect(isTierAvailable(tier)).toBe(false);
    });

    it("returns true when is_manually_sold_out=false (explicit) and capacity remains", () => {
      const tier = {
        quantity_total: 100,
        quantity_sold: 10,
        is_manually_sold_out: false,
      };

      expect(isTierAvailable(tier)).toBe(true);
    });

    it("treats missing is_manually_sold_out as false (back-compat)", () => {
      const tier = {
        quantity_total: 100,
        quantity_sold: 10,
      };

      expect(isTierAvailable(tier)).toBe(true);
    });

    it("manual sold-out wins over remaining capacity but not over 'not yet started' sales window", () => {
      // Sales-window check comes first so an unopened tier still reports
      // not-available — we don't want a tier marked manually sold-out to mask
      // the real "Not available yet" UI label downstream of this check.
      const tier = {
        quantity_total: 100,
        quantity_sold: 0,
        sales_start: "2025-12-01T00:00:00Z", // future
        is_manually_sold_out: true,
      };

      expect(isTierAvailable(tier)).toBe(false);
    });
  });

  describe("hasNotStartedTiers", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns true if any tier has future sales_start", () => {
      const tiers = [
        { quantity_total: 100, sales_start: "2025-06-01T00:00:00Z" },
        { quantity_total: 100, sales_start: "2025-07-01T00:00:00Z" }, // Future
      ];

      expect(hasNotStartedTiers(tiers)).toBe(true);
    });

    it("returns false if all tiers have started", () => {
      const tiers = [
        { quantity_total: 100, sales_start: "2025-06-01T00:00:00Z" },
        { quantity_total: 100, sales_start: "2025-06-10T00:00:00Z" },
      ];

      expect(hasNotStartedTiers(tiers)).toBe(false);
    });

    it("returns false for empty array", () => {
      expect(hasNotStartedTiers([])).toBe(false);
    });
  });

  describe("findFirstAvailableStage", () => {
    it("returns tier price_cents when no stages", () => {
      const tier = { price_cents: 2500, ticket_stages: undefined };
      expect(findFirstAvailableStage(tier)).toEqual({
        stageId: undefined,
        priceCents: 2500,
        stageName: undefined,
      });
    });

    it("returns first non-sold-out stage by order_index", () => {
      const tier = {
        price_cents: 1500,
        ticket_stages: [
          { id: "s1", name: "Early", price_cents: 1000, sold_quantity: 100, quantity: 100, order_index: 0 },
          { id: "s2", name: "Regular", price_cents: 2000, sold_quantity: 30, quantity: 100, order_index: 1 },
        ],
      };
      expect(findFirstAvailableStage(tier)).toEqual({
        stageId: "s2",
        priceCents: 2000,
        stageName: "Regular",
      });
    });

    it("returns last stage when all sold out", () => {
      const tier = {
        price_cents: 1000,
        ticket_stages: [
          { id: "s1", name: "Early", price_cents: 1000, sold_quantity: 50, quantity: 50, order_index: 0 },
          { id: "s2", name: "Regular", price_cents: 2000, sold_quantity: 100, quantity: 100, order_index: 1 },
        ],
      };
      expect(findFirstAvailableStage(tier)).toEqual({
        stageId: "s2",
        priceCents: 2000,
        stageName: "Regular",
      });
    });

    it("sorts by order_index when out of order", () => {
      const tier = {
        price_cents: 1000,
        ticket_stages: [
          { id: "s2", name: "Regular", price_cents: 2000, sold_quantity: 0, quantity: 100, order_index: 1 },
          { id: "s1", name: "Early", price_cents: 1000, sold_quantity: 0, quantity: 100, order_index: 0 },
        ],
      };
      expect(findFirstAvailableStage(tier)).toEqual({
        stageId: "s1",
        priceCents: 1000,
        stageName: "Early",
      });
    });

    it("returns tier price_cents when ticket_stages is empty array", () => {
      const tier = { price_cents: 3000, ticket_stages: [] };
      expect(findFirstAvailableStage(tier)).toEqual({
        stageId: undefined,
        priceCents: 3000,
        stageName: undefined,
      });
    });

    it("treats missing order_index as Infinity and selects correctly", () => {
      const tier = {
        price_cents: 1000,
        ticket_stages: [
          { id: "s1", name: "No Index", price_cents: 1500, sold_quantity: 50, quantity: 50, order_index: undefined },
          { id: "s2", name: "Indexed", price_cents: 2000, sold_quantity: 0, quantity: 100, order_index: 0 },
          { id: "s3", name: "Also No Index", price_cents: 2500, sold_quantity: 0, quantity: 100, order_index: undefined },
        ],
      };
      expect(findFirstAvailableStage(tier)).toEqual({
        stageId: "s2",
        priceCents: 2000,
        stageName: "Indexed",
      });
    });
  });

  // W4-C1 follow-up: stage-level waterfall must include active holds when
  // computing "sold out", not just `sold_quantity`. Mobile useEventDetails.ts
  // previously hardcoded `quantity_reserved: 0` on stage entries; once that
  // was fixed, the shared `enrichTicketStagesWithWaterfall` already handled
  // the math but had no regression coverage. These tests lock the contract.
  describe("enrichTicketStagesWithWaterfall — stage-level holds", () => {
    it("flips a stage to sold-out once sold + quantity_reserved >= capacity", () => {
      const tier = {
        id: "t1",
        price_cents: 2500,
        ticket_stages: [
          {
            id: "s1",
            name: "KORA I",
            price_cents: 2500,
            quantity: 25,
            sold_quantity: 24,
            quantity_reserved: 1, // 24 sold + 1 active hold = 25 (capacity)
            order_index: 0,
          },
          {
            id: "s2",
            name: "KORA II",
            price_cents: 3500,
            quantity: 25,
            sold_quantity: 0,
            quantity_reserved: 0,
            order_index: 1,
          },
        ],
      };
      const enriched = enrichTicketStagesWithWaterfall(tier);
      expect(enriched.ticket_stages?.[0]).toMatchObject({
        id: "s1",
        remaining: 0,
        is_available: false,
      });
      expect(enriched.ticket_stages?.[1]).toMatchObject({
        id: "s2",
        remaining: 25,
        is_available: true,
      });
    });

    it("keeps a stage available when sold + quantity_reserved < capacity", () => {
      const tier = {
        id: "t1",
        price_cents: 2500,
        ticket_stages: [
          {
            id: "s1",
            name: "KORA I",
            price_cents: 2500,
            quantity: 25,
            sold_quantity: 20,
            quantity_reserved: 2, // 20 + 2 = 22 < 25 → still available
            order_index: 0,
          },
        ],
      };
      const enriched = enrichTicketStagesWithWaterfall(tier);
      expect(enriched.ticket_stages?.[0]).toMatchObject({
        id: "s1",
        remaining: 3,
        is_available: true,
      });
    });
  });
});
