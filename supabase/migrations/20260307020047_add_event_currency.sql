ALTER TABLE events
  ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'USD';

COMMENT ON COLUMN events.currency IS 'ISO 4217 currency code. All tiers/stages within this event use this currency.';
