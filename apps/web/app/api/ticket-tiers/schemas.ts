import { z } from "zod";
import {
  normalizeTicketTierSecretCode,
  TIER_DESCRIPTION_MAX_LENGTH,
} from "@project-flame/lib";

/**
 * Zod schemas for `/api/ticket-tiers` create/update payloads.
 *
 * Extracted from `route.ts` so they can be exercised in unit tests without
 * spinning up the full Next.js request handler. Keep the schemas in this file
 * and import from `route.ts`; do not duplicate.
 */

// W4-C2 (May 2026): 120-char cap on tier + stage descriptions, applied
// consistently across both API routes (`/api/ticket-tiers`, `/api/events`)
// and both editor surfaces (web TierInlineForm, mobile EditTiersTab /
// EditableTierCard) so client and server agree. The constant lives in
// `@project-flame/lib` (single source of truth); re-exported here so existing
// importers of this schemas module keep working.
export { TIER_DESCRIPTION_MAX_LENGTH };

const descriptionSchema = z
  .string()
  .max(
    TIER_DESCRIPTION_MAX_LENGTH,
    `Description must be ${TIER_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
  )
  .nullable()
  .optional();

export const stageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Stage name is required").max(100),
  price_cents: z.number().int().min(0),
  quantity: z.number().int().min(1),
  order_index: z.number().int().min(0),
  // W4-C2: optional per-stage description that the attendee surface will show
  // in place of the tier-level description when this stage is active.
  description: descriptionSchema,
});

const secretCodeSchema = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => {
      if (v == null) return true;
      const normalized = normalizeTicketTierSecretCode(v);
      return normalized.length === 0 || normalized.length >= 3;
    },
    { message: "Access code must be at least 3 characters." },
  );

export const createTierSchema = z.object({
  event_id: z.string().uuid(),
  name: z.string().min(1, "Tier name is required").max(100),
  price_cents: z.number().int().min(0),
  quantity_total: z.number().int().min(1),
  per_user_limit: z.number().int().min(1).max(50),
  sales_start: z.string().datetime().optional().nullable(),
  sales_end: z.string().datetime(),
  secret_code: secretCodeSchema,
  useStages: z.boolean().optional(),
  stages: z.array(stageSchema).optional(),
  registration_form_fields: z.array(z.string()).max(50).nullable().optional(),
  // W4-C1 (May 2026): organizer toggles. Both default to false on the DB side
  // so omitting them is safe; we accept them at create time for parity with the
  // edit flow and so future API consumers can pre-set them.
  is_manually_sold_out: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  // W4-C2 (May 2026): tier-level description (column has existed since baseline).
  description: descriptionSchema,
});

export const updateTierSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Tier name is required").max(100).optional(),
  price_cents: z.number().int().min(0).optional(),
  quantity_total: z.number().int().min(1).optional(),
  per_user_limit: z.number().int().min(1).max(50).optional(),
  sales_start: z.string().datetime().nullable().optional(),
  sales_end: z.string().datetime().optional(),
  secret_code: secretCodeSchema,
  tentative_event_start: z.string().datetime().optional(),
  useStages: z.boolean().optional(),
  stages: z.array(stageSchema).optional(),
  registration_form_fields: z.array(z.string()).max(50).nullable().optional(),
  // W4-C1 (May 2026): organizer toggles editable from the tier edit form.
  is_manually_sold_out: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  // W4-C2 (May 2026): tier-level description editable from the tier edit form.
  description: descriptionSchema,
});

export type CreateTierInput = z.infer<typeof createTierSchema>;
export type UpdateTierInput = z.infer<typeof updateTierSchema>;
