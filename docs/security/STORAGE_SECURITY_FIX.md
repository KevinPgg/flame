# Storage Security Implementation

## Summary

This document outlines the security improvements made to the image upload/delete functionality and explains the necessary Supabase Storage RLS policy changes.

## Frontend Security ✅ IMPLEMENTED

The API routes now include:

1. **Path Validation**:

   - Validates paths start with `events/`
   - Strict regex pattern: `events/[a-z0-9-_]+/[a-z0-9-_]+-poster-(v\d+|\d{13})\.(jpg|jpeg|png|webp|gif)$/i`
   - Supports both timestamp-based (13 digits) and legacy version-based (v1, v2, etc.) filenames
   - Allows multiple image formats (jpg, jpeg, png, webp, gif)
   - Sanitizes slugs to prevent path traversal
   - Defense-in-depth path reconstruction

2. **Authorization**:
   - POST: Verifies user belongs to organization that owns the event
   - DELETE: Verifies user belongs to organization that owns the event
   - Checks: `users` → `organization_members` → `events`

## Backend Security ⚠️ NEEDS MANUAL FIX

### Current Vulnerability

The Supabase Storage policies are too permissive:

```sql
-- CURRENT (INSECURE):
Authenticated users can upload event images (INSERT)
Users can delete event images (DELETE)
Users can update event images (UPDATE)
```

**Problem**: Any authenticated user can bypass the API and directly upload/delete any file in the bucket.

### Recommended Solution

**Option 1: Service Role Only (Recommended)**

Force all modifications through API routes by removing the permissive RLS policies:

```sql
-- Run these commands in Supabase SQL Editor:

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete event images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update event images" ON storage.objects;

-- Keep public read (this is correct)
-- Policy "Anyone can view event images" remains unchanged
```

After this change:

- ✅ Public can still **view** images (required for your app)
- ✅ Only **service role** (your API routes) can upload/delete
- ✅ Authorization is enforced in API routes where you can check organization membership

### Option 2: Complex RLS Policies (More Difficult)

Alternatively, you could create RLS policies that check organization membership directly in Postgres. However, this is complex because:

1. Storage objects don't have direct foreign keys to your tables
2. You'd need to parse the file path to extract the event slug
3. Then join through events → organization_members

Example (complex, not recommended):

```sql
-- This is complex and harder to maintain
CREATE POLICY "Users can upload to their org events"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images'
  AND EXISTS (
    SELECT 1 FROM events e
    JOIN organization_members om ON e.organization_id = om.organization_id
    JOIN users u ON om.user_id = u.id
    WHERE u.clerk_id = auth.jwt() ->> 'sub'
    AND name LIKE 'events/' || e.slug || '/%'
  )
);
```

**Recommendation**: Use Option 1. It's simpler, more secure, and easier to maintain.

## Why Both Layers Matter

1. **Defense in Depth**: Multiple layers of security
2. **Direct Access Prevention**: Users could use Supabase client libraries directly
3. **Service Role Key Protection**: If somehow exposed, RLS still applies
4. **Clearer Authorization Logic**: Complex checks in API code, not SQL

## Implementation Checklist

- [x] Add path validation to DELETE endpoint
- [x] Add authorization checks to POST endpoint
- [x] Add authorization checks to DELETE endpoint
- [ ] **TODO**: Remove permissive storage policies in Supabase dashboard
- [ ] **TODO**: Test that API routes still work (they should, using service role)
- [ ] **TODO**: Test that direct storage access is blocked

## Testing

After removing the policies:

1. **Verify API still works** (should pass):

   ```
   POST /api/upload-image
   DELETE /api/upload-image?path=events/test/test-poster-v1.jpg
   ```

2. **Verify direct access blocked** (should fail):
   ```javascript
   // This should now FAIL for regular users
   const { data, error } = await supabase.storage
     .from("event-images")
     .upload("events/test/hack.jpg", file);
   ```

## Additional Recommendations

1. **Add file size limit** to storage bucket (currently null):

   ```sql
   UPDATE storage.buckets
   SET file_size_limit = 1048576  -- 1MB in bytes
   WHERE id = 'event-images';
   ```

2. **Add allowed MIME types**:

   ```sql
   UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png']
   WHERE id = 'event-images';
   ```

3. **Monitor storage usage**: Set up alerts for unusual upload patterns

## References

- Supabase Storage RLS: https://supabase.com/docs/guides/storage/security/access-control
- Defense in Depth: https://owasp.org/www-community/Defense_in_Depth

