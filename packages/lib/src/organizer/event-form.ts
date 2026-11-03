/**
 * Organizer "create event" form (v2) — pure draft model, validation and API payload.
 *
 * The form keeps raw string inputs (what the user typed) so the UI never fights the
 * keyboard; validation turns them into i18n error keys and `buildCreateEventPayload`
 * turns a valid draft into the exact body POST /api/events accepts.
 *
 * Rules mirror the server (apps/web/app/api/events/route.ts createEventSchema + checks)
 * so the organizer sees the problem next to the field instead of a generic 400.
 */
import { localToUtc, utcToLocal } from "../utils/timezone";
import { canonicalCity } from "../utils/places";
import { normalizeOptionalTicketTierSecretCode } from "../validators/ticket-tier-secret-code";
import { MAX_TICKET_TIERS_PER_EVENT, TIER_DESCRIPTION_MAX_LENGTH } from "../constants/event-limits";
import type { FormField, FormFieldType } from "../types/registration-form";
import {
  draftsFromLineup,
  lineupFromDrafts,
  parseLineup,
  sameLineup,
  validateLineup,
  type ArtistDraft,
  type LineupArtist,
  type LineupErrorKey,
} from "./lineup";


/**
 * The code stored for a tier. A code only reveals a HIDDEN tier on the event page (holds/create
 * and ticket-tiers/unlock ignore it on visible tiers), so a visible tier never keeps one.
 */
export function tierSecretCode(t: { hidden: boolean; accessCode: string }): string | null {
  return t.hidden ? normalizeOptionalTicketTierSecretCode(t.accessCode) : null;
}

export const EVENT_NAME_MAX = 200;
export const EVENT_SLUG_MAX = 100;
export const EVENT_VENUE_MAX = 200;
export const EVENT_CITY_MAX = 100;
export const EVENT_DESCRIPTION_MAX = 520;
export const TIER_NAME_MAX = 100;
export const TIER_ACCESS_CODE_MIN = 3;
export const TIER_ACCESS_CODE_MAX = 200;
export const PER_USER_LIMIT_MAX = 50;
export const QUESTION_LABEL_MAX = 200;
export const QUESTION_PLACEHOLDER_MAX = 200;
/** Picking the start fills the end this many hours later (prototype). */
export const DEFAULT_EVENT_DURATION_HOURS = 5;
/** Server rejects events starting sooner than this. */
export const EVENT_MIN_LEAD_MS = 2 * 60 * 60 * 1000;
/** Same ceiling as "send tickets" custom price: a typo guard ($10,000). */
export const TIER_MAX_PRICE_CENTS = 1_000_000;

export interface StageDraft {
  key: string;
  name: string;
  price: string;
  quantity: string;
  /** Existing stage (tier editor): its id, tickets already sold, and description to keep. */
  id?: string;
  sold?: number;
  description?: string | null;
}

export interface TierDraft {
  key: string;
  name: string;
  /** Used when useStages = false. */
  price: string;
  /** Used when useStages = false. */
  quantity: string;
  perUserLimit: string;
  accessCode: string;
  description: string;
  /** datetime-local in the event timezone; "" = sales open as soon as the event is created. */
  salesStart: string;
  /** datetime-local in the event timezone; "" = when the event ends. */
  salesEnd: string;
  hidden: boolean;
  /** Advanced: price changes as tickets sell (Early Bird → Regular …). */
  useStages: boolean;
  stages: StageDraft[];
  /** Registration form of this tier (only used when the event requires RSVP), in order. */
  questions: QuestionDraft[];
}

export interface QuestionDraft {
  key: string;
  label: string;
  /** Hint inside the box. */
  placeholder: string;
  type: FormFieldType;
  required: boolean;
  /** Tier editor: an existing event question (shared with other tiers, answers on file) — not editable. */
  fieldId?: string;
}

export interface EventFormState {
  name: string;
  slug: string;
  /** Once the organizer edits the link by hand we stop deriving it from the name. */
  slugEdited: boolean;
  venue: string;
  /** Venue picked from Google Places (2026-11-02): its address and place id; "" = typed by hand. */
  venueAddress?: string;
  venuePlaceId?: string;
  city: string;
  startsAt: string;
  endsAt: string;
  description: string;
  requiresRsvp: boolean;
  currency: string;
  timezone: string;
  tiers: TierDraft[];
  /** Fase 4.3: artists (optional; empty rows are ignored). */
  lineup?: ArtistDraft[];
}

export const QUESTION_TYPES: readonly FormFieldType[] = ["text", "email", "number", "date", "checkbox"];

let keySeq = 0;
/** Local, non-persisted key for list items. */
export function draftKey(prefix = "k"): string {
  keySeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${keySeq.toString(36)}`;
}

/** Same shape as v1's RegistrationFormBuilder ids (persisted in registration_form_config). */
export function questionId(): string {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newStageDraft(name = "", price = "", quantity = ""): StageDraft {
  return { key: draftKey("s"), name, price, quantity };
}

export function newTierDraft(name = ""): TierDraft {
  return {
    key: draftKey("t"),
    name,
    price: "",
    quantity: "",
    perUserLimit: "10",
    accessCode: "",
    description: "",
    salesStart: "",
    salesEnd: "",
    hidden: false,
    useStages: false,
    stages: [],
    questions: [],
  };
}

/** Prototype default: a new question is required. */
export function newQuestionDraft(over: Partial<Omit<QuestionDraft, "key">> = {}): QuestionDraft {
  return { key: draftKey("q"), label: "", placeholder: "", type: "text", required: true, ...over };
}

const labelKey = (label: string) => label.trim().toLowerCase();

/**
 * Questions already written in earlier tiers that this tier doesn't have yet (by label),
 * so the organizer can reuse them with one tap instead of retyping.
 */
export function reusableQuestions(tiers: TierDraft[], index: number): QuestionDraft[] {
  const have = new Set(tiers[index]?.questions.map((q) => labelKey(q.label)) ?? []);
  const out: QuestionDraft[] = [];
  for (const t of tiers.slice(0, index)) {
    for (const q of t.questions) {
      const k = labelKey(q.label);
      if (!k || have.has(k)) continue;
      have.add(k);
      out.push(q);
    }
  }
  return out;
}

/** A copy of a question for another tier (new key, same settings). */
export function copyQuestion(q: QuestionDraft): QuestionDraft {
  return { ...q, key: draftKey("q") };
}

/** Move an item of a list by delta (−1 up, +1 down); out-of-range moves return the list unchanged. */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** "2026-12-31T21:00" + 5h → "2027-01-01T02:00" (wall-clock arithmetic, timezone-free). */
export function suggestEnd(startLocal: string, hours = DEFAULT_EVENT_DURATION_HOURS): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(startLocal);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) + hours * 3_600_000);
  return d.toISOString().slice(0, 16);
}

export function emptyEventForm(opts: { currency?: string; timezone?: string; firstTierName?: string } = {}): EventFormState {
  return {
    name: "",
    slug: "",
    slugEdited: false,
    venue: "",
    city: "",
    startsAt: "",
    endsAt: "",
    description: "",
    requiresRsvp: true,
    currency: opts.currency ?? "USD",
    timezone: opts.timezone ?? "America/Guayaquil",
    tiers: [newTierDraft(opts.firstTierName ?? "")],
    lineup: [],
  };
}

/** "Fiesta de Año Nuevo 2027!" → "fiesta-de-ano-nuevo-2027" (server accepts ^[a-z0-9-]+$). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, EVENT_SLUG_MAX)
    .replace(/-$/, "");
}

/** Price input → cents. Accepts "25", "25.5", "25,50", "0" (free). null = not a price. */
export function parsePriceInput(input: string): number | null {
  const raw = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const cents = Math.round(Number.parseFloat(raw) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** Whole number input → int. null = not a whole number. */
export function parseIntInput(input: string): number | null {
  const raw = input.trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Turning stages on for a tier: start from two stages (Early Bird / Regular) that keep the
 * tier's current price and split its quantity, so nothing the organizer typed is lost.
 */
export function defaultStages(tier: TierDraft, names: { first: string; second: string }): StageDraft[] {
  const qty = parseIntInput(tier.quantity);
  const firstQty = qty && qty >= 2 ? Math.floor(qty / 2) : null;
  return [
    newStageDraft(names.first, tier.price, firstQty ? String(firstQty) : ""),
    newStageDraft(names.second, tier.price, firstQty && qty ? String(qty - firstQty) : ""),
  ];
}

/** Total spots of a tier as the organizer typed it (null while incomplete). */
export function tierTotalQuantity(tier: TierDraft): number | null {
  if (!tier.useStages) return parseIntInput(tier.quantity);
  if (tier.stages.length === 0) return null;
  let total = 0;
  for (const s of tier.stages) {
    const q = parseIntInput(s.quantity);
    if (q === null) return null;
    total += q;
  }
  return total;
}

/** Price buyers see first: the tier price, or the first stage's when staged. */
export function tierStartingPriceCents(tier: TierDraft): number | null {
  return parsePriceInput(tier.useStages ? tier.stages[0]?.price ?? "" : tier.price);
}

/** Error keys live under `eventForm.errors.*`. Paths: "name", "tiers.<key>.price", "tiers.<key>.stages.<key>.name", "tiers.<key>.questions.<key>.label" … */
export type EventFormErrorKey =
  "quantityBelowSold" |
  "datesLocked" |
  "tierSalesAfterEnd" |
  "nameRequired" |
  "nameTooLong" |
  "slugRequired" |
  "slugTooLong" |
  "slugInvalid" |
  "venueRequired" |
  "venueTooLong" |
  "cityRequired" |
  "cityTooLong" |
  "descriptionTooLong" |
  "startRequired" |
  "endRequired" |
  "dateInvalid" |
  "startTooSoon" |
  "endBeforeStart" |
  "tiersRequired" |
  "tiersTooMany" |
  "tierNameRequired" |
  "tierNameTooLong" |
  "stagesMin" |
  "stageNameRequired" |
  "stageNameDuplicate" |
  "priceRequired" |
  "priceInvalid" |
  "priceTooHigh" |
  "quantityRequired" |
  "quantityInvalid" |
  "perUserLimitInvalid" |
  "accessCodeTooLong" |
  "accessCodeTooShort" |
  "tierDescriptionTooLong" |
  "salesEndAfterEvent" |
  "salesEndBeforeStart" |
  "questionLabelRequired" |
  "questionLabelTooLong" |
  "questionDuplicate" |
  "questionConflict" |
  "questionPlaceholderTooLong" |
  LineupErrorKey;

export type EventFormErrors = Record<string, EventFormErrorKey>;

function validPrice(input: string): EventFormErrorKey | null {
  if (input.trim() === "") return "priceRequired";
  const cents = parsePriceInput(input);
  if (cents === null) return "priceInvalid";
  if (cents > TIER_MAX_PRICE_CENTS) return "priceTooHigh";
  return null;
}

function validQuantity(input: string): EventFormErrorKey | null {
  if (input.trim() === "") return "quantityRequired";
  const n = parseIntInput(input);
  if (n === null || n < 1) return "quantityInvalid";
  return null;
}

/**
 * The same moment on the viewer's clock, when it differs from the event's: an organizer in Madrid
 * entering 21:00 for a Guayaquil event sees "= 04:00 your time". Returns an ISO instant to format,
 * or null when both clocks read the same (same zone or same offset that day) or input is empty.
 */
export function viewerTimeIfDifferent(local: string, eventTimezone: string, viewerTimezone: string): string | null {
  if (!local || !viewerTimezone || viewerTimezone === eventTimezone) return null;
  const utc = localToUtc(local, eventTimezone);
  if (!utc) return null;
  return utcToLocal(utc, viewerTimezone) === local.slice(0, 16) ? null : utc;
}

/** ISO of a datetime-local value in the event timezone; "" when empty/invalid. */
export function toUtc(local: string, timezone: string): string {
  return local ? localToUtc(local, timezone) : "";
}

/**
 * One tier's own fields (shared by the create form and the tier editor). Error paths are
 * `tiers.<key>.<field>` / `tiers.<key>.stages.<key>.<field>`. Stages that already sold tickets
 * can't go below what they sold (`sold` on the draft).
 */
export function validateTierFields(
  t: TierDraft,
  ctx: { timezone: string; eventEndIso: string; now: Date; sold?: number },
  e: EventFormErrors,
): void {
  const p = `tiers.${t.key}.`;
  const end = ctx.eventEndIso ? new Date(ctx.eventEndIso) : null;
  const tn = t.name.trim();
  if (!tn) e[p + "name"] = "tierNameRequired";
  else if (tn.length > TIER_NAME_MAX) e[p + "name"] = "tierNameTooLong";

  if (t.useStages) {
    if (t.stages.length < 2) e[p + "stages"] = "stagesMin";
    const seen = new Set<string>();
    for (const s of t.stages) {
      const sp = `${p}stages.${s.key}.`;
      const sn = s.name.trim();
      if (!sn) e[sp + "name"] = "stageNameRequired";
      else if (sn.length > TIER_NAME_MAX) e[sp + "name"] = "tierNameTooLong";
      else if (seen.has(sn.toLowerCase())) e[sp + "name"] = "stageNameDuplicate";
      seen.add(sn.toLowerCase());
      const pe = validPrice(s.price);
      if (pe) e[sp + "price"] = pe;
      const qe = validQuantity(s.quantity);
      if (qe) e[sp + "quantity"] = qe;
      else if ((s.sold ?? 0) > 0 && (parseIntInput(s.quantity) ?? 0) < (s.sold ?? 0)) e[sp + "quantity"] = "quantityBelowSold";
    }
  } else {
    const pe = validPrice(t.price);
    if (pe) e[p + "price"] = pe;
    const qe = validQuantity(t.quantity);
    if (qe) e[p + "quantity"] = qe;
    else if ((ctx.sold ?? 0) > 0 && (parseIntInput(t.quantity) ?? 0) < (ctx.sold ?? 0)) e[p + "quantity"] = "quantityBelowSold";
  }

  const limit = parseIntInput(t.perUserLimit);
  if (limit === null || limit < 1 || limit > PER_USER_LIMIT_MAX) e[p + "perUserLimit"] = "perUserLimitInvalid";

  // Access codes only unlock hidden tiers (holds/create, ticket-tiers/unlock): validate them only then.
  if (t.hidden) {
    if (t.accessCode.length > TIER_ACCESS_CODE_MAX) e[p + "accessCode"] = "accessCodeTooLong";
    else {
      const code = normalizeOptionalTicketTierSecretCode(t.accessCode);
      if (code !== null && code.length < TIER_ACCESS_CODE_MIN) e[p + "accessCode"] = "accessCodeTooShort";
    }
  }

  if (t.description.length > TIER_DESCRIPTION_MAX_LENGTH) e[p + "description"] = "tierDescriptionTooLong";

  const salesStartIso = toUtc(t.salesStart, ctx.timezone);
  const salesEndIso = t.salesEnd ? toUtc(t.salesEnd, ctx.timezone) : ctx.eventEndIso;
  if (t.salesStart && !salesStartIso) e[p + "salesStart"] = "dateInvalid";
  if (t.salesEnd && !salesEndIso) e[p + "salesEnd"] = "dateInvalid";
  else if (salesEndIso) {
    const se = new Date(salesEndIso).getTime();
    const ss = salesStartIso ? new Date(salesStartIso).getTime() : ctx.now.getTime();
    if (end && se > end.getTime()) e[p + "salesEnd"] = "salesEndAfterEvent";
    else if (se <= ss) e[p + "salesEnd"] = "salesEndBeforeStart";
  }
}

export function validateEventForm(form: EventFormState, now: Date = new Date()): EventFormErrors {
  const e: EventFormErrors = {};
  const name = form.name.trim();
  if (!name) e.name = "nameRequired";
  else if (name.length > EVENT_NAME_MAX) e.name = "nameTooLong";

  if (!form.slug) e.slug = "slugRequired";
  else if (form.slug.length > EVENT_SLUG_MAX) e.slug = "slugTooLong";
  else if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = "slugInvalid";

  const venue = form.venue.trim();
  if (!venue) e.venue = "venueRequired";
  else if (venue.length > EVENT_VENUE_MAX) e.venue = "venueTooLong";
  const city = form.city.trim();
  if (!city) e.city = "cityRequired";
  else if (city.length > EVENT_CITY_MAX) e.city = "cityTooLong";

  if (form.description.length > EVENT_DESCRIPTION_MAX) e.description = "descriptionTooLong";

  const startIso = toUtc(form.startsAt, form.timezone);
  const endIso = toUtc(form.endsAt, form.timezone);
  const start = startIso ? new Date(startIso) : null;
  const end = endIso ? new Date(endIso) : null;
  if (!form.startsAt) e.startsAt = "startRequired";
  else if (!start) e.startsAt = "dateInvalid";
  else if (start.getTime() < now.getTime() + EVENT_MIN_LEAD_MS) e.startsAt = "startTooSoon";
  if (!form.endsAt) e.endsAt = "endRequired";
  else if (!end) e.endsAt = "dateInvalid";
  else if (start && end.getTime() <= start.getTime()) e.endsAt = "endBeforeStart";

  if (form.tiers.length === 0) e.tiers = "tiersRequired";
  else if (form.tiers.length > MAX_TICKET_TIERS_PER_EVENT) e.tiers = "tiersTooMany";

  for (const t of form.tiers) {
    validateTierFields(t, { timezone: form.timezone, eventEndIso: endIso, now }, e);
  }

  if (form.requiresRsvp) {
    // One event-level field per label: the same label in two tiers must mean the same question.
    const firstByLabel = new Map<string, QuestionDraft>();
    for (const t of form.tiers) {
      const inTier = new Set<string>();
      for (const q of t.questions) {
        const qp = `tiers.${t.key}.questions.${q.key}.`;
        const label = q.label.trim();
        const k = labelKey(label);
        if (!label) e[qp + "label"] = "questionLabelRequired";
        else if (label.length > QUESTION_LABEL_MAX) e[qp + "label"] = "questionLabelTooLong";
        else if (inTier.has(k)) e[qp + "label"] = "questionDuplicate";
        else {
          const first = firstByLabel.get(k);
          if (!first) firstByLabel.set(k, q);
          else if (
            first.type !== q.type ||
            first.required !== q.required ||
            first.placeholder.trim() !== q.placeholder.trim()
          ) {
            e[qp + "label"] = "questionConflict";
          }
        }
        inTier.add(k);
        if (q.placeholder.length > QUESTION_PLACEHOLDER_MAX) e[qp + "placeholder"] = "questionPlaceholderTooLong";
      }
    }
  }
  Object.assign(e, validateLineup(form.lineup ?? []));
  return e;
}

/** Ordered list of error paths, for "jump to the first problem". */
export function firstErrorPath(form: EventFormState, errors: EventFormErrors): string | null {
  const order = ["name", "startsAt", "endsAt", "venue", "city", "description", "tiers"];
  for (const k of order) if (errors[k]) return k;
  for (const t of form.tiers) {
    const hit = Object.keys(errors).find((k) => k.startsWith(`tiers.${t.key}.`));
    if (hit) return hit;
  }
  for (const a of form.lineup ?? []) {
    const hit = Object.keys(errors).find((k) => k.startsWith(`lineup.${a.key}.`));
    if (hit) return hit;
  }
  if (errors.lineup) return "lineup";
  if (errors.slug) return "slug";
  return Object.keys(errors)[0] ?? null;
}

export interface CreateEventPayload {
  event: {
    organization_id: string;
    name: string;
    slug: string;
    city: string;
    venue: string;
    venue_address?: string;
    venue_place_id?: string;
    starts_at: string;
    ends_at: string;
    description?: string;
    status: "published";
    requires_rsvp: boolean;
    currency: string;
    timezone: string;
    registration_form_config?: FormField[];
    lineup?: LineupArtist[];
  };
  ticket_tiers: Array<{
    name: string;
    price_cents: number;
    quantity_total: number;
    per_user_limit: number;
    sales_start: string | null;
    sales_end: string;
    secret_code: string | null;
    useStages: boolean;
    stages?: Array<{ name: string; price_cents: number; quantity: number }>;
    registration_form_fields?: string[] | null;
    is_hidden: boolean;
    description: string | null;
  }>;
}

/** Body for POST /api/events. Call only when validateEventForm returned no errors. */
export function buildCreateEventPayload(
  form: EventFormState,
  organizationId: string,
  newFieldId: () => string = questionId,
): CreateEventPayload {
  const endsAt = toUtc(form.endsAt, form.timezone);
  const description = form.description.trim();

  // Per-tier questions → one event-level field per label (first appearance wins the order),
  // and each tier lists the field ids it asks. [] = this tier asks nothing.
  const fields: FormField[] = [];
  const idByLabel = new Map<string, string>();
  const tierFieldIds = new Map<string, string[]>();
  if (form.requiresRsvp) {
    for (const t of form.tiers) {
      const ids: string[] = [];
      for (const q of t.questions) {
        const k = labelKey(q.label);
        let id = idByLabel.get(k);
        if (!id) {
          id = newFieldId();
          idByLabel.set(k, id);
          const placeholder = q.placeholder.trim();
          fields.push({
            id,
            label: q.label.trim(),
            type: q.type,
            required: q.required,
            ...(placeholder ? { placeholder } : {}),
          });
        }
        if (!ids.includes(id)) ids.push(id);
      }
      tierFieldIds.set(t.key, ids);
    }
  }

  return {
    event: {
      organization_id: organizationId,
      name: form.name.trim(),
      slug: form.slug,
      city: canonicalCity(form.city),
      venue: form.venue.trim(),
      ...(form.venuePlaceId?.trim() ? { venue_place_id: form.venuePlaceId.trim(), venue_address: (form.venueAddress ?? "").trim() } : {}),
      starts_at: toUtc(form.startsAt, form.timezone),
      ends_at: endsAt,
      ...(description ? { description } : {}),
      status: "published",
      requires_rsvp: form.requiresRsvp,
      currency: form.currency,
      timezone: form.timezone,
      ...(fields.length > 0 ? { registration_form_config: fields } : {}),
      ...(lineupFromDrafts(form.lineup ?? []).length > 0 ? { lineup: lineupFromDrafts(form.lineup ?? []) } : {}),
    },
    ticket_tiers: form.tiers.map((t) => {
      const stages = t.useStages
        ? t.stages.map((s) => ({
            name: s.name.trim(),
            price_cents: parsePriceInput(s.price) ?? 0,
            quantity: parseIntInput(s.quantity) ?? 0,
          }))
        : undefined;
      const tierDescription = t.description.trim();
      return {
        name: t.name.trim(),
        price_cents: stages ? stages[0]?.price_cents ?? 0 : parsePriceInput(t.price) ?? 0,
        quantity_total: stages ? stages.reduce((n, s) => n + s.quantity, 0) : parseIntInput(t.quantity) ?? 0,
        per_user_limit: parseIntInput(t.perUserLimit) ?? 1,
        sales_start: t.salesStart ? toUtc(t.salesStart, form.timezone) : null,
        sales_end: t.salesEnd ? toUtc(t.salesEnd, form.timezone) : endsAt,
        secret_code: tierSecretCode(t),
        useStages: t.useStages,
        ...(stages ? { stages } : {}),
        ...(fields.length > 0 ? { registration_form_fields: tierFieldIds.get(t.key) ?? [] } : {}),
        is_hidden: t.hidden,
        description: tierDescription ? tierDescription : null,
      };
    }),
  };
}

// ============================================================================
// EDIT EVENT
// ============================================================================

/**
 * What PATCH /api/events lets an organizer change after publishing. Name, link, currency,
 * timezone and RSVP are fixed by the API; tiers have their own endpoints.
 */
export interface EditEventFormState {
  startsAt: string;
  endsAt: string;
  venue: string;
  /** Google Places pick (2026-11-02); optional so older callers keep working. */
  venueAddress?: string;
  venuePlaceId?: string;
  city: string;
  description: string;
  /** Fase 4.3. Optional so older callers keep working; undefined = line-up not edited here. */
  lineup?: ArtistDraft[];
}

export interface EditableEvent {
  id: string;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  venue_address?: string | null;
  venue_place_id?: string | null;
  city: string | null;
  description: string | null;
  timezone?: string | null;
  ticket_tiers?: Array<{ id: string; name: string; sales_end?: string | null }> | null;
  lineup?: unknown;
}

const eventTimezone = (event: Pick<EditableEvent, "timezone">) => event.timezone || "America/Guayaquil";

/** Form values for an existing event (dates shown in the event's own timezone). */
export function editFormFromEvent(event: EditableEvent): EditEventFormState {
  const tz = eventTimezone(event);
  return {
    startsAt: utcToLocal(event.starts_at, tz),
    endsAt: utcToLocal(event.ends_at, tz),
    venue: event.venue ?? "",
    venueAddress: event.venue_address ?? "",
    venuePlaceId: event.venue_place_id ?? "",
    city: event.city ?? "",
    description: event.description ?? "",
    lineup: draftsFromLineup(event.lineup),
  };
}

/**
 * The API re-checks "starts ≥ now + 2 h" whenever any date is sent, even an unchanged start,
 * so once the event is that close (or running / over) its dates can't be changed at all.
 */
export function datesLocked(event: Pick<EditableEvent, "starts_at">, now: Date = new Date()): boolean {
  return new Date(event.starts_at).getTime() < now.getTime() + EVENT_MIN_LEAD_MS;
}

/** Same minute: the form edits minutes, while stored timestamps may carry seconds. */
const sameInstant = (a: string, b: string) => {
  const x = Math.floor(new Date(a).getTime() / 60_000);
  const y = Math.floor(new Date(b).getTime() / 60_000);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
};

/** Which dates the organizer actually moved (compared as instants, not strings). */
export function changedDates(form: EditEventFormState, event: EditableEvent): { starts: boolean; ends: boolean } {
  const tz = eventTimezone(event);
  return {
    starts: !sameInstant(toUtc(form.startsAt, tz), event.starts_at),
    ends: !sameInstant(toUtc(form.endsAt, tz), event.ends_at),
  };
}

/** Tiers whose sales would end after the (new) event end — v1 blocks saving until they're fixed. */
export function tiersSellingPastEnd(event: EditableEvent, endsAtIso: string): Array<{ id: string; name: string }> {
  const end = new Date(endsAtIso).getTime();
  if (!Number.isFinite(end)) return [];
  return (event.ticket_tiers ?? [])
    .filter((t) => t.sales_end && new Date(t.sales_end).getTime() > end)
    .map((t) => ({ id: t.id, name: t.name }));
}

export function validateEditEventForm(form: EditEventFormState, event: EditableEvent, now: Date = new Date()): EventFormErrors {
  const e: EventFormErrors = {};
  const venue = form.venue.trim();
  if (!venue) e.venue = "venueRequired";
  else if (venue.length > EVENT_VENUE_MAX) e.venue = "venueTooLong";
  const city = form.city.trim();
  if (!city) e.city = "cityRequired";
  else if (city.length > EVENT_CITY_MAX) e.city = "cityTooLong";
  if (form.description.length > EVENT_DESCRIPTION_MAX) e.description = "descriptionTooLong";
  Object.assign(e, validateLineup(form.lineup ?? []));

  const moved = changedDates(form, event);
  if (!moved.starts && !moved.ends) return e;

  if (datesLocked(event, now)) {
    e.startsAt = "datesLocked";
    return e;
  }
  const tz = eventTimezone(event);
  const startIso = toUtc(form.startsAt, tz);
  const endIso = toUtc(form.endsAt, tz);
  if (!form.startsAt) e.startsAt = "startRequired";
  else if (!startIso) e.startsAt = "dateInvalid";
  else if (new Date(startIso).getTime() < now.getTime() + EVENT_MIN_LEAD_MS) e.startsAt = "startTooSoon";
  if (!form.endsAt) e.endsAt = "endRequired";
  else if (!endIso) e.endsAt = "dateInvalid";
  else if (startIso && new Date(endIso).getTime() <= new Date(startIso).getTime()) e.endsAt = "endBeforeStart";
  else if (tiersSellingPastEnd(event, endIso).length > 0) e.endsAt = "tierSalesAfterEnd";
  return e;
}

export interface UpdateEventPayload {
  id: string;
  starts_at?: string;
  ends_at?: string;
  venue?: string;
  /** Sent together with the venue when the place changed; null clears a previous pick. */
  venue_address?: string | null;
  venue_place_id?: string | null;
  city?: string;
  description?: string;
  image_url?: string;
  lineup?: LineupArtist[];
}

/**
 * Body for PATCH /api/events with only what changed. Dates go only when moved (the API
 * e-mails and pushes every ticket holder on a date change, and re-validates the 2-hour rule).
 * `imageUrl`: undefined = flyer untouched, "" = remove it, URL = new flyer.
 */
export function buildUpdateEventPayload(
  form: EditEventFormState,
  event: EditableEvent,
  imageUrl?: string,
): { payload: UpdateEventPayload; datesChanged: boolean; changed: boolean } {
  const tz = eventTimezone(event);
  const payload: UpdateEventPayload = { id: event.id };
  const moved = changedDates(form, event);
  if (moved.starts || moved.ends) {
    // The API compares both against each other: send the pair.
    payload.starts_at = toUtc(form.startsAt, tz);
    payload.ends_at = toUtc(form.endsAt, tz);
  }
  const venue = form.venue.trim();
  if (venue !== (event.venue ?? "")) payload.venue = venue;
  if (form.venuePlaceId !== undefined) {
    const placeId = form.venuePlaceId.trim();
    if (placeId !== (event.venue_place_id ?? "")) {
      payload.venue_place_id = placeId || null;
      payload.venue_address = placeId ? (form.venueAddress ?? "").trim() : null;
    }
  }
  // Only when the person changed it (an old "guayaquil" isn't rewritten just by opening the form).
  if (form.city.trim() !== (event.city ?? "").trim()) payload.city = canonicalCity(form.city);
  const description = form.description.trim();
  if (description !== (event.description ?? "").trim()) payload.description = description;
  if (imageUrl !== undefined) payload.image_url = imageUrl;
  if (form.lineup) {
    const lineup = lineupFromDrafts(form.lineup);
    if (!sameLineup(lineup, parseLineup(event.lineup))) payload.lineup = lineup;
  }
  return {
    payload,
    datesChanged: moved.starts || moved.ends,
    changed: Object.keys(payload).length > 1,
  };
}
