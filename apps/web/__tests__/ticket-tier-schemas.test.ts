import { describe, it, expect } from "vitest";
import {
  createTierSchema,
  updateTierSchema,
} from "../app/api/ticket-tiers/schemas";

const baseCreateInput = {
  event_id: "00000000-0000-4000-8000-000000000000",
  name: "GA",
  price_cents: 1000,
  quantity_total: 100,
  per_user_limit: 5,
  sales_end: "2099-01-01T00:00:00.000Z",
};

const baseUpdateInput = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "GA renamed",
};

describe("createTierSchema – registration_form_fields", () => {
  it("accepts when omitted", () => {
    const r = createTierSchema.safeParse(baseCreateInput);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.registration_form_fields).toBeUndefined();
  });

  it("accepts explicit null", () => {
    const r = createTierSchema.safeParse({
      ...baseCreateInput,
      registration_form_fields: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.registration_form_fields).toBeNull();
  });

  it("accepts empty array (load-bearing 'collect nothing' case)", () => {
    const r = createTierSchema.safeParse({
      ...baseCreateInput,
      registration_form_fields: [],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.registration_form_fields).toEqual([]);
  });

  it("accepts populated array", () => {
    const r = createTierSchema.safeParse({
      ...baseCreateInput,
      registration_form_fields: ["a", "b"],
    });
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.registration_form_fields).toEqual(["a", "b"]);
  });

  it("rejects array exceeding 50 entries (DoS guard)", () => {
    const r = createTierSchema.safeParse({
      ...baseCreateInput,
      registration_form_fields: Array.from({ length: 51 }, (_, i) => `f${i}`),
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-string entries", () => {
    const r = createTierSchema.safeParse({
      ...baseCreateInput,
      registration_form_fields: [123],
    });
    expect(r.success).toBe(false);
  });
});

describe("updateTierSchema – registration_form_fields", () => {
  it("accepts when omitted", () => {
    const r = updateTierSchema.safeParse(baseUpdateInput);
    expect(r.success).toBe(true);
  });

  it("accepts null/[]/populated/undefined", () => {
    for (const value of [null, [], ["a"]]) {
      const r = updateTierSchema.safeParse({
        ...baseUpdateInput,
        registration_form_fields: value,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejects array > 50", () => {
    const r = updateTierSchema.safeParse({
      ...baseUpdateInput,
      registration_form_fields: Array.from({ length: 51 }, (_, i) => `f${i}`),
    });
    expect(r.success).toBe(false);
  });
});
