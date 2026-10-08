-- Migration: Add source column to orders table
-- Description: Track the source of orders (e.g., "rsvp", "hold", "direct") for analytics and debugging

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS source TEXT;

-- Add comment explaining the purpose
COMMENT ON COLUMN orders.source IS 'Tracks the source/channel of the order (e.g., "rsvp", "hold", "direct")';

-- Create index for efficient querying by source
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);
