-- Raise image bucket file_size_limit from 1MB (1048576) to 4.5MB (4718592).
--
-- Rationale: 1MB was too restrictive for modern phone photos and DSLR images;
-- users were unable to upload typical event banners without heavy external
-- compression. 4.5MB matches the Vercel serverless function request body
-- limit, which is the ceiling for the /api/upload-* routes. Going beyond
-- 4.5MB would require refactoring to direct-to-Supabase signed-URL uploads.
--
-- Affected buckets: event-images, organization-images, profile-images.

UPDATE storage.buckets
SET file_size_limit = 4718592 -- 4.5MB in bytes
WHERE id IN ('event-images', 'organization-images', 'profile-images');
