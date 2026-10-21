import { describe, it, expect } from "vitest";
import {
  activeEventFields,
  tierQuestions,
  reusableEventQuestions,
  tierEditorFromTier,
  newTierEditor,
  validateTierEditor,
  buildTierSave,
  canForceReduce,
  newStageDraft,
  newQuestionDraft,
  type EditorEvent,
  type EditorTier,
  type TierEditorState,
} from "../src";

const NOW = new Date("2026-11-01T17:00:00.000Z");
const ENDS = "2026-12-01T07:00:00.000Z"; // 1 Dec 02:00 Guayaquil

const FIELDS = [
  { id: "ig", label: "Instagram", type: "text" as const, required: true },
  { id: "mesa", label: "Mesa", type: "number" as const },
  { id: "old", label: "Old", type: "text" as const, archived: true },
];

const GENERAL: EditorTier = {
  id: "t1",
  name: "General",
  price_cents: 2550,
  quantity_total: 100,
  quantity_sold: 40,
  quantity_reserved: 5,
  per_user_limit: 4,
  sales_start: null,
  sales_end: ENDS,
  secret_code: null,
  description: null,
  is_hidden: false,
  is_manually_sold_out: false,
  registration_form_fields: null,
  ticket_stages: [],
};
const VIP: EditorTier = {
  id: "t2",
  name: "VIP",
  price_cents: 6000,
  quantity_total: 50,
  quantity_sold: 12,
  per_user_limit: 2,
  sales_start: "2026-11-05T15:00:00.000Z",
  sales_end: "2026-11-30T23:00:00.000Z",
  secret_code: "VIP",
  description: "Mesa",
  is_hidden: true,
  is_manually_sold_out: true,
  registration_form_fields: ["mesa"],
  ticket_stages: [
    { id: "s2", name: "Regular", price_cents: 7000, quantity: 30, sold_quantity: 0, order_index: 1, description: "Late" },
    { id: "s1", name: "Early", price_cents: 6000, quantity: 20, sold_quantity: 12, order_index: 0, description: null },
  ],
};
const EVENT: EditorEvent = {
  id: "ev1",
  ends_at: ENDS,
  timezone: "America/Guayaquil",
  requires_rsvp: true,
  registration_form_config: FIELDS,
  ticket_tiers: [GENERAL, VIP, { ...GENERAL, id: "t3", name: "Free", registration_form_fields: [] }],
};

const edit = (tier: EditorTier, change: (s: TierEditorState) => void = () => {}) => {
  const s = tierEditorFromTier(tier, EVENT);
  change(s);
  return s;
};

describe("reading a tier into the editor", () => {
  it("simple tier: prices as typed text, sales end equal to the event end shows as the default", () => {
    const { draft, soldOut } = tierEditorFromTier(GENERAL, EVENT);
    expect(draft).toMatchObject({ name: "General", price: "25.50", quantity: "100", perUserLimit: "4", salesStart: "", salesEnd: "", useStages: false, hidden: false });
    expect(soldOut).toBe(false);
  });

  it("staged tier: stages in order with ids, sold and descriptions kept; times in the event zone", () => {
    const { draft, soldOut } = tierEditorFromTier(VIP, EVENT);
    expect(draft.useStages).toBe(true);
    expect(draft.stages.map((s) => [s.id, s.name, s.price, s.quantity, s.sold, s.description])).toEqual([
      ["s1", "Early", "60", "20", 12, null],
      ["s2", "Regular", "70", "30", 0, "Late"],
    ]);
    expect(draft).toMatchObject({ salesStart: "2026-11-05T10:00", salesEnd: "2026-11-30T18:00", accessCode: "VIP", hidden: true });
    expect(soldOut).toBe(true);
  });

  it("questions: null = every active question; a list = those; archived never offered", () => {
    expect(activeEventFields(EVENT).map((f) => f.id)).toEqual(["ig", "mesa"]);
    expect(tierQuestions(GENERAL, EVENT).map((q) => q.fieldId)).toEqual(["ig", "mesa"]);
    expect(tierQuestions(VIP, EVENT).map((q) => q.fieldId)).toEqual(["mesa"]);
    const vip = tierEditorFromTier(VIP, EVENT).draft;
    expect(reusableEventQuestions(EVENT, vip).map((q) => q.label)).toEqual(["Instagram"]);
    expect(tierEditorFromTier(GENERAL, { ...EVENT, requires_rsvp: false }).draft.questions).toEqual([]);
  });
});

describe("validateTierEditor", () => {
  it("an untouched tier is valid", () => {
    expect(validateTierEditor(edit(GENERAL), EVENT, GENERAL, NOW)).toEqual({});
    expect(validateTierEditor(edit(VIP), EVENT, VIP, NOW)).toEqual({});
  });

  it("spots can't go below what's sold (tier and stage)", () => {
    const s = edit(GENERAL, (x) => (x.draft.quantity = "39"));
    expect(validateTierEditor(s, EVENT, GENERAL, NOW)["tiers.t1.quantity"]).toBe("quantityBelowSold");
    const v = edit(VIP, (x) => (x.draft.stages[0]!.quantity = "11"));
    expect(validateTierEditor(v, EVENT, VIP, NOW)["tiers.t2.stages.s1.quantity"]).toBe("quantityBelowSold");
  });

  it("a new question reusing an existing label must match it", () => {
    const same = newQuestionDraft({ label: "instagram", required: true });
    const clash = newQuestionDraft({ label: "Mesa", type: "text" });
    const s = edit(VIP, (x) => (x.draft.questions = [same, clash]));
    const e = validateTierEditor(s, EVENT, VIP, NOW);
    expect(e[`tiers.t2.questions.${same.key}.label`]).toBeUndefined();
    expect(e[`tiers.t2.questions.${clash.key}.label`]).toBe("questionConflict");
  });

  it("sales end after the event / before its start are refused", () => {
    const late = edit(GENERAL, (x) => (x.draft.salesEnd = "2026-12-01T03:00"));
    expect(validateTierEditor(late, EVENT, GENERAL, NOW)["tiers.t1.salesEnd"]).toBe("salesEndAfterEvent");
  });
});

describe("buildTierSave — PATCH sends only what changed", () => {
  it("nothing changed → nothing to send", () => {
    expect(buildTierSave(edit(GENERAL), EVENT, GENERAL)).toMatchObject({ method: "PATCH", body: { id: "t1" }, changed: false, pinTiers: [], eventConfig: null });
    expect(buildTierSave(edit(VIP), EVENT, VIP).changed).toBe(false);
  });

  it("name, price and sold-out only", () => {
    const s = edit(GENERAL, (x) => {
      x.draft.name = " General B ";
      x.draft.price = "30";
      x.soldOut = true;
    });
    expect(buildTierSave(s, EVENT, GENERAL).body).toEqual({ id: "t1", name: "General B", price_cents: 3000, is_manually_sold_out: true });
  });

  it("access code: showing a hidden tier drops its code; a legacy visible tier with a code loses it on save", () => {
    const unhide = edit(VIP, (x) => (x.draft.hidden = false));
    expect(buildTierSave(unhide, EVENT, VIP).body).toMatchObject({ is_hidden: false, secret_code: null });
    const legacy = { ...GENERAL, secret_code: "OLD" };
    const renamed = edit(legacy, (x) => (x.draft.name = "General B"));
    expect(buildTierSave(renamed, EVENT, legacy).body).toMatchObject({ name: "General B", secret_code: null });
  });

  it("spots change sends quantity_total (the API checks it against sold + reserved)", () => {
    const s = edit(GENERAL, (x) => (x.draft.quantity = "60"));
    const plan = buildTierSave(s, EVENT, GENERAL);
    expect(plan.body).toEqual({ id: "t1", quantity_total: 60 });
    expect(plan.quantityTotal).toBe(60);
  });

  it("stage edit: full stage list with ids, order and kept descriptions, plus the new total", () => {
    const s = edit(VIP, (x) => {
      x.draft.stages[1]!.quantity = "40";
      x.draft.stages.push({ ...newStageDraft("Door", "80", "10") });
    });
    expect(buildTierSave(s, EVENT, VIP).body).toEqual({
      id: "t2",
      quantity_total: 70,
      useStages: true,
      stages: [
        { id: "s1", name: "Early", price_cents: 6000, quantity: 20, order_index: 0, description: null },
        { id: "s2", name: "Regular", price_cents: 7000, quantity: 40, order_index: 1, description: "Late" },
        { name: "Door", price_cents: 8000, quantity: 10, order_index: 2, description: null },
      ],
    });
  });

  it("clearing the sales end means 'when the event ends'; dates compared to the minute", () => {
    const s = edit(VIP, (x) => (x.draft.salesEnd = ""));
    expect(buildTierSave(s, EVENT, VIP).body).toEqual({ id: "t2", sales_end: ENDS });
    const withSeconds = { ...VIP, sales_start: "2026-11-05T15:00:31.000Z" };
    expect(buildTierSave(tierEditorFromTier(withSeconds, EVENT), EVENT, withSeconds).changed).toBe(false);
  });

  it("questions: picking a different set sends the explicit list", () => {
    const s = edit(GENERAL, (x) => (x.draft.questions = x.draft.questions.filter((q) => q.fieldId === "ig")));
    expect(buildTierSave(s, EVENT, GENERAL).body).toEqual({ id: "t1", registration_form_fields: ["ig"] });
  });

  it("a brand-new question: appended to the event config, other 'all questions' tiers pinned first", () => {
    const s = edit(VIP, (x) => x.draft.questions.push(newQuestionDraft({ label: " Cédula ", type: "number", placeholder: " 10 dígitos " })));
    const plan = buildTierSave(s, EVENT, VIP, () => "new1");
    expect(plan.newFields).toEqual([{ id: "new1", label: "Cédula", type: "number", required: true, placeholder: "10 dígitos" }]);
    expect(plan.eventConfig).toEqual([...FIELDS, plan.newFields[0]]);
    expect(plan.pinTiers).toEqual([{ id: "t1", registration_form_fields: ["ig", "mesa"] }]);
    expect(plan.body).toEqual({ id: "t2", registration_form_fields: ["mesa", "new1"] });
  });

  it("typing an existing question's label reuses it instead of duplicating", () => {
    const s = edit(VIP, (x) => x.draft.questions.push(newQuestionDraft({ label: "instagram", required: true })));
    const plan = buildTierSave(s, EVENT, VIP);
    expect(plan.newFields).toEqual([]);
    expect(plan.body).toEqual({ id: "t2", registration_form_fields: ["mesa", "ig"] });
  });
});

describe("buildTierSave — POST for a new tier", () => {
  it("simple tier with defaults", () => {
    const s = newTierEditor("Tier 4");
    Object.assign(s.draft, { price: "0", quantity: "30" });
    const plan = buildTierSave(s, EVENT, null);
    expect(plan.method).toBe("POST");
    expect(plan.body).toEqual({
      event_id: "ev1",
      name: "Tier 4",
      per_user_limit: 10,
      sales_start: null,
      sales_end: ENDS,
      secret_code: null,
      description: null,
      is_hidden: false,
      is_manually_sold_out: false,
      quantity_total: 30,
      price_cents: 0,
      useStages: false,
      registration_form_fields: [],
    });
    expect(plan.pinTiers).toEqual([]);
  });

  it("staged new tier: price from the first stage, order_index on every stage", () => {
    const s = newTierEditor("Promo");
    s.draft.useStages = true;
    s.draft.stages = [newStageDraft("A", "10", "5"), newStageDraft("B", "15", "5")];
    const body = buildTierSave(s, { ...EVENT, requires_rsvp: false }, null).body;
    expect(body).toMatchObject({ price_cents: 1000, quantity_total: 10, useStages: true });
    expect(body.stages).toEqual([
      { name: "A", price_cents: 1000, quantity: 5, order_index: 0, description: null },
      { name: "B", price_cents: 1500, quantity: 5, order_index: 1, description: null },
    ]);
    expect("registration_form_fields" in body).toBe(false);
  });
});

describe("canForceReduce", () => {
  it("only existing simple tiers", () => {
    expect(canForceReduce(edit(GENERAL), GENERAL)).toBe(true);
    expect(canForceReduce(edit(VIP), VIP)).toBe(false);
    expect(canForceReduce(newTierEditor("x"), null)).toBe(false);
  });
});
