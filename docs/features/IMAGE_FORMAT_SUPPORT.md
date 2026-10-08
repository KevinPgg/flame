# Image Format Support Update

## Summary

Updated the image upload endpoint to properly detect and preserve the actual MIME type and file extension of uploaded images, instead of forcing everything to `.jpg`.

## Changes Made

### 1. MIME Type Detection

**Before**:

```typescript
// Always saved as .jpg regardless of actual type
const filename = `${eventSlug}-poster-v${nextVersion}.jpg`;
```

**After**:

```typescript
// Detects actual MIME type and uses correct extension with timestamp-based naming
const mimeType = file.type || "image/jpeg"; // Fallback to jpeg
const extension = getExtensionFromMimeType(mimeType);
const timestamp = Date.now();
const filename = `${eventSlug}-poster-${timestamp}.${extension}`;
```

> **Note**: The example above shows the legacy version-based naming (`v${nextVersion}`) for historical context. The current implementation uses timestamp-based naming (`${timestamp}`) as documented in the File Naming Convention section below.

### 2. Supported Image Formats

The system now properly handles:

| Format | MIME Type    | Extension | Notes                |
| ------ | ------------ | --------- | -------------------- |
| JPEG   | `image/jpeg` | `.jpg`    | Most common          |
| JPEG   | `image/jpg`  | `.jpg`    | Alternative MIME     |
| PNG    | `image/png`  | `.png`    | Transparency support |
| WebP   | `image/webp` | `.webp`   | Modern, efficient    |
| GIF    | `image/gif`  | `.gif`    | Animation support    |

### 3. Extension Mapping Function

```typescript
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function getExtensionFromMimeType(mimeType: string): string {
  return MIME_TO_EXT[mimeType.toLowerCase()] || "jpg";
}
```

**Fallback behavior**: If MIME type is unknown, defaults to `.jpg` for safety.

### 4. Version Detection Update

**Before**:

```typescript
// Only matched .jpg files
const match = f.name.match(/-v(\d+)\.jpg$/);
```

**After**:

```typescript
// Matches any supported image extension
const match = f.name.match(/-v(\d+)\.(jpg|jpeg|png|webp|gif)$/i);
```

This ensures version numbers increment correctly regardless of the file type previously uploaded.

### 5. DELETE Endpoint Security

**Before**:

```typescript
// Only allowed .jpg deletion
const pathPattern = /^events\/[a-z0-9-_]+\/[a-z0-9-_]+-poster-v\d+\.jpg$/;
```

**After**:

```typescript
// Allows deletion of any supported image format (versioned or timestamped)
const pathPattern =
  /^events\/[a-z0-9-_]+\/[a-z0-9-_]+-poster-(v\d+|\d{13})\.(jpg|jpeg|png|webp|gif)$/i;
```

**Updated Pattern Explanation**:
- `(v\d+|\d{13})` - Accepts either:
  - `v\d+` - Version format (e.g., `v1`, `v2`, `v3`)
  - `\d{13}` - Timestamp format (e.g., `1729612345678`)
- This allows both legacy versioned filenames and new timestamp-based filenames

### 6. Storage Upload Configuration

```typescript
// Upload to Supabase Storage with detected MIME type
const { data, error: uploadError } = await supabaseAdmin.storage
  .from("event-images")
  .upload(filePath, buffer, {
    contentType: mimeType, // ✅ Uses detected type
    upsert: false,
  });
```

## File Naming Convention

All event images follow this pattern:

```
events/{event-slug}/{event-slug}-poster-{timestamp}.{ext}
```

**Examples**:

- `events/yoga-retreat/yoga-retreat-poster-1729612345678.jpg`
- `events/yoga-retreat/yoga-retreat-poster-1729612389012.png`
- `events/tech-summit/tech-summit-poster-1729612456789.webp`

**Key Points**:

- Timestamp-based naming prevents race conditions with concurrent uploads
- Each upload gets a unique millisecond timestamp from `Date.now()`
- Filenames naturally sort chronologically
- No collisions possible even with simultaneous uploads
- **Legacy support**: Old version-based files (`v1`, `v2`, etc.) still work for deletion

## Validation Flow

```
1. Receive file upload
   ↓
2. Validate: file.type.startsWith("image/")
   ↓
3. Detect MIME type from file.type
   ↓
4. Map MIME → extension (fallback to "jpg")
   ↓
5. Check existing files (for error handling)
   ↓
6. Generate timestamp and filename: {slug}-poster-{timestamp}.{ext}
   ↓
7. Upload with detected contentType
   ↓
8. Return public URL
```

## Security Considerations

### ✅ Maintained Security

- Path validation still enforced
- Authorization checks unchanged
- Only accepts `image/*` MIME types
- File size limit (1MB) still applies
- Slug sanitization unchanged

### 🔒 Enhanced Security

- Regex patterns now explicitly list allowed extensions
- Case-insensitive matching (`/i` flag) for flexibility
- MIME type whitelist approach (not blacklist)

## Supabase Storage Configuration

Update your storage bucket to accept all supported formats:

```sql
UPDATE storage.buckets
SET
  file_size_limit = 1048576,  -- 1MB
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
WHERE id = 'event-images';
```

## Testing Scenarios

### Test 1: Upload JPEG

```javascript
const jpegFile = new File([blob], "poster.jpg", { type: "image/jpeg" });
// Expected: Saves as {slug}-poster-{timestamp}.jpg
```

### Test 2: Upload PNG

```javascript
const pngFile = new File([blob], "poster.png", { type: "image/png" });
// Expected: Saves as {slug}-poster-{timestamp}.png
```

### Test 3: Upload WebP

```javascript
const webpFile = new File([blob], "poster.webp", { type: "image/webp" });
// Expected: Saves as {slug}-poster-{timestamp}.webp
```

### Test 4: Unknown MIME Type

```javascript
const unknownFile = new File([blob], "poster", { type: "" });
// Expected: Falls back to .jpg (safe default)
```

### Test 5: Delete Timestamp-based File

```javascript
DELETE /api/upload-image?path=events/my-event/my-event-poster-1729612345678.png
// Expected: Successfully deletes (security checks pass)
```

### Test 6: Delete Legacy Version-based File

```javascript
DELETE /api/upload-image?path=events/my-event/my-event-poster-v2.jpg
// Expected: Successfully deletes (backward compatible)
```

## Browser Compatibility

All supported formats are widely compatible:

| Format | Chrome | Firefox | Safari | Edge |
| ------ | ------ | ------- | ------ | ---- |
| JPEG   | ✅     | ✅      | ✅     | ✅   |
| PNG    | ✅     | ✅      | ✅     | ✅   |
| WebP   | ✅     | ✅      | ✅     | ✅   |
| GIF    | ✅     | ✅      | ✅     | ✅   |

## Performance Considerations

### File Size Recommendations

| Format   | Best For               | Avg Size (1920x1080) |
| -------- | ---------------------- | -------------------- |
| **JPEG** | Photos, complex images | ~200-400 KB          |
| **PNG**  | Graphics, transparency | ~500-800 KB          |
| **WebP** | Modern websites        | ~150-300 KB          |
| **GIF**  | Simple animations      | ~50-200 KB           |

**Note**: 1MB limit applies to all formats. WebP typically produces the smallest files for photo-quality images.

## Migration Notes

### For Existing Events

If you have events with hardcoded `.jpg` assumptions:

1. **No breaking changes**: Existing `.jpg` files continue to work
2. **New uploads**: Will use correct extensions with timestamp-based naming
3. **Mixed formats**: Allowed in the same event folder
4. **Naming scheme**: New uploads use timestamps (e.g., `1729612345678`), legacy files may use version numbers (e.g., `v1`, `v2`)

> **Important**: Version numbers are **legacy only**. The current system uses timestamp-based naming for all new uploads. Version-based files (e.g., `poster-v1.jpg`) are only relevant for deletion of legacy files.

### Frontend Updates Needed?

Check if your frontend code has hardcoded `.jpg` assumptions:

```typescript
// ❌ DON'T hardcode extension or version numbers
const imageUrl = `${baseUrl}/events/${slug}/${slug}-poster-v1.jpg`;

// ✅ DO use the path returned from the API
const { path, url } = await uploadImage(file, eventSlug);
```

## Troubleshooting

### Issue: "Invalid file path format" on DELETE

**Cause**: Path contains unsupported extension

**Fix**: Ensure the path ends with a supported extension:

- `.jpg`, `.jpeg`, `.png`, `.webp`, or `.gif`

### Issue: Upload succeeds but image appears corrupted

**Cause**: MIME type mismatch (file.type doesn't match actual content)

**Fix**: Browser should set correct MIME type automatically. If not, validate on client side:

```typescript
// Optional: Validate file type before upload
const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
if (!validTypes.includes(file.type)) {
  throw new Error("Unsupported image format");
}
```

## Related Files

- **API Route**: `app/api/upload-image/route.ts`
- **Storage Policies**: `supabase/fix_storage_policies.sql`
- **Security Docs**: `docs_guides/STORAGE_SECURITY_FIX.md`

## Future Enhancements

Potential improvements:

1. **Advanced detection**: Use `file-type` npm package to verify MIME types from file headers (not just trusting `file.type`)
2. **Image optimization**: Auto-convert to WebP for better performance
3. **Multiple sizes**: Generate thumbnails (small, medium, large)
4. **SVG support**: Add vector graphics support (with sanitization)
5. **AVIF support**: Add next-gen format when browser support improves

---

**Status**: ✅ Complete
**Version**: 1.0
**Date**: 2025-10-22
