-- Flame 2.0 · Editar perfil (2026-11-02, pedido del cliente): Instagram and avatar colour on the
-- person's profile. Name stays in Clerk (updated from our own screen through the Clerk Backend
-- API, the webhook keeps users.first_name/last_name in sync) and the photo stays in
-- users.profile_image_url (POST /api/upload-profile-image). Writes go through the API
-- (/api/me/profile, service role); no new RLS.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_color text;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_instagram_format;
ALTER TABLE public.users ADD CONSTRAINT users_instagram_format
  CHECK (instagram IS NULL OR instagram ~ '^[A-Za-z0-9._]{1,30}$');

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_avatar_color_format;
ALTER TABLE public.users ADD CONSTRAINT users_avatar_color_format
  CHECK (avatar_color IS NULL OR avatar_color ~ '^#[0-9A-Fa-f]{6}$');
