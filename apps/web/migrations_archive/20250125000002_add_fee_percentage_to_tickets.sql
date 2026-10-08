-- Migration: Add fee_percentage column to track the service fee percentage used for each ticket/RSVP/order
-- This eliminates the need to guess/compute which fee percentage (7% or 10%) was used
-- and makes it easier to support variable fee percentages in the future

-- Add fee_percentage to ticket_tiers (nullable for backward compatibility, defaults to 7% for new records)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_tiers' AND column_name = 'fee_percentage'
  ) THEN
    ALTER TABLE ticket_tiers ADD COLUMN fee_percentage NUMERIC(5,2);
    
    -- Set default for existing records based on creation date
    -- Records created before Nov 8, 2025 likely used 10%, newer ones use 7%
    UPDATE ticket_tiers
    SET fee_percentage = CASE 
      WHEN created_at < '2025-11-08T00:00:00Z' THEN 10.00
      ELSE 7.00
    END
    WHERE fee_percentage IS NULL;
    
    -- Add comment
    COMMENT ON COLUMN ticket_tiers.fee_percentage IS 'Service fee percentage used when calculating the ticket price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at tier creation time.';
  END IF;
END $$;

-- Add fee_percentage to ticket_stages (nullable for backward compatibility, defaults to 7% for new records)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_stages' AND column_name = 'fee_percentage'
  ) THEN
    ALTER TABLE ticket_stages ADD COLUMN fee_percentage NUMERIC(5,2);
    
    -- Set default for existing records based on creation date
    UPDATE ticket_stages
    SET fee_percentage = CASE 
      WHEN created_at < '2025-11-08T00:00:00Z' THEN 10.00
      ELSE 7.00
    END
    WHERE fee_percentage IS NULL;
    
    -- Add comment
    COMMENT ON COLUMN ticket_stages.fee_percentage IS 'Service fee percentage used when calculating the stage price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at stage creation time.';
  END IF;
END $$;

-- Add fee_percentage to rsvps (nullable for backward compatibility)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rsvps' AND column_name = 'fee_percentage'
  ) THEN
    ALTER TABLE rsvps ADD COLUMN fee_percentage NUMERIC(5,2);
    
    -- Set default for existing records based on creation date
    UPDATE rsvps
    SET fee_percentage = CASE 
      WHEN requested_at < '2025-11-08T00:00:00Z' OR (requested_at IS NULL AND created_at < '2025-11-08T00:00:00Z') THEN 10.00
      ELSE 7.00
    END
    WHERE fee_percentage IS NULL;
    
    -- Add comment
    COMMENT ON COLUMN rsvps.fee_percentage IS 'Service fee percentage used when calculating the RSVP price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at RSVP creation time.';
  END IF;
END $$;

-- Add fee_percentage to holds (nullable for backward compatibility)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'holds' AND column_name = 'fee_percentage'
  ) THEN
    ALTER TABLE holds ADD COLUMN fee_percentage NUMERIC(5,2);
    
    -- Set default for existing records based on creation date
    UPDATE holds
    SET fee_percentage = CASE 
      WHEN created_at < '2025-11-08T00:00:00Z' THEN 10.00
      ELSE 7.00
    END
    WHERE fee_percentage IS NULL;
    
    -- Add comment
    COMMENT ON COLUMN holds.fee_percentage IS 'Service fee percentage used when calculating the hold price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at hold creation time.';
  END IF;
END $$;

-- Add fee_percentage to orders (nullable for backward compatibility)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'fee_percentage'
  ) THEN
    ALTER TABLE orders ADD COLUMN fee_percentage NUMERIC(5,2);
    
    -- Set default for existing records based on creation date
    UPDATE orders
    SET fee_percentage = CASE 
      WHEN created_at < '2025-11-08T00:00:00Z' THEN 10.00
      ELSE 7.00
    END
    WHERE fee_percentage IS NULL;
    
    -- Add comment
    COMMENT ON COLUMN orders.fee_percentage IS 'Service fee percentage used when calculating the order price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at order creation time.';
  END IF;
END $$;

-- Add indexes for better query performance (optional but helpful)
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_fee_percentage ON ticket_tiers(fee_percentage);
CREATE INDEX IF NOT EXISTS idx_ticket_stages_fee_percentage ON ticket_stages(fee_percentage);
CREATE INDEX IF NOT EXISTS idx_rsvps_fee_percentage ON rsvps(fee_percentage);
CREATE INDEX IF NOT EXISTS idx_holds_fee_percentage ON holds(fee_percentage);
CREATE INDEX IF NOT EXISTS idx_orders_fee_percentage ON orders(fee_percentage);

