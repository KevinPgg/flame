-- Backfill existing events still using legacy platform fees (12.5% + $0.30) to new defaults (10% + $0.99).
-- Product-approved: only rows with exact legacy values are updated.
UPDATE events
SET markup_percent = 10, markup_fixed_cents = 99
WHERE markup_percent = 12.5 AND markup_fixed_cents = 30;
