-- Ensure storage bucket and policies exist
-- This migration fills the gap left by pg_dump which doesn't always capture storage data/policies perfectly

-- 1. Ensure the bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images', 
  'event-images', 
  true, 
  1048576, -- 1MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
) ON CONFLICT (id) DO NOTHING;

-- 2. Ensure the policy exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Anyone can view event images'
    ) THEN
        CREATE POLICY "Anyone can view event images" ON storage.objects
        FOR SELECT
        TO public
        USING (bucket_id = 'event-images');
    END IF;
END $$;
