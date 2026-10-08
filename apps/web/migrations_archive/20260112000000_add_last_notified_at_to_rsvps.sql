-- Add last_notified_at field to track payment authorization expiry notifications
-- This prevents duplicate notifications when the cron runs multiple times per day
ALTER TABLE rsvps 
ADD COLUMN IF NOT EXISTS last_notified_at timestamp with time zone;

-- Add index for efficient filtering in the cron job
CREATE INDEX IF NOT EXISTS idx_rsvps_last_notified_at 
ON rsvps(last_notified_at) 
WHERE status = 'pending' AND stripe_payment_intent_id IS NOT NULL;

-- Add comment explaining the field's purpose
COMMENT ON COLUMN rsvps.last_notified_at IS 
'Timestamp of the last payment authorization expiry notification sent to the organizer. Used by the monitor-payment-authorizations cron job to prevent duplicate notifications.';
