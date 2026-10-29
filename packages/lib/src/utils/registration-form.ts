/**
 * Registration form helpers
 *
 * Single source of truth for "does this form field apply to this tier?".
 *
 * Empty-array semantics are LOAD-BEARING:
 *   - `tierFormFields == null` / `undefined` → tier inherits all non-archived
 *     event-level fields (backward-compatible default).
 *   - `tierFormFields == []`                  → tier collects NO fields.
 *   - `tierFormFields == ["id-a", "id-b"]`     → only those fields apply.
 *
 * The empty-array case differs from how some legacy inline filters treated it
 * (they coerced `[]` to "no filter"). Existing production tiers in this state:
 * 0 rows as of deploy. See plan `per_tier_registration_form_a7c91f08.plan.md`.
 *
 * Used by:
 *   - apps/web/app/api/rsvp/route.ts (server-side validation filter)
 *   - apps/web/app/components/EventDetail.tsx (attendee modal)
 *   - apps/mobile/components/event-details/CheckoutMainSheet.tsx (attendee sheet)
 *
 * Note: the helper filters from the event's `eventFormFields` list. If a tier's
 * `registration_form_fields` contains an ID that no longer exists at the event
 * level (e.g. the field was deleted), the helper silently ignores it. This is
 * intentional — see plan section "Open questions" #2.
 */

import type { FormField } from "../types/registration-form";

export function isFieldVisibleForTier(
  field: Pick<FormField, "id" | "archived">,
  tierFormFields: string[] | null | undefined,
): boolean {
  if (field.archived) return false;
  if (tierFormFields == null) return true;
  return tierFormFields.includes(field.id);
}

export function filterFieldsForTier<T extends Pick<FormField, "id" | "archived">>(
  fields: T[] | null | undefined,
  tierFormFields: string[] | null | undefined,
): T[] {
  if (!fields) return [];
  return fields.filter((f) => isFieldVisibleForTier(f, tierFormFields));
}

/**
 * Narrow `event.registration_form_config` to non-archived fields with a known shape,
 * eliminating `(f: any)` casts at call sites.
 *
 * Use at organizer surfaces that feed the per-tier picker (the picker itself only
 * needs `id` / `label` / `archived` / etc.). Tolerates `null`/`undefined`/non-array
 * config defensively because the column is `jsonb` and historical rows may still
 * carry stale shapes.
 */
export function getActiveEventFormFields<T extends Pick<FormField, "archived">>(
  config: T[] | null | undefined,
): T[] {
  if (!Array.isArray(config)) return [];
  return config.filter((f) => !f.archived);
}

/**
 * RSVP answers per guest (fase 3.4, Kevin 2026-10-28 — "compatible" option). Guest 1 (the person
 * requesting) stays at the top level of `registration_data`, exactly as before, so every existing
 * reader (organizer list, XLSX, approval) keeps working. Guests 2..N go in `_guests`, an array of
 * the same shape. Older clients that don't send `_guests` stay valid.
 */
export const RSVP_GUESTS_KEY = "_guests";

type Answers = Record<string, unknown>;
const isEmptyAnswer = (field: Pick<FormField, "type">, v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (field.type === "checkbox" && !v);

/** Keeps only the form's fields; lists the required ones left empty (labels). */
function checkAnswers(fields: Array<Pick<FormField, "id" | "label" | "required" | "type">>, answers: Answers, prefix = "") {
  const data: Answers = {};
  const missing: string[] = [];
  for (const f of fields) {
    const v = answers[f.id];
    if (f.required && isEmptyAnswer(f, v)) missing.push(`${prefix}${f.label || f.id}`);
    if (v !== undefined && v !== null) data[f.id] = v;
  }
  return { data, missing };
}

/**
 * Validates `registration_data._guests` against the tier's fields for a request of `quantity`
 * guests (including the requester). Returns the cleaned array (or null when not sent) and the
 * problems: wrong count, not a list, or required answers missing ("Guest 2: Full name").
 */
export function validateRsvpGuests(
  fields: Array<Pick<FormField, "id" | "label" | "required" | "type">>,
  registrationData: Answers | null | undefined,
  quantity: number,
): { guests: Answers[] | null; missing: string[]; error: string | null } {
  const raw = registrationData?.[RSVP_GUESTS_KEY];
  if (raw === undefined || raw === null) return { guests: null, missing: [], error: null };
  if (!Array.isArray(raw)) return { guests: null, missing: [], error: "Guest answers must be a list" };
  if (fields.length === 0) return { guests: null, missing: [], error: null };
  if (raw.length !== Math.max(0, quantity - 1)) return { guests: null, missing: [], error: "Guest answers don’t match the number of guests" };
  const guests: Answers[] = [];
  const missing: string[] = [];
  raw.forEach((g, i) => {
    const r = checkAnswers(fields, g && typeof g === "object" ? (g as Answers) : {}, `Guest ${i + 2}: `);
    guests.push(r.data);
    missing.push(...r.missing);
  });
  return { guests, missing, error: null };
}
