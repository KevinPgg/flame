-- Fix: promotional_tickets email RLS comparison is case-sensitive.
--
-- The web route normalizes email to lowercase before querying
-- (normalizedEmail = user.email.toLowerCase()), but the mobile RLS policy
-- uses a direct `=` comparison between promotional_tickets.email and
-- users.email. If the stored emails differ in casing (e.g., "John@Example.com"
-- stored in users vs. "john@example.com" stored in promotional_tickets),
-- the policy blocks the row on mobile even though the web finds it.
--
-- Fix: wrap both sides in LOWER() so the comparison is case-insensitive,
-- matching the web route's normalizedEmail behaviour.

DROP POLICY IF EXISTS "Users can view own promotional tickets via clerk_id" ON public.promotional_tickets;

CREATE POLICY "Users can view own promotional tickets via clerk_id"
ON public.promotional_tickets
FOR SELECT
TO authenticated
USING (
  LOWER(email::text) = LOWER((
    SELECT users.email::text
    FROM public.users
    WHERE users.clerk_id::text = (auth.jwt() ->> 'sub'::text)
  ))
);
