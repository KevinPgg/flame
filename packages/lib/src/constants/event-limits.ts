/** Max distinct ticket tiers per event (create flow, add-tier API, organizer UI). */
export const MAX_TICKET_TIERS_PER_EVENT = 10;

/**
 * Max length for tier-level and per-stage descriptions (W4-C2, May 2026).
 * Enforced by the API Zod schema (`descriptionSchema`) and mirrored by every
 * editor surface (web `TierInlineForm`, mobile `EditTiersTab` / `EditableTierCard`)
 * so the client counter/truncation and server validation never drift.
 */
export const TIER_DESCRIPTION_MAX_LENGTH = 120;
