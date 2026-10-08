-- Fix: promotional_tickets SELECT policy for Clerk JWT compatibility.
--
-- The existing policy "Users can view their own promotional tickets by email"
-- uses auth.uid(), which returns a UUID. Clerk JWTs set `sub` to a string
-- like "user_2abc123" (not a UUID), so auth.uid() fails to match.
--
-- This adds a parallel SELECT policy using auth.jwt() ->> 'sub' to match
-- users.clerk_id, consistent with all other user-scoped RLS policies.

CREATE POLICY "Users can view own promotional tickets via clerk_id"
ON "public"."promotional_tickets"
FOR SELECT
TO "authenticated"
USING (
  ("email")::text = (
    SELECT ("users"."email")::text
    FROM "public"."users"
    WHERE ("users"."clerk_id")::text = (auth.jwt() ->> 'sub'::text)
  )
);
