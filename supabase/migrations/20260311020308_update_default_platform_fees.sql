-- Update default platform fees from 12.5% + $0.30 to 10% + $0.99
-- Lower percentage makes Flame more competitive; higher fixed fee maintains revenue on low-price tickets.
ALTER TABLE events ALTER COLUMN markup_percent SET DEFAULT 10;
ALTER TABLE events ALTER COLUMN markup_fixed_cents SET DEFAULT 99;

COMMENT ON COLUMN events.markup_percent IS 'Percentage markup added to base ticket prices (default 10%, changed from 12.5% in Mar 2026). Adjustable per event to modify platform profitability.';
COMMENT ON COLUMN events.markup_fixed_cents IS 'Fixed fee in cents added to each ticket purchase (default 99 cents / $0.99, changed from 30 cents in Mar 2026). Combined with markup_percent to calculate total customer charge.';
