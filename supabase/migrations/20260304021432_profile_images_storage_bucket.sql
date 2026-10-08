-- Create profile-images bucket (public, 1MB limit, image MIME types only)
-- Folder convention: personal/{clerk_id}/ and company/{org_slug}/
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-images', 'profile-images', true, 1048576,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Public read policy (same pattern as event-images and organization-images)
-- No INSERT/UPDATE/DELETE policies: uploads go through API routes with admin client
CREATE POLICY "Anyone can view profile images" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'profile-images');
