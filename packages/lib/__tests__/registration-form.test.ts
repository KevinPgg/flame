import { describe, it, expect } from "vitest";
import {
  isFieldVisibleForTier,
  filterFieldsForTier,
  getActiveEventFormFields,
} from "../src";
import type { FormField } from "../src";

const FIELDS: FormField[] = [
  { id: "fA", label: "Name", type: "text", required: true },
  { id: "fB", label: "Email", type: "email", required: true },
  { id: "fC", label: "Phone", type: "text" },
  { id: "fArchived", label: "Old", type: "text", archived: true },
];

describe("isFieldVisibleForTier", () => {
  it("archived field is never visible (regardless of tier setting)", () => {
    const archived = FIELDS[3];
    expect(isFieldVisibleForTier(archived, null)).toBe(false);
    expect(isFieldVisibleForTier(archived, undefined)).toBe(false);
    expect(isFieldVisibleForTier(archived, [])).toBe(false);
    expect(isFieldVisibleForTier(archived, ["fArchived"])).toBe(false);
  });

  it("null tier subset → all non-archived fields are visible", () => {
    expect(isFieldVisibleForTier(FIELDS[0], null)).toBe(true);
    expect(isFieldVisibleForTier(FIELDS[1], null)).toBe(true);
    expect(isFieldVisibleForTier(FIELDS[2], null)).toBe(true);
  });

  it("undefined tier subset → all non-archived fields are visible", () => {
    expect(isFieldVisibleForTier(FIELDS[0], undefined)).toBe(true);
  });

  it("empty array tier subset → NO fields are visible", () => {
    // LOAD-BEARING semantic: `[]` means "collect nothing", NOT "inherit all".
    // 0 production rows have `[]` today; documented in plan
    // per_tier_registration_form_a7c91f08.plan.md.
    expect(isFieldVisibleForTier(FIELDS[0], [])).toBe(false);
    expect(isFieldVisibleForTier(FIELDS[1], [])).toBe(false);
    expect(isFieldVisibleForTier(FIELDS[2], [])).toBe(false);
  });

  it("explicit subset → only listed (non-archived) fields are visible", () => {
    expect(isFieldVisibleForTier(FIELDS[0], ["fA"])).toBe(true);
    expect(isFieldVisibleForTier(FIELDS[1], ["fA"])).toBe(false);
    expect(isFieldVisibleForTier(FIELDS[2], ["fA", "fC"])).toBe(true);
  });

  it("archived field id present in tier subset is still hidden", () => {
    expect(
      isFieldVisibleForTier(FIELDS[3], ["fA", "fArchived"]),
    ).toBe(false);
  });
});

describe("filterFieldsForTier", () => {
  it("null/undefined fields list → empty array", () => {
    expect(filterFieldsForTier(null, null)).toEqual([]);
    expect(filterFieldsForTier(undefined, null)).toEqual([]);
  });

  it("null tier → returns all non-archived fields, preserving order", () => {
    const result = filterFieldsForTier(FIELDS, null);
    expect(result.map((f) => f.id)).toEqual(["fA", "fB", "fC"]);
  });

  it("empty tier subset → empty array (collect nothing)", () => {
    expect(filterFieldsForTier(FIELDS, [])).toEqual([]);
  });

  it("explicit subset → only listed non-archived fields, in field-list order", () => {
    expect(filterFieldsForTier(FIELDS, ["fC", "fA"]).map((f) => f.id)).toEqual([
      "fA",
      "fC",
    ]);
  });

  it("subset with unknown id → unknown ids are silently dropped", () => {
    // Plan section "Open questions" #2: helper filters from event field list,
    // so deleted/unknown ids on a tier are forward-compatible no-ops.
    expect(
      filterFieldsForTier(FIELDS, ["fA", "fGhost"]).map((f) => f.id),
    ).toEqual(["fA"]);
  });

  it("subset including an archived id → archived stays hidden", () => {
    expect(
      filterFieldsForTier(FIELDS, ["fA", "fArchived"]).map((f) => f.id),
    ).toEqual(["fA"]);
  });
});

describe("getActiveEventFormFields", () => {
  it("returns non-archived fields, preserving order", () => {
    const result = getActiveEventFormFields(FIELDS);
    expect(result.map((f) => f.id)).toEqual(["fA", "fB", "fC"]);
  });

  it("tolerates null / undefined / non-array config (jsonb defensive)", () => {
    expect(getActiveEventFormFields(null)).toEqual([]);
    expect(getActiveEventFormFields(undefined)).toEqual([]);
    expect(
      getActiveEventFormFields("not-an-array" as unknown as FormField[]),
    ).toEqual([]);
  });

  it("empty array → empty array", () => {
    expect(getActiveEventFormFields([])).toEqual([]);
  });

  it("all-archived input → empty array", () => {
    const allArchived: FormField[] = [
      { id: "x", label: "X", type: "text", archived: true },
      { id: "y", label: "Y", type: "text", archived: true },
    ];
    expect(getActiveEventFormFields(allArchived)).toEqual([]);
  });
});

import { validateRsvpGuests as vg } from "../src";
describe("validateRsvpGuests (3.4: answers per guest, compatible)", () => {
  const fields = [
    { id: "name", label: "Full name", type: "text" as const, required: true },
    { id: "ced", label: "Cédula", type: "number" as const, required: true },
    { id: "ig", label: "Instagram", type: "text" as const, required: false },
  ];
  it("not sent (older clients) → fine, nothing to add", () => {
    expect(vg(fields, { name: "A", ced: "1" }, 3)).toEqual({ guests: null, missing: [], error: null });
  });
  it("one block per extra guest; keeps only the form's fields; names what's missing", () => {
    const r = vg(fields, { name: "A", _guests: [{ name: "B", ced: "2", extra: "x" }, { name: "", ig: "@c" }] }, 3);
    expect(r.guests).toEqual([{ name: "B", ced: "2" }, { name: "", ig: "@c" }]);
    expect(r.missing).toEqual(["Guest 3: Full name", "Guest 3: Cédula"]);
    expect(r.error).toBeNull();
  });
  it("wrong count or not a list → error", () => {
    expect(vg(fields, { _guests: [{ name: "B", ced: "2" }] }, 3).error).toMatch(/don’t match/);
    expect(vg(fields, { _guests: "nope" }, 2).error).toMatch(/list/);
  });
});
