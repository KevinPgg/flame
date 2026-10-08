-- Allow users to re-RSVP after approval, rejection, purchase, or expiry.
-- Previously the partial unique index blocked new RSVPs for any of:
--   pending, approved, purchased
-- Now only "pending" blocks a duplicate so users with an approved (unpaid),
-- purchased, or rejected RSVP can submit a fresh request.
DROP INDEX IF EXISTS rsvps_one_active_per_user_event;

CREATE UNIQUE INDEX rsvps_one_active_per_user_event
  ON public.rsvps USING btree (event_id, user_id)
  WHERE ((status)::text = 'pending'::text);
