-- Migration: Fix orders check constraint to account for promotional code discounts
-- Description: Update the check constraint to allow total_cents = subtotal_cents + fees_cents - discount_amount_cents

-- Drop the old constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_check;

-- Add the new constraint that accounts for discounts
ALTER TABLE orders ADD CONSTRAINT orders_check 
  CHECK (total_cents = (subtotal_cents + fees_cents - COALESCE(discount_amount_cents, 0)));

-- Add comment
COMMENT ON CONSTRAINT orders_check ON orders IS 
  'Ensures order total equals subtotal plus fees minus any promotional discount';

