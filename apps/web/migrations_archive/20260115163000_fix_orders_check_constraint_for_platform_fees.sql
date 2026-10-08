-- Migration: Update orders check constraint to include platform fees
-- Description: The existing orders_check constraint ensures total_cents = subtotal + fees - discount.
-- However, with the new Stripe Connect pricing model, we have added a 'platform_fee_cents' markup
-- which is part of the total paid by the user. The constraint must be updated to include this field.

ALTER TABLE orders 
DROP CONSTRAINT IF EXISTS orders_check;

ALTER TABLE orders 
ADD CONSTRAINT orders_check 
CHECK (
  total_cents = (
    subtotal_cents + 
    fees_cents + 
    COALESCE(platform_fee_cents, 0) - 
    COALESCE(discount_amount_cents, 0)
  )
);
