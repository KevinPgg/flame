-- Storage Security Fix
--
-- Removes overly permissive RLS policies from the event-images storage bucket
-- to prevent unauthorized file uploads and deletions.
-- The public read policy ("Anyone can view event images") is kept intact.
-- Also enforces file size limit (1MB) and allowed MIME types on the bucket.

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete event images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update event images" ON storage.objects;

-- Enforce bucket constraints for additional security
UPDATE storage.buckets
SET
  file_size_limit = 1048576,  -- 1MB in bytes
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'event-images';
