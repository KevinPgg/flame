-- Migration: Fix RSVP discount constraint
-- Description: Ensure discount_amount_cents is non-negative and not null. 
-- This migration applies the constraints that were retroactively added to 20260123000000_add_promo_code_to_rsvps.sql
-- to ensure they are applied to existing databases.

DO $$
BEGIN
    -- 1. Ensure column is NOT NULL
    -- We first update any NULLs to 0 just in case (though default was 0)
    UPDATE public.rsvps SET discount_amount_cents = 0 WHERE discount_amount_cents IS NULL;
    
    ALTER TABLE public.rsvps
    ALTER COLUMN discount_amount_cents SET NOT NULL;

    -- 2. Add non-negative constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'rsvps_discount_amount_cents_nonnegative'
        AND conrelid = 'public.rsvps'::regclass
    ) THEN
        ALTER TABLE public.rsvps
        ADD CONSTRAINT rsvps_discount_amount_cents_nonnegative
        CHECK (discount_amount_cents >= 0);
    END IF;
END $$;
