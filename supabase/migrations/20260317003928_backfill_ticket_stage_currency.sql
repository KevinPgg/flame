-- Backfill ticket_stages.currency from the parent ticket_tier's currency.
--
-- Before fix (Mar 16, 2026), stage inserts in /api/events did not set currency;
-- stages fell back to the DB default ('USD'). For non-USD events whose stages
-- were created before the fix, this sets the correct currency from the tier.
--
-- Safe to run multiple times (idempotent via WHERE clause).
-- Only updates rows where the stage currency doesn't already match the tier.

UPDATE ticket_stages ts
SET currency = tt.currency
FROM ticket_tiers tt
WHERE ts.ticket_tier_id = tt.id
  AND ts.currency IS DISTINCT FROM tt.currency;
