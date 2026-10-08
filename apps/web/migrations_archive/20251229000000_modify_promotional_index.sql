-- Migration: Modify promotional tickets index
-- Description: Remove unique constraint on (event_id, email) to allow multiple tickets per user
-- Note: No database-level limit on total tickets per user is enforced here, as the application layer handles request limits.
-- Future limits could be added via triggers or constraints if needed.

-- Remove unique constraint on (event_id, email) for promotional_tickets to allow multiple tickets per user
DROP INDEX IF EXISTS public.idx_promotional_tickets_unique_event_email;

-- Instead, we can add an index on (event_id, email) for performance, but not unique
CREATE INDEX IF NOT EXISTS idx_promotional_tickets_event_email 
ON public.promotional_tickets(event_id, LOWER(email));

-- ROLLBACK INSTRUCTIONS
-- DROP INDEX IF EXISTS public.idx_promotional_tickets_event_email;
-- CREATE UNIQUE INDEX idx_promotional_tickets_unique_event_email 
-- ON public.promotional_tickets(event_id, LOWER(email));
