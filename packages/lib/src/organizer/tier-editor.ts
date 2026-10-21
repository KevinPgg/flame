/**
 * Organizer tier editor (v2): one tier at a time, from the event's Tiers tab.
 *
 * Same draft model and field rules as the create form (event-form.ts) plus what only exists
 * once tickets are on sale: sold counts (spots / stages can't go below them), sold-out switch,
 * existing stages (ids kept so the stage RPC updates instead of re-creating), and the
 * registration questions, which live once per event and are picked per tier.
 *
 * Server: POST/PATCH /api/ticket-tiers (+ PATCH /api/events for new questions).
 */
import { utcToLocal } from "../utils/timezone";
import type { FormField } from "../types/registration-form";
import {
  QUESTION_LABEL_MAX,
  QUESTION_PLACEHOLDER_MAX,
  draftKey,
  newTierDraft,
  parseIntInput,
  parsePriceInput,
  questionId,
  toUtc,
  validateTierFields,
  type EventFormErrors,
  type QuestionDraft,
  type TierDraft,
  tierSecretCode,
} from "./event-form";

export interface EditorStage {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  sold_quantity?: number | null;
  order_index?: number | null;
  description?: string | null;
}

export interface EditorTier {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold?: number | null;
  quantity_reserved?: number | null;
  per_user_limit?: number | null;
  sales_start?: string | null;
  sales_end?: string | null;
  secret_code?: string | null;
  description?: string | null;
  is_hidden?: boolean | null;
  is_manually_sold_out?: boolean | null;
  registration_form_fields?: string[] | null;
  ticket_stages?: EditorStage[] | null;
}

export interface EditorEvent {
  id: string;
  ends_at: string;
  timezone?: string | null;
  requires_rsvp?: boolean | null;
  registration_form_config?: FormField[] | null;
  ticket_tiers?: EditorTier[] | null;
}

export interface TierEditorState {
  draft: TierDraft;
  soldOut: boolean;
}

const tzOf = (e: Pick<EditorEvent, "timezone">) => e.timezone || "America/Guayaquil";
const money = (cents: number) => {
  const s = (cents / 100).toFixed(2);
  return s.endsWith(".00") ? s.slice(0, -3) : s;
};
const labelKey = (l: string) => l.trim().toLowerCase();

/** The event's questions organizers can still pick (archived ones only stay for old answers). */
export function activeEventFields(event: Pick<EditorEvent, "registration_form_config">): FormField[] {
  return Array.isArray(event.registration_form_config) ? event.registration_form_config.filter((f) => f && !f.archived) : [];
}

const questionFromField = (f: FormField): QuestionDraft => ({
  key: draftKey("q"),
  label: f.label,
  placeholder: f.placeholder ?? "",
  type: f.type,
  required: f.required === true,
  fieldId: f.id,
});

/** Questions this tier asks today: `null` = every active event question (v1 semantics). */
export function tierQuestions(tier: Pick<EditorTier, "registration_form_fields">, event: EditorEvent): QuestionDraft[] {
  const active = activeEventFields(event);
  const ids = tier.registration_form_fields;
  return (ids == null ? active : active.filter((f) => ids.includes(f.id))).map(questionFromField);
}

/** Event questions this tier doesn't ask yet — offered as one-tap chips. */
export function reusableEventQuestions(event: EditorEvent, draft: TierDraft): QuestionDraft[] {
  const have = new Set(draft.questions.map((q) => q.fieldId).filter(Boolean));
  const labels = new Set(draft.questions.map((q) => labelKey(q.label)));
  return activeEventFields(event)
    .filter((f) => !have.has(f.id) && !labels.has(labelKey(f.label)))
    .map(questionFromField);
}

export function tierEditorFromTier(tier: EditorTier, event: EditorEvent): TierEditorState {
  const tz = tzOf(event);
  const stages = [...(tier.ticket_stages ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const salesEnd = tier.sales_end ? utcToLocal(tier.sales_end, tz) : "";
  return {
    draft: {
      key: tier.id,
      name: tier.name,
      price: money(tier.price_cents),
      quantity: String(tier.quantity_total),
      perUserLimit: String(tier.per_user_limit ?? 1),
      accessCode: tier.secret_code ?? "",
      description: tier.description ?? "",
      salesStart: tier.sales_start ? utcToLocal(tier.sales_start, tz) : "",
      // Same instant as the event end → show the "When the event ends" default.
      salesEnd: salesEnd && salesEnd === utcToLocal(event.ends_at, tz) ? "" : salesEnd,
      hidden: tier.is_hidden === true,
      useStages: stages.length > 0,
      stages: stages.map((s) => ({
        key: s.id,
        id: s.id,
        name: s.name,
        price: money(s.price_cents),
        quantity: String(s.quantity),
        sold: s.sold_quantity ?? 0,
        description: s.description ?? null,
      })),
      questions: event.requires_rsvp ? tierQuestions(tier, event) : [],
    },
    soldOut: tier.is_manually_sold_out === true,
  };
}

/** A new tier for an existing event: "Tier N", asks no questions until the organizer adds them. */
export function newTierEditor(name: string): TierEditorState {
  return { draft: { ...newTierDraft(name), key: draftKey("t") }, soldOut: false };
}

export function validateTierEditor(
  state: TierEditorState,
  event: EditorEvent,
  original: EditorTier | null,
  now: Date = new Date(),
): EventFormErrors {
  const e: EventFormErrors = {};
  const t = state.draft;
  validateTierFields(t, { timezone: tzOf(event), eventEndIso: event.ends_at, now, sold: original?.quantity_sold ?? 0 }, e);

  if (event.requires_rsvp) {
    const existing = new Map(activeEventFields(event).map((f) => [labelKey(f.label), f]));
    const inTier = new Set<string>();
    for (const q of t.questions) {
      const qp = `tiers.${t.key}.questions.${q.key}.`;
      const label = q.label.trim();
      const k = labelKey(label);
      if (!label) e[qp + "label"] = "questionLabelRequired";
      else if (label.length > QUESTION_LABEL_MAX) e[qp + "label"] = "questionLabelTooLong";
      else if (inTier.has(k)) e[qp + "label"] = "questionDuplicate";
      else if (!q.fieldId) {
        // A "new" question with an existing label must be that same question.
        const f = existing.get(k);
        if (f && (f.type !== q.type || (f.required === true) !== q.required || (f.placeholder ?? "").trim() !== q.placeholder.trim())) {
          e[qp + "label"] = "questionConflict";
        }
      }
      inTier.add(k);
      if (q.placeholder.length > QUESTION_PLACEHOLDER_MAX) e[qp + "placeholder"] = "questionPlaceholderTooLong";
    }
  }
  return e;
}

export interface TierSavePlan {
  method: "POST" | "PATCH";
  /** Body for /api/ticket-tiers. A PATCH only carries what changed (plus the id). */
  body: Record<string, unknown>;
  changed: boolean;
  /** New event questions: send `eventConfig` (whole config) with PATCH /api/events first. */
  newFields: FormField[];
  eventConfig: FormField[] | null;
  /**
   * Other tiers that ask "every question" (null). Adding a question to the event would silently
   * add it to them too, so they're pinned to today's list first.
   */
  pinTiers: Array<{ id: string; registration_form_fields: string[] }>;
  /** quantity_total being requested (for the force-reduce prompt). */
  quantityTotal: number;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function buildTierSave(
  state: TierEditorState,
  event: EditorEvent,
  original: EditorTier | null,
  newFieldId: () => string = questionId,
): TierSavePlan {
  const t = state.draft;
  const tz = tzOf(event);
  const stages = t.useStages
    ? t.stages.map((s, i) => ({
        ...(s.id ? { id: s.id } : {}),
        name: s.name.trim(),
        price_cents: parsePriceInput(s.price) ?? 0,
        quantity: parseIntInput(s.quantity) ?? 0,
        order_index: i,
        description: s.description ?? null,
      }))
    : null;
  const quantityTotal = stages ? stages.reduce((n, s) => n + s.quantity, 0) : parseIntInput(t.quantity) ?? 0;
  const description = t.description.trim();

  // Questions → field ids, creating event fields for new labels.
  const active = activeEventFields(event);
  const byLabel = new Map(active.map((f) => [labelKey(f.label), f.id]));
  const newFields: FormField[] = [];
  const fieldIds: string[] = [];
  if (event.requires_rsvp) {
    for (const q of t.questions) {
      let id = q.fieldId ?? byLabel.get(labelKey(q.label));
      if (!id) {
        id = newFieldId();
        byLabel.set(labelKey(q.label), id);
        const placeholder = q.placeholder.trim();
        newFields.push({ id, label: q.label.trim(), type: q.type, required: q.required, ...(placeholder ? { placeholder } : {}) });
      }
      if (!fieldIds.includes(id)) fieldIds.push(id);
    }
  }
  const activeIds = active.map((f) => f.id);
  let formFields: string[] | null | undefined;
  if (event.requires_rsvp) {
    if (original) {
      const before = original.registration_form_fields == null ? activeIds : original.registration_form_fields.filter((id) => activeIds.includes(id));
      const unchanged = newFields.length === 0 && sameList(before, fieldIds);
      formFields = unchanged ? undefined : fieldIds;
    } else if (active.length > 0 || fieldIds.length > 0) {
      formFields = fieldIds;
    }
  }

  const full: Record<string, unknown> = {
    name: t.name.trim(),
    per_user_limit: parseIntInput(t.perUserLimit) ?? 1,
    sales_start: t.salesStart ? toUtc(t.salesStart, tz) : null,
    sales_end: t.salesEnd ? toUtc(t.salesEnd, tz) : event.ends_at,
    secret_code: tierSecretCode(t),
    description: description || null,
    is_hidden: t.hidden,
    is_manually_sold_out: state.soldOut,
    quantity_total: quantityTotal,
    ...(stages ? { useStages: true, stages } : { price_cents: parsePriceInput(t.price) ?? 0 }),
    ...(formFields !== undefined ? { registration_form_fields: formFields } : {}),
  };

  let body: Record<string, unknown>;
  let method: "POST" | "PATCH";
  if (!original) {
    method = "POST";
    body = {
      event_id: event.id,
      ...full,
      // The create RPC needs a tier price even for staged tiers: the first stage's.
      price_cents: stages ? stages[0]?.price_cents ?? 0 : full.price_cents,
      useStages: Boolean(stages),
    };
  } else {
    method = "PATCH";
    body = { id: original.id };
    const before: Record<string, unknown> = {
      name: original.name,
      per_user_limit: original.per_user_limit ?? 1,
      sales_start: original.sales_start ?? null,
      sales_end: original.sales_end ?? event.ends_at,
      secret_code: original.secret_code ?? null,
      description: original.description ?? null,
      is_hidden: original.is_hidden === true,
      is_manually_sold_out: original.is_manually_sold_out === true,
      quantity_total: original.quantity_total,
      price_cents: original.price_cents,
    };
    const sameValue = (k: string, v: unknown) => {
      const b = before[k];
      if ((k === "sales_start" || k === "sales_end") && typeof v === "string" && typeof b === "string") {
        return Math.floor(new Date(v).getTime() / 60_000) === Math.floor(new Date(b).getTime() / 60_000);
      }
      return b === v;
    };
    for (const [k, v] of Object.entries(full)) {
      if (k === "stages" || k === "useStages" || k === "registration_form_fields") continue;
      if (!sameValue(k, v)) body[k] = v;
    }
    if (stages) {
      const was = [...(original.ticket_stages ?? [])]
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((s, i) => ({ id: s.id, name: s.name, price_cents: s.price_cents, quantity: s.quantity, order_index: i, description: s.description ?? null }));
      if (JSON.stringify(was) !== JSON.stringify(stages)) {
        body.useStages = true;
        body.stages = stages;
        body.quantity_total = quantityTotal; // the API checks it against sold + reserved
      }
    }
    if (formFields !== undefined) body.registration_form_fields = formFields;
  }

  const pinTiers =
    newFields.length > 0
      ? (event.ticket_tiers ?? [])
          .filter((x) => x.id !== original?.id && x.registration_form_fields == null)
          .map((x) => ({ id: x.id, registration_form_fields: activeIds }))
      : [];

  return {
    method,
    body,
    changed: method === "POST" || Object.keys(body).length > 1,
    newFields,
    eventConfig: newFields.length > 0 ? [...(event.registration_form_config ?? []), ...newFields] : null,
    pinTiers,
    quantityTotal,
  };
}

/** Force-reduce is only offered for simple tiers: on staged tiers it would desync stages and total. */
export function canForceReduce(state: TierEditorState, original: EditorTier | null): boolean {
  return Boolean(original) && !state.draft.useStages;
}
