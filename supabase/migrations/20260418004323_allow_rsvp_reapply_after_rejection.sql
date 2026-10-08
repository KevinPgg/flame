-- Allow users to submit a new RSVP after being rejected (or expired).
--
-- Problem: The unconditional UNIQUE (event_id, user_id) constraint on `rsvps`
-- blocks a second insert for the same (event, user) regardless of status. This
-- prevented users whose RSVP was rejected from re-applying (e.g. to fix a typo
-- in their registration form data).
--
-- Solution: Replace the full unique constraint with a partial unique index
-- scoped to "active" statuses only. This mirrors the status filter already
-- used inside `create_rsvp_atomic` (pending / approved / purchased) and keeps
-- the "one active RSVP per user per event" invariant while allowing rejected
-- and expired rows to coexist with a new active attempt.
--
-- No application code changes are required:
--   - `create_rsvp_atomic` already guards against active duplicates and will
--     continue to raise 23505 for pending/approved/purchased conflicts.
--   - Web (EventDetail.tsx) and mobile (event/[id].tsx) already filter the
--     "already RSVP'd" UI gate to pending/approved/issued/checked_in, so a
--     rejected prior RSVP will no longer block the UI either.

ALTER TABLE public.rsvps
  DROP CONSTRAINT IF EXISTS rsvps_event_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS rsvps_one_active_per_user_event
  ON public.rsvps (event_id, user_id)
  WHERE status IN ('pending', 'approved', 'purchased');

COMMENT ON INDEX public.rsvps_one_active_per_user_event IS
  'Enforces one active RSVP per user per event. Rejected/expired rows are excluded so users can re-apply after rejection.';
