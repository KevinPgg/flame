-- Migration: Add pending RSVP request storage
-- Description: Stores sensitive RSVP details server-side for 3DS redirects

CREATE TABLE IF NOT EXISTS rsvp_pending_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  clerk_user_id text NOT NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_tier_id uuid NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  stage_id uuid NULL REFERENCES ticket_stages(id) ON DELETE SET NULL,
  secret_code text NULL,
  promoter_code text NULL,
  registration_data jsonb NULL
);

-- Index for clerk_user_id lookups
CREATE INDEX IF NOT EXISTS idx_rsvp_pending_requests_clerk_user_id
ON rsvp_pending_requests (clerk_user_id);

-- Index for cleanup job (find expired records)
CREATE INDEX IF NOT EXISTS idx_rsvp_pending_requests_expires_at
ON rsvp_pending_requests (expires_at);

-- Unique composite index to enforce no duplicate pending requests per user/event
-- and optimize lookups during RSVP submission
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_pending_requests_user_event
ON rsvp_pending_requests (clerk_user_id, event_id);

-- Function to clean up expired pending RSVP requests
-- This should be called periodically (e.g., via pg_cron or a scheduled job)
CREATE OR REPLACE FUNCTION cleanup_expired_pending_rsvps()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM rsvp_pending_requests
  WHERE expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % expired pending RSVP requests', deleted_count;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_pending_rsvps() IS 
'Deletes expired pending RSVP requests. Should be run periodically via pg_cron or external scheduler. Returns count of deleted records.';
