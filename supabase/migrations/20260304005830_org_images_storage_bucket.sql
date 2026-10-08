-- Create organization-images storage bucket for org logos and cover images.
-- Follows the same pattern as event-images: public read, admin-only uploads.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organization-images',
  'organization-images',
  true,
  1048576, -- 1MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'Anyone can view organization images'
    ) THEN
        CREATE POLICY "Anyone can view organization images" ON storage.objects
        FOR SELECT
        TO public
        USING (bucket_id = 'organization-images');
    END IF;
END $$;
