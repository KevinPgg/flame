-- Migration: Add promoter tracking to orders and create promoter_links table
-- Description: Enable tracking of ticket sales attributed to individual promoters via URL parameters

-- Add promoter tracking columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS promoter_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS promoter_user_id UUID REFERENCES users(id);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_orders_promoter_code ON orders(promoter_code);
CREATE INDEX IF NOT EXISTS idx_orders_promoter_user_id ON orders(promoter_user_id);

-- Create promoter_links table to track created links
CREATE TABLE IF NOT EXISTS promoter_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  promoter_code VARCHAR(50) NOT NULL,
  promoter_name VARCHAR(255),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, promoter_code)
);

-- Create indexes for promoter_links
CREATE INDEX IF NOT EXISTS idx_promoter_links_event_id ON promoter_links(event_id);
CREATE INDEX IF NOT EXISTS idx_promoter_links_code ON promoter_links(promoter_code);

-- Add comment explaining the purpose
COMMENT ON COLUMN orders.promoter_code IS 'Tracks which promoter link was used for this purchase';
COMMENT ON COLUMN orders.promoter_user_id IS 'Optional: Links promoter code to a specific user account';
COMMENT ON TABLE promoter_links IS 'Tracks promoter links created by organizers for events';

