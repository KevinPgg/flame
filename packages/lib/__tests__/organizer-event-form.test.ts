import { describe, it, expect } from "vitest";
import {
  tierSecretCode,
  slugify,
  parsePriceInput,
  parseIntInput,
  emptyEventForm,
  newTierDraft,
  newStageDraft,
  newQuestionDraft,
  reusableQuestions,
  copyQuestion,
  moveItem,
  suggestEnd,
  defaultStages,
  tierTotalQuantity,
  tierStartingPriceCents,
  validateEventForm,
  firstErrorPath,
  buildCreateEventPayload,
  MAX_TICKET_TIERS_PER_EVENT,
  type EventFormState,
  type TierDraft,
} from "../src";

// 2026-11-01 12:00 in Guayaquil (UTC-5) = 17:00Z
const NOW = new Date("2026-11-01T17:00:00.000Z");

function tier(over: Partial<TierDraft> = {}): TierDraft {
  return { ...newTierDraft("General"), price: "25", quantity: "100", ...over };
}

function validForm(over: Partial<EventFormState> = {}): EventFormState {
  return {
    ...emptyEventForm(),
    name: "Fiesta de Año Nuevo",
    slug: "fiesta-de-ano-nuevo",
    venue: "Club Bahía",
    city: "Guayaquil",
    startsAt: "2026-12-31T21:00",
    endsAt: "2027-01-01T04:00",
    tiers: [tier()],
    ...over,
  };
}

describe("slugify", () => {
  it("strips accents, symbols and edges", () => {
    expect(slugify("  Fiesta de Año Nuevo 2027! ")).toBe("fiesta-de-ano-nuevo-2027");
    expect(slugify("Ñandú & Café — Última")).toBe("nandu-cafe-ultima");
    expect(slugify("---")).toBe("");
  });
  it("caps at 100 chars without a trailing dash", () => {
    const s = slugify("a".repeat(99) + " bbbb");
    expect(s.length).toBeLessThanOrEqual(100);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("parsePriceInput / parseIntInput", () => {
  it("accepts free, decimals and comma decimals", () => {
    expect(parsePriceInput("0")).toBe(0);
    expect(parsePriceInput("25")).toBe(2500);
    expect(parsePriceInput("25,5")).toBe(2550);
    expect(parsePriceInput(" 19.99 ")).toBe(1999);
  });
  it("rejects garbage, negatives, thousands separators and 3 decimals", () => {
    for (const bad of ["", "abc", "-5", "10.000", "1,000.00", "2.999"]) expect(parsePriceInput(bad)).toBeNull();
  });
  it("ints are whole and non-negative", () => {
    expect(parseIntInput("12")).toBe(12);
    for (const bad of ["", "1.5", "-1", "1e3"]) expect(parseIntInput(bad)).toBeNull();
  });
});

describe("stages helpers", () => {
  it("defaultStages keeps price and splits quantity", () => {
    const st = defaultStages(tier({ price: "30", quantity: "101" }), { first: "Early Bird", second: "Regular" });
    expect(st.map((s) => [s.name, s.price, s.quantity])).toEqual([
      ["Early Bird", "30", "50"],
      ["Regular", "30", "51"],
    ]);
  });
  it("defaultStages leaves quantities empty when there is nothing to split", () => {
    const st = defaultStages(tier({ quantity: "" }), { first: "A", second: "B" });
    expect(st.map((s) => s.quantity)).toEqual(["", ""]);
  });
  it("total and starting price follow stages when enabled", () => {
    const t = tier({ useStages: true, stages: [newStageDraft("A", "10", "20"), newStageDraft("B", "15", "30")] });
    expect(tierTotalQuantity(t)).toBe(50);
    expect(tierStartingPriceCents(t)).toBe(1000);
    expect(tierTotalQuantity({ ...t, stages: [newStageDraft("A", "10", "x")] })).toBeNull();
    expect(tierTotalQuantity(tier())).toBe(100);
  });
});

describe("validateEventForm", () => {
  it("a complete form has no errors", () => {
    expect(validateEventForm(validForm(), NOW)).toEqual({});
  });

  it("requires the basics", () => {
    const e = validateEventForm({ ...emptyEventForm(), tiers: [] }, NOW);
    expect(e).toMatchObject({
      name: "nameRequired",
      slug: "slugRequired",
      venue: "venueRequired",
      city: "cityRequired",
      startsAt: "startRequired",
      endsAt: "endRequired",
      tiers: "tiersRequired",
    });
  });

  it("mirrors the server: start ≥ now + 2h (event timezone), end after start", () => {
    // 13:59 local = 18:59Z → < 19:00Z
    expect(validateEventForm(validForm({ startsAt: "2026-11-01T13:59" }), NOW).startsAt).toBe("startTooSoon");
    expect(validateEventForm(validForm({ startsAt: "2026-11-01T14:00", endsAt: "2026-11-01T20:00" }), NOW).startsAt).toBeUndefined();
    expect(validateEventForm(validForm({ endsAt: "2026-12-31T21:00" }), NOW).endsAt).toBe("endBeforeStart");
  });

  it("start lead time depends on the event timezone", () => {
    // 14:30 in Madrid (UTC+1) = 13:30Z → already past
    const f = validForm({ timezone: "Europe/Madrid", startsAt: "2026-11-01T14:30", endsAt: "2026-11-01T23:00" });
    expect(validateEventForm(f, NOW).startsAt).toBe("startTooSoon");
  });

  it("slug must match the API regex and description ≤ 520", () => {
    const e = validateEventForm(validForm({ slug: "Con Espacios", description: "x".repeat(521) }), NOW);
    expect(e.slug).toBe("slugInvalid");
    expect(e.description).toBe("descriptionTooLong");
  });

  it("caps tiers at the per-event maximum", () => {
    const tiers = Array.from({ length: MAX_TICKET_TIERS_PER_EVENT + 1 }, () => tier());
    expect(validateEventForm(validForm({ tiers }), NOW).tiers).toBe("tiersTooMany");
  });

  it("flags tier fields by tier key", () => {
    const t = tier({ name: "", price: "abc", quantity: "0", perUserLimit: "51", hidden: true, accessCode: " ab ", description: "d".repeat(121) });
    const e = validateEventForm(validForm({ tiers: [t] }), NOW);
    const p = `tiers.${t.key}.`;
    expect(e[p + "name"]).toBe("tierNameRequired");
    expect(e[p + "price"]).toBe("priceInvalid");
    expect(e[p + "quantity"]).toBe("quantityInvalid");
    expect(e[p + "perUserLimit"]).toBe("perUserLimitInvalid");
    expect(e[p + "accessCode"]).toBe("accessCodeTooShort");
    expect(e[p + "description"]).toBe("tierDescriptionTooLong");
  });

  it("access code only counts on hidden tiers: not validated and not saved on visible ones", () => {
    const visible = tier({ hidden: false, accessCode: "ab" });
    expect(validateEventForm(validForm({ tiers: [visible] }), NOW)).toEqual({});
    expect(tierSecretCode(visible)).toBeNull();
    expect(tierSecretCode(tier({ hidden: true, accessCode: " vip " }))).toBe("VIP");
    expect(tierSecretCode(tier({ hidden: true, accessCode: "  " }))).toBeNull();
  });

  it("free tiers are valid, $10k+ is a typo guard, blank access code is fine", () => {
    expect(validateEventForm(validForm({ tiers: [tier({ price: "0", accessCode: "  " })] }), NOW)).toEqual({});
    const t = tier({ price: "10000.01" });
    expect(validateEventForm(validForm({ tiers: [t] }), NOW)[`tiers.${t.key}.price`]).toBe("priceTooHigh");
  });

  it("sales window: end defaults to event end; must be after start and not after the event", () => {
    const late = tier({ salesEnd: "2027-01-01T05:00" });
    expect(validateEventForm(validForm({ tiers: [late] }), NOW)[`tiers.${late.key}.salesEnd`]).toBe("salesEndAfterEvent");
    const inverted = tier({ salesStart: "2026-12-20T10:00", salesEnd: "2026-12-10T10:00" });
    expect(validateEventForm(validForm({ tiers: [inverted] }), NOW)[`tiers.${inverted.key}.salesEnd`]).toBe("salesEndBeforeStart");
    const past = tier({ salesEnd: "2026-10-01T10:00" }); // no start → now
    expect(validateEventForm(validForm({ tiers: [past] }), NOW)[`tiers.${past.key}.salesEnd`]).toBe("salesEndBeforeStart");
    expect(validateEventForm(validForm({ tiers: [tier({ salesEnd: "2027-01-01T04:00" })] }), NOW)).toEqual({});
  });

  it("stages: at least two, unique names, valid price/qty; tier price/qty ignored", () => {
    const one = tier({ price: "", quantity: "", useStages: true, stages: [newStageDraft("A", "10", "5")] });
    expect(validateEventForm(validForm({ tiers: [one] }), NOW)).toEqual({ [`tiers.${one.key}.stages`]: "stagesMin" });

    const s1 = newStageDraft("Early", "10", "5");
    const s2 = newStageDraft(" early ", "-1", "");
    const dup = tier({ useStages: true, stages: [s1, s2] });
    const e = validateEventForm(validForm({ tiers: [dup] }), NOW);
    const sp = `tiers.${dup.key}.stages.${s2.key}.`;
    expect(e[sp + "name"]).toBe("stageNameDuplicate");
    expect(e[sp + "price"]).toBe("priceInvalid");
    expect(e[sp + "quantity"]).toBe("quantityRequired");
  });

  it("questions: label required and unique per tier; same label across tiers must match", () => {
    const a = newQuestionDraft({ label: "Instagram" });
    const dup = newQuestionDraft({ label: " instagram " });
    const empty = newQuestionDraft();
    const t1 = tier({ questions: [a, dup, empty] });
    const same = copyQuestion(a);
    const clash = newQuestionDraft({ label: "INSTAGRAM", type: "number" });
    const t2 = tier({ questions: [same] });
    const t3 = tier({ questions: [clash] });
    const e = validateEventForm(validForm({ tiers: [t1, t2, t3] }), NOW);
    const k = (t: TierDraft, q: { key: string }) => `tiers.${t.key}.questions.${q.key}.label`;
    expect(e[k(t1, a)]).toBeUndefined();
    expect(e[k(t1, dup)]).toBe("questionDuplicate");
    expect(e[k(t1, empty)]).toBe("questionLabelRequired");
    expect(e[k(t2, same)]).toBeUndefined();
    expect(e[k(t3, clash)]).toBe("questionConflict");
  });

  it("questions are ignored when the event has no RSVP", () => {
    const t = tier({ questions: [newQuestionDraft()] });
    expect(validateEventForm(validForm({ requiresRsvp: false, tiers: [t] }), NOW)).toEqual({});
  });
});

describe("question helpers", () => {
  it("reusableQuestions offers earlier tiers' questions this tier lacks, once", () => {
    const ig = newQuestionDraft({ label: "Instagram" });
    const id = newQuestionDraft({ label: "Cédula", type: "number" });
    const t1 = tier({ questions: [ig, id, newQuestionDraft()] });
    const t2 = tier({ questions: [copyQuestion(ig)] });
    const t3 = tier({ questions: [newQuestionDraft({ label: "cédula" })] });
    expect(reusableQuestions([t1, t2, t3], 0)).toEqual([]);
    expect(reusableQuestions([t1, t2, t3], 1).map((q) => q.label)).toEqual(["Cédula"]);
    expect(reusableQuestions([t1, t2, t3], 2).map((q) => q.label)).toEqual(["Instagram"]);
  });

  it("copyQuestion keeps settings with a new key", () => {
    const q = newQuestionDraft({ label: "Mesa", type: "number", required: false, placeholder: "1-20" });
    const c = copyQuestion(q);
    expect(c.key).not.toBe(q.key);
    expect({ ...c, key: q.key }).toEqual(q);
  });

  it("moveItem swaps neighbours and ignores out-of-range moves", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    const l = ["a", "b"];
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, 1, 1)).toBe(l);
  });

  it("suggestEnd adds 5 hours across midnight / month / year", () => {
    expect(suggestEnd("2026-12-31T21:00")).toBe("2027-01-01T02:00");
    expect(suggestEnd("2026-11-14T10:30", 2)).toBe("2026-11-14T12:30");
    expect(suggestEnd("")).toBe("");
  });
});

describe("firstErrorPath", () => {
  it("follows the visual order of the form", () => {
    const t = tier({ price: "" });
    const f = validForm({ name: "", tiers: [t] });
    expect(firstErrorPath(f, validateEventForm(f, NOW))).toBe("name");
    const g = validForm({ tiers: [t] });
    expect(firstErrorPath(g, validateEventForm(g, NOW))).toBe(`tiers.${t.key}.price`);
    expect(firstErrorPath(g, {})).toBeNull();
  });
});

describe("buildCreateEventPayload", () => {
  it("converts local times in the event timezone and defaults the sales window", () => {
    const p = buildCreateEventPayload(validForm({ description: "  " }), "org-1");
    expect(p.event).toEqual({
      organization_id: "org-1",
      name: "Fiesta de Año Nuevo",
      slug: "fiesta-de-ano-nuevo",
      city: "Guayaquil",
      venue: "Club Bahía",
      starts_at: "2027-01-01T02:00:00.000Z",
      ends_at: "2027-01-01T09:00:00.000Z",
      status: "published",
      requires_rsvp: true,
      currency: "USD",
      timezone: "America/Guayaquil",
    });
    expect(p.ticket_tiers[0]).toEqual({
      name: "General",
      price_cents: 2500,
      quantity_total: 100,
      per_user_limit: 10,
      sales_start: null,
      sales_end: "2027-01-01T09:00:00.000Z",
      secret_code: null,
      useStages: false,
      is_hidden: false,
      description: null,
    });
  });

  it("staged tier: price = first stage, total = sum of stages (server requires equality)", () => {
    const t = tier({
      price: "999",
      quantity: "1",
      useStages: true,
      stages: [newStageDraft(" Early ", "15", "40"), newStageDraft("Regular", "20,50", "60")],
      accessCode: " vip ",
      hidden: true,
      salesStart: "2026-12-01T10:00",
      description: " Mesa cerca de la tarima ",
    });
    const out = buildCreateEventPayload(validForm({ tiers: [t] }), "org-1").ticket_tiers[0];
    expect(out).toMatchObject({
      price_cents: 1500,
      quantity_total: 100,
      useStages: true,
      stages: [
        { name: "Early", price_cents: 1500, quantity: 40 },
        { name: "Regular", price_cents: 2050, quantity: 60 },
      ],
      secret_code: "VIP",
      is_hidden: true,
      sales_start: "2026-12-01T15:00:00.000Z",
      description: "Mesa cerca de la tarima",
    });
  });

  it("per-tier questions → one event field per label (first appearance order) + per-tier id lists", () => {
    const ig = newQuestionDraft({ label: " Instagram ", placeholder: " @usuario " });
    const mesa = newQuestionDraft({ label: "Mesa", type: "number", required: false });
    const vip = tier({ name: "VIP", questions: [mesa, ig] });
    const gen = tier({ name: "General", questions: [copyQuestion(ig)] });
    const free = tier({ name: "Free" });
    let n = 0;
    const p = buildCreateEventPayload(validForm({ tiers: [vip, gen, free] }), "org-1", () => `f${++n}`);
    expect(p.event.registration_form_config).toEqual([
      { id: "f1", label: "Mesa", type: "number", required: false },
      { id: "f2", label: "Instagram", type: "text", required: true, placeholder: "@usuario" },
    ]);
    expect(p.ticket_tiers.map((t) => t.registration_form_fields)).toEqual([["f1", "f2"], ["f2"], []]);
  });

  it("drops questions entirely when the event has no RSVP", () => {
    const t = tier({ questions: [newQuestionDraft({ label: "Instagram" })] });
    const p = buildCreateEventPayload(validForm({ requiresRsvp: false, tiers: [t] }), "org-1");
    expect(p.event.registration_form_config).toBeUndefined();
    expect("registration_form_fields" in p.ticket_tiers[0]).toBe(false);
    expect(p.event.requires_rsvp).toBe(false);
  });
});
