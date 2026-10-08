-- Correct legacy non-USD events with markup_fixed_cents=99 to currency-appropriate values.
-- Values from DEFAULT_FIXED_FEE_BY_CURRENCY in packages/lib/src/pricing/constants.ts.
-- Pre-deploy, restored, and staging DBs may contain bad rows; this migration is proactive.
-- Idempotent: safe to run multiple times.

-- MXN: 1800 (MXN 18.00 ≈ $0.99 USD)
UPDATE events SET markup_fixed_cents = 1800 WHERE currency = 'MXN' AND markup_fixed_cents = 99;
-- DOP: 6000 (DOP 60.00 ≈ $0.99 USD)
UPDATE events SET markup_fixed_cents = 6000 WHERE currency = 'DOP' AND markup_fixed_cents = 99;
-- COP: 420000 (COP 4,200 ≈ $0.99 USD)
UPDATE events SET markup_fixed_cents = 420000 WHERE currency = 'COP' AND markup_fixed_cents = 99;
