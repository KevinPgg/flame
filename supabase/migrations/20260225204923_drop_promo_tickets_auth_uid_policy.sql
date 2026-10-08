-- Drop the legacy auth.uid() SELECT policy on promotional_tickets.
--
-- This policy causes a 22P02 (invalid UUID cast) error when evaluated with
-- Clerk JWTs because Clerk user IDs (e.g. "user_abc123") are not UUIDs.
-- PostgreSQL evaluates ALL active SELECT policies with OR, so even though the
-- Clerk-compatible replacement policy exists, the old policy still runs and
-- fails the cast.
--
-- The Clerk-compatible replacement ("Users can view own promotional tickets
-- via clerk_id", using auth.jwt() ->> 'sub') was added in migration
-- 20260225164007 and updated (LOWER email comparison) in 20260225171100.

DROP POLICY IF EXISTS "Users can view their own promotional tickets by email" ON public.promotional_tickets;
