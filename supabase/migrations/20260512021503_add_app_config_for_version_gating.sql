-- ============================================================================
-- App Config — Remote version gating for the mobile app
-- ============================================================================
--
-- A single-row config keyed by `platform_key` (e.g. 'mobile'), storing per-
-- platform version thresholds + App Store URLs as JSONB. The mobile app polls
-- a public web endpoint that reads this row to decide whether to render the
-- hard-block ForceUpdateScreen, the soft UpdateAvailableBanner, or nothing.
--
-- RLS DESIGN — IMPORTANT for future contributors:
--   * Public SELECT (USING (true)) is INTENTIONAL. The endpoint is unauthenticated
--     and public; this is the Supabase-blessed pattern for public-read config
--     (rls_policy_always_true advisor explicitly excludes SELECT policies).
--   * There are NO INSERT/UPDATE/DELETE policies. Service-role writes bypass RLS
--     by default. DO NOT add a write policy — that would let any anon client
--     mutate version-gate values and remotely brick the app.
-- ============================================================================

create table public.app_config (
  platform_key text primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_config is
  'Remote config for native mobile clients (version gating). Public-read RLS; service-role writes only. See docs/guides/EAS_OTA_UPDATES.md "Version Gating".';
comment on column public.app_config.config is
  'JSONB shape: { ios: PlatformConfig, android: PlatformConfig } where PlatformConfig = { minimum_version: string, latest_version: string, store_url: string, force_update_title: string, force_update_message: string, minimum_os_version: string | null }.';

-- Trigger to keep updated_at fresh on every UPDATE.
create or replace function public.update_app_config_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_config_set_updated_at
  before update on public.app_config
  for each row
  execute function public.update_app_config_updated_at();

-- Seed the single mobile row. Initial min == latest == current shipped version (1.0.13)
-- so NO client is gated until you explicitly bump these. store_url uses itms-apps:// for
-- the native App Store handoff (Linking falls back to https:// if missing — rare).
-- minimum_os_version is reserved for future use (schema-stable, client doesn't read it yet).
insert into public.app_config (platform_key, config) values (
  'mobile',
  jsonb_build_object(
    'ios', jsonb_build_object(
      'minimum_version', '1.0.13',
      'latest_version', '1.0.13',
      'store_url', 'itms-apps://apps.apple.com/app/flame/id6761443120',
      'force_update_title', 'Update Flame to continue',
      'force_update_message', 'We''ve made important improvements. Please update to the latest version to keep using Flame.',
      'minimum_os_version', null
    ),
    -- Android: schema-only today. App is iOS-only; gate can't fire on Android
    -- because there is no Android binary in the field. We seed store_url with
    -- a configurable Play Store placeholder anyway so the CTA has a valid
    -- target if Android ships before this row is updated. Operator MUST
    -- replace YOUR_ANDROID_PACKAGE_NAME with the real package before
    -- launching Android.
    'android', jsonb_build_object(
      'minimum_version', '1.0.13',
      'latest_version', '1.0.13',
      'store_url', 'https://play.google.com/store/apps/details?id=YOUR_ANDROID_PACKAGE_NAME',
      'force_update_title', 'Update Flame to continue',
      'force_update_message', 'We''ve made important improvements. Please update to the latest version to keep using Flame.',
      'minimum_os_version', null
    )
  )
);

-- Enable RLS + permissive public-read policy. Writes are service-role only (no INSERT/UPDATE/DELETE policy).
alter table public.app_config enable row level security;

create policy "app_config_public_read"
  on public.app_config
  for select
  using (true);
