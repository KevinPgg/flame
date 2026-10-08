-- #70: Set NOT NULL on notifications.read and notifications.created_at
-- #71: Make push_tokens.expo_push_token globally unique

-- =============================================================================
-- 1. Backfill NULLs and add NOT NULL constraints on notifications
-- =============================================================================

UPDATE public.notifications SET read = false WHERE read IS NULL;
UPDATE public.notifications SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE public.notifications
  ALTER COLUMN read SET DEFAULT false,
  ALTER COLUMN read SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

-- =============================================================================
-- 2. Make expo_push_token globally unique
-- Dedupe first: keep the most recently updated row per token, delete the rest.
-- =============================================================================

WITH keep AS (
  SELECT DISTINCT ON (expo_push_token) id
  FROM public.push_tokens
  ORDER BY expo_push_token, (updated_at IS NOT NULL) DESC, updated_at DESC, id DESC
)
DELETE FROM public.push_tokens
WHERE id NOT IN (SELECT id FROM keep);

ALTER TABLE public.push_tokens
  DROP CONSTRAINT IF EXISTS push_tokens_user_id_expo_push_token_key;

ALTER TABLE public.push_tokens
  ADD CONSTRAINT push_tokens_expo_push_token_unique UNIQUE (expo_push_token);
