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
