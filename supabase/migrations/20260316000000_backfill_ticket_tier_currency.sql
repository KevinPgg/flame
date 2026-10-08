-- Backfill ticket_tiers.currency from the parent event's currency.
--
-- Before fix #488 (Mar 16, 2026), ticket tiers were inserted without a
-- currency value and fell back to the DB default ('USD'). For any non-USD
-- event whose tiers were created before the fix, this sets the correct
-- currency so RSVP payments charge in the right currency.
--
-- Safe to run multiple times (idempotent via WHERE clause).
-- Only updates rows where the tier currency doesn't already match the event.

UPDATE ticket_tiers
SET currency = events.currency
FROM events
WHERE ticket_tiers.event_id = events.id
  AND ticket_tiers.currency IS DISTINCT FROM events.currency;
