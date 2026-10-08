-- Flame 2.0 · phase 0 — user language preference (i18n).
-- English is the default (Flame 2.0 ships in English); users can switch to Spanish in Settings.
-- Used by web, mobile, emails and push notifications to pick the language.
-- Existing users get 'en', which matches the language the app shows today.
-- Users can already UPDATE their own row ("Users can update their own profile" policy);
-- the CHECK constraint keeps the value to supported languages.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_language_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_language_check CHECK (language IN ('en', 'es'));
  END IF;
END $$;

COMMENT ON COLUMN public.users.language IS
  'UI language preference: en (default) | es. Keep in sync with SUPPORTED_LANGUAGES in packages/lib/src/i18n.';
