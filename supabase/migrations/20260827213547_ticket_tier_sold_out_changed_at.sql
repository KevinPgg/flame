-- W9-L5: record WHEN a tier was marked manually sold out.
--
-- Problem
-- -------
-- `ticket_tiers` only had `updated_at`, which is the last write to ANY column.
-- Editing a price, capacity or sales window overwrites it, so it cannot date an
-- `is_manually_sold_out` flip. There are no triggers on the table and the only
-- audit tables in the database are payment-scoped (payout_logs,
-- stripe_payment_audit). Organizer-vs-system timing disputes were therefore
-- unanswerable -- see AUGUST_2026_FIXES.md #1 (Nativa: the host reported closing
-- tiers around Aug 9-12; "Ladies Promo 2x20" still corroborated that with
-- updated_at = Aug 11 12:42, but "Pre Sale" had been touched again on Aug 27 and
-- its evidence was gone).
--
-- Change
-- ------
-- Add a dedicated, purpose-built timestamp that only moves when the sold-out
-- flag itself changes.
--
-- Backfill
-- --------
-- Existing rows are seeded from `updated_at` rather than now(). `updated_at` is
-- the tightest TRUE bound we have: the flip happened at or before it. Seeding
-- with now() would have been strictly worse -- it discards real evidence (the
-- Aug 11 signal above) and implies every tier was closed more recently than it
-- actually was. Backfilled values are therefore UPPER BOUNDS, not exact times;
-- only values written after this migration are exact.
--
-- Rows with is_manually_sold_out = false/NULL are left NULL: the column means
-- "when was it marked sold out", so "not marked" must read as NULL, not as a
-- date.

ALTER TABLE ticket_tiers
  ADD COLUMN IF NOT EXISTS sold_out_changed_at timestamptz;

COMMENT ON COLUMN ticket_tiers.sold_out_changed_at IS
  'When is_manually_sold_out last changed. NULL when the tier is not manually sold out. Rows existing before migration 20260827214500 were backfilled from updated_at and are UPPER BOUNDS (the flip happened at or before this), not exact times. W9-L5.';

-- Seed only the currently-flagged tiers.
UPDATE ticket_tiers
SET sold_out_changed_at = updated_at
WHERE is_manually_sold_out = true
  AND sold_out_changed_at IS NULL;

-- Partial index: every lookup is "when was this closed" on closed tiers only.
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_sold_out_changed_at
  ON ticket_tiers (sold_out_changed_at)
  WHERE is_manually_sold_out = true;
