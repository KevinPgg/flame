# Storage Security Testing Guide

## ✅ Security Implementation Complete

The storage bucket is now properly secured:

- Public READ only
- All modifications require service role (API routes)
- Authorization checks enforce organization membership

## Testing Checklist

### 1. Test Authorized Upload (Should Work ✅)

**Scenario**: Organizer uploads image for their own event

1. Log in as an organizer
2. Navigate to your event in the dashboard
3. Click to upload/edit event image
4. Select an image file (< 4.5MB, JPEG/PNG/WebP/GIF)
5. **Expected**: Image uploads successfully

**What happens behind the scenes**:

```
1. Frontend calls: POST /api/upload-image
2. API validates slug and file
3. API checks: user → organization → event ownership
4. API uses service role to upload
5. Success! ✅
```

### 2. Test Authorized Delete (Should Work ✅)

**Scenario**: Organizer deletes image from their own event

1. Upload an image first (from test #1)
2. Click delete/remove image button
3. **Expected**: Image deletes successfully

**What happens behind the scenes**:

```
1. Frontend calls: DELETE /api/upload-image?path=events/...
2. API validates path format
3. API checks: user → organization → event ownership
4. API uses service role to delete
5. Success! ✅
```

### 3. Test Unauthorized Attempt (Should Fail ❌)

**Scenario**: User tries to manipulate another org's images

**Option A**: Via API (should fail with 403):

```javascript
// In browser console (while logged in as different org)
const formData = new FormData();
formData.append("file", someFile);
formData.append("eventSlug", "other-orgs-event");

fetch("/api/upload-image", {
  method: "POST",
  body: formData,
})
  .then(r => r.json())
  .then(console.log);

// Expected:
// { error: "You don't have permission to upload images for this event" }
// Status: 403
```

**Option B**: Direct Supabase access (should fail with RLS error):

```javascript
// In browser console (open dev tools on your site)
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, ANON_KEY);

// Try to upload directly (bypassing API)
const file = new File(["test"], "hack.jpg", { type: "image/jpeg" });
const { data, error } = await supabase.storage
  .from("event-images")
  .upload("events/hack/test.jpg", file);

console.log("Error:", error);

// Expected:
// Error: "new row violates row-level security policy"
// or "insufficient permissions"
```

### 4. Test Public Read (Should Work ✅)

**Scenario**: Anyone can view event images (even logged out)

1. Log out completely
2. Browse to events page: `/events`
3. **Expected**: Event images load normally
4. Open an event detail page
5. **Expected**: Event poster image displays

**Why this works**:

- Public READ policy allows viewing
- Images are publicly accessible (as intended)
- URLs are in format: `https://[project].supabase.co/storage/v1/object/public/event-images/events/...`

### 5. Test File Constraints (Should Fail ❌)

**Scenario**: Validate file size/type limits

**Test A - File too large**:

```javascript
// Upload a file > 4.5MB
// Expected: API returns 400 "Image size must be less than 4.5MB"
```

**Test B - Wrong file type**:

```javascript
// Try to upload a .txt or .pdf file
// Expected: API returns 400 "File must be an image"
```

**Test C - At bucket level** (if you applied MIME type restrictions):

```javascript
// Try to upload .gif or .webp if not in allowed list
// Expected: Supabase error about invalid MIME type
```

## Quick Smoke Test

Fastest way to verify everything:

1. **As organizer**: Upload an image to one of your events ✅
2. **As organizer**: Delete that image ✅
3. **In console**: Try direct Supabase upload (should fail) ❌
4. **Logged out**: View events page (images load) ✅

If all 4 pass → Security is working! 🎉

## Monitoring

Keep an eye on:

### Supabase Dashboard

- **Storage** → **event-images** bucket
- Check file uploads are only from legitimate events
- No suspicious filenames or paths

### API Logs

```bash
# Look for authorization failures
grep "You don't have permission" logs

# Look for path validation failures
grep "Invalid path" logs
```

### Expected Patterns

**Normal traffic** ✅:

```
POST /api/upload-image → 200 (authorized upload)
DELETE /api/upload-image?path=events/my-event/... → 200 (authorized delete)
GET /events → 200 (public viewing images)
```

**Attack attempts** ❌:

```
POST /api/upload-image (different org's event) → 403
DELETE /api/upload-image?path=../../etc/passwd → 400 (invalid path)
Direct storage.upload() → RLS policy violation
```

## Troubleshooting

### "Failed to upload image"

**Symptoms**: Legitimate uploads failing

**Check**:

1. Is the user actually a member of the organization?
2. Does the event exist with that slug?
3. Check Supabase logs for the actual error
4. Verify service role key is set correctly

**Fix**:

```sql
-- Verify organization membership
SELECT om.*
FROM organization_members om
JOIN users u ON om.user_id = u.id
WHERE u.clerk_id = 'user_xxxxx'
  AND om.organization_id = 'org_id';
```

### Images not loading (blank/404)

**Symptoms**: Event images not displaying

**Check**:

1. Is the bucket public?
2. Is the SELECT policy still active?
3. Are the URLs correct?

**Fix**:

```sql
-- Verify bucket is public
SELECT id, name, public FROM storage.buckets WHERE id = 'event-images';
-- Should show: public = true

-- Verify SELECT policy exists
SELECT policyname FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND cmd = 'SELECT';
-- Should show: "Anyone can view event images"
```

### Service role issues

**Symptoms**: Everything failing, even authorized requests

**Check**: Environment variables

```bash
# .env.local should have:
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_not_anon_key
```

**Warning**: The service role key bypasses RLS. Keep it secret!

## Security Best Practices

✅ **Do**:

- Keep service role key in environment variables only
- Monitor storage usage for anomalies
- Log all upload/delete operations
- Regularly audit organization memberships
- Use HTTPS only

❌ **Don't**:

- Don't expose service role key in frontend code
- Don't disable RLS policies without careful consideration
- Don't allow unauthenticated uploads (even through API)
- Don't trust file extensions alone (validate MIME types)

## Related Files

- API Routes: `app/api/upload-image/route.ts`
- Security Policy: `supabase/fix_storage_policies.sql`
- Documentation: `docs_guides/STORAGE_SECURITY_FIX.md`

## Success Criteria

✅ Security is working correctly when:

1. Authorized users can upload to their events
2. Authorized users can delete from their events
3. Unauthorized users get 403 errors
4. Direct storage manipulation fails with RLS errors
5. Public can view all images
6. File size/type constraints are enforced

---

**Status**: Security implementation complete! 🔒
**Next**: Run the quick smoke test above to verify

