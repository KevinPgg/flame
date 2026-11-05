-- W9-L5 (follow-up to 20260827213547): re-seed sold_out_changed_at to the
-- review date rather than updated_at.
--
-- Decision (owner, Aug 27, 2026)
-- -----------------------------
-- The first backfill seeded from `updated_at` as the tightest TRUE upper bound.
-- The owner has instead chosen the **review date** (2026-08-27): these tiers were
-- audited and confirmed sold out today, and the column is being adopted from
-- today forward. Semantics for pre-existing rows therefore become "confirmed
-- manually sold out as of the W9-L5 review", not "the moment the flag flipped".
--
-- What is NOT lost
-- ----------------
-- `updated_at` is deliberately NOT written by this migration. Every row keeps its
-- own last-modified timestamp, so the pre-existing evidence remains queryable --
-- e.g. Nativa "Ladies Promo 2x20" still carries updated_at = 2026-08-11 12:42,
-- which independently corroborated the host's "closed it around Aug 9-12" account
-- (see AUGUST_2026_FIXES.md #1). That analysis is also written up in the
-- changelog, so the finding survives in prose regardless of this column.
--
-- Going forward
-- -------------
-- api/ticket-tiers/route.ts stamps sold_out_changed_at = now() whenever
-- is_manually_sold_out actually changes value, so rows toggled after today carry
-- exact times. Only these pre-existing rows carry the review-date marker.

-- Replay safety
-- -------------
-- The predicate is bounded at the marker so re-running this file can never
-- clobber a genuine post-adoption flip time written by the API. Rows already at
-- the marker match `<=` and are rewritten to the same value, so the statement is
-- idempotent. (Applied 2026-08-27 against a set where every flagged row was NULL
-- or older than the marker, so the bound changed nothing at apply time.)
UPDATE ticket_tiers
SET sold_out_changed_at = TIMESTAMPTZ '2026-08-27 21:32:00+00'  -- review time, UTC
WHERE is_manually_sold_out = true
  AND (
    sold_out_changed_at IS NULL
    OR sold_out_changed_at <= TIMESTAMPTZ '2026-08-27 21:32:00+00'
  );

COMMENT ON COLUMN ticket_tiers.sold_out_changed_at IS
  'When is_manually_sold_out last changed. NULL when the tier is not manually sold out. Rows that existed at the W9-L5 review (2026-08-27) were seeded with that review date -- they mean "confirmed sold out as of the review", NOT the exact flip time; consult updated_at for those rows. Values written after 2026-08-27 are exact. W9-L5.';
