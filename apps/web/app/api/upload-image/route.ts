import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabase/server";
import path from "path";
import { requireEventAccess } from "@/app/lib/utils/event-access";

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB (Vercel serverless body limit)

// Strict validation pattern: only lowercase letters, numbers, hyphens, and underscores
const VALID_SLUG_PATTERN = /^[a-z0-9-_]+$/;

// RFC 4122 UUID (v1–v5). Used to validate the optional `eventId` form field
// and to branch the DELETE handler between UUID-folder and legacy-slug-folder paths.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// MIME type to file extension mapping for supported image types
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Gets the file extension from a MIME type
 * @param mimeType - The MIME type (e.g., "image/jpeg")
 * @returns The file extension (e.g., "jpg") or "jpg" as fallback
 */
function getExtensionFromMimeType(mimeType: string): string {
  return MIME_TO_EXT[mimeType.toLowerCase()] || "jpg";
}

/**
 * Validates and sanitizes an event slug to prevent path traversal attacks
 * @param slug - The slug to validate
 * @returns The sanitized slug or null if invalid
 */
function validateAndSanitizeSlug(slug: string): string | null {
  if (!slug || typeof slug !== "string") {
    return null;
  }

  // Remove any whitespace
  const trimmed = slug.trim();

  // Check length constraints (reasonable limits for a slug)
  if (trimmed.length < 1 || trimmed.length > 100) {
    return null;
  }

  // Validate against strict pattern
  if (!VALID_SLUG_PATTERN.test(trimmed)) {
    return null;
  }

  // Use path.basename to ensure it's just a single directory name
  // This strips any path separators
  const sanitized = path.basename(trimmed);

  // Double-check that basename didn't change the value (no path separators were present)
  if (sanitized !== trimmed) {
    return null;
  }

  // Additional check: reject special directory names
  if (sanitized === "." || sanitized === ".." || sanitized.includes("..")) {
    return null;
  }

  return sanitized;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 500 }
      );
    }

    // Get the form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const rawEventId = formData.get("eventId") as string | null;
    const rawEventSlug = formData.get("eventSlug") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Prefer the UUID event id when clients provide it — it's globally unique,
    // so there is no per-org ambiguity. Older clients may still send only
    // eventSlug; we keep that as a fallback so shipped mobile builds that
    // haven't been updated continue to work. When both are sent, eventId wins.
    //
    // Why id-first matters: slugs are unique per-organization (UNIQUE
    // (organization_id, slug)), NOT globally. The partial unique index
    // events_slug_unique_published only constrains *published* slugs. If a
    // user belongs to two orgs that both have a *draft* with the same slug,
    // a slug-only lookup scoped to those orgs returns two rows and
    // `.maybeSingle()` errors out → 500. Id-based lookup avoids this entirely.
    const eventId =
      rawEventId && UUID_PATTERN.test(rawEventId.trim()) ? rawEventId.trim() : null;

    if (rawEventId && !eventId) {
      return NextResponse.json(
        { error: "Invalid eventId. Must be a UUID." },
        { status: 400 }
      );
    }

    const eventSlug = eventId ? null : validateAndSanitizeSlug(rawEventSlug ?? "");
    if (!eventId && !eventSlug) {
      return NextResponse.json(
        {
          error:
            "Missing event identifier. Provide a valid eventId (UUID) or eventSlug (lowercase letters, numbers, hyphens, and underscores).",
        },
        { status: 400 }
      );
    }

    // AUTHORIZATION: Verify user has permission to upload images for this event
    // Get the Supabase user
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", supabaseUser.id);

    if (membershipError) {
      console.error("Error loading memberships:", membershipError);
      return NextResponse.json(
        { error: "Failed to verify permissions" },
        { status: 500 }
      );
    }

    const orgIds = (memberships ?? []).map(m => m.organization_id);
    if (orgIds.length === 0) {
      return NextResponse.json(
        { error: "You don't have permission to upload images for this event" },
        { status: 403 }
      );
    }

    // Both branches scope to the caller's org memberships so the lookup doubles
    // as the authorization check (defense in depth).
    const baseEventQuery = supabaseAdmin
      .from("events")
      .select("id, organization_id")
      .in("organization_id", orgIds);

    const { data: event, error: eventError } = await (eventId
      ? baseEventQuery.eq("id", eventId).maybeSingle()
      : baseEventQuery.eq("slug", eventSlug!).maybeSingle());

    if (eventError) {
      console.error("Error loading event:", eventError);
      return NextResponse.json(
        { error: "Failed to load event" },
        { status: 500 }
      );
    }

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Role + assignment (2026-10-16): organizers only touch flyers of events assigned to them;
    // owner/admin of the event's organization: any. Before, any member of the org could.
    const denied = await requireEventAccess(supabaseAdmin, supabaseUser.id, event.id, event.organization_id);
    if (denied) return denied;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    // Detect the actual MIME type and derive extension
    const mimeType = file.type || "image/jpeg"; // Fallback to jpeg if type is missing
    const extension = getExtensionFromMimeType(mimeType);

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Image size must be less than 4.5MB" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Use event.id (UUID) for the folder, NOT the slug. Slugs are only unique
    // per-organization (UNIQUE (organization_id, slug)), so two orgs with the
    // same slug would share a storage folder — meaning list() leaks the other
    // org's filenames and, worse, a DELETE with a crafted path could remove
    // another org's file. Event IDs are globally unique so each event gets a
    // strictly isolated folder. Legacy 3:4-era images still live under
    // events/{slug}/... and are handled by the DELETE branch below.
    const timestamp = Date.now();
    const folderPath = `events/${event.id}/`;
    const filename = `${event.id}-poster-${timestamp}.${extension}`;
    const filePath = `${folderPath}${filename}`;

    // Upload to Supabase Storage with detected MIME type
    const { data, error: uploadError } = await supabaseAdmin.storage
      .from("event-images")
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false, // Don't overwrite existing files
      });

    if (uploadError) {
      console.error("Error uploading to storage:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    // Get the public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("event-images").getPublicUrl(data.path);

    return NextResponse.json({
      url: publicUrl,
      path: data.path,
      timestamp,
    });
  } catch (error) {
    console.error("Error in image upload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE endpoint to remove images with authorization
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawPath = searchParams.get("path");

    if (!rawPath) {
      return NextResponse.json({ error: "No path provided" }, { status: 400 });
    }

    // Validate path is within events folder to prevent unauthorized deletion
    if (!rawPath.startsWith("events/")) {
      return NextResponse.json(
        { error: "Invalid path - must be within events folder" },
        { status: 400 }
      );
    }

    // Validate the path to prevent path traversal
    // Two accepted folder identifiers:
    // - Event UUID (new)   : events/{uuid}/{uuid}-poster-{timestamp}.{ext}
    // - Slug (legacy)      : events/{slug}/{slug}-poster-{v{n}|timestamp}.{ext}
    // Legacy format stays accepted because ~20 historical events still have
    // image_urls under events/{slug}/... — see APRIL_2026_FIXES.md.
    // Supports: jpg, jpeg, png, webp, gif
    const pathPattern =
      /^events\/[a-z0-9-_]+\/[a-z0-9-_]+-poster-(v\d+|\d{13})\.(jpg|jpeg|png|webp|gif)$/i;

    if (!pathPattern.test(rawPath)) {
      return NextResponse.json(
        { error: "Invalid file path format" },
        { status: 400 }
      );
    }

    const pathParts = rawPath.split("/");
    if (pathParts.length !== 3 || pathParts[0] !== "events") {
      return NextResponse.json(
        { error: "Invalid file path structure" },
        { status: 400 }
      );
    }

    const folderIdentifier = pathParts[1];
    const isUuidFolder = UUID_PATTERN.test(folderIdentifier);

    // Slug-format identifier still needs sanitization; UUID format is already
    // validated by UUID_PATTERN above.
    if (!isUuidFolder && !validateAndSanitizeSlug(folderIdentifier)) {
      return NextResponse.json(
        { error: "Invalid event identifier in path" },
        { status: 400 }
      );
    }

    // AUTHORIZATION: Verify user has permission to delete this event's images
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", supabaseUser.id);

    if (membershipError) {
      console.error("Error loading memberships:", membershipError);
      return NextResponse.json(
        { error: "Failed to verify permissions" },
        { status: 500 }
      );
    }

    const orgIds = (memberships ?? []).map(m => m.organization_id);
    if (orgIds.length === 0) {
      return NextResponse.json(
        { error: "You don't have permission to delete images for this event" },
        { status: 403 }
      );
    }

    // UUID folder → look up by id (globally unique, strictly isolated).
    // Slug folder → look up by slug scoped to caller's orgs (legacy images).
    const eventQuery = supabaseAdmin
      .from("events")
      .select("id, organization_id")
      .in("organization_id", orgIds);

    const { data: event, error: eventError } = await (isUuidFolder
      ? eventQuery.eq("id", folderIdentifier).maybeSingle()
      : eventQuery.eq("slug", folderIdentifier).maybeSingle());

    if (eventError) {
      console.error("Error loading event:", eventError);
      return NextResponse.json(
        { error: "Failed to load event" },
        { status: 500 }
      );
    }

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Role + assignment (2026-10-16): organizers only touch flyers of events assigned to them;
    // owner/admin of the event's organization: any. Before, any member of the org could.
    const denied = await requireEventAccess(supabaseAdmin, supabaseUser.id, event.id, event.organization_id);
    if (denied) return denied;

    // Reconstruct the path to ensure it's safe (defense in depth)
    const safePath = `events/${folderIdentifier}/${path.basename(pathParts[2])}`;

    // Delete from storage using the validated path
    const { error: deleteError } = await supabaseAdmin.storage
      .from("event-images")
      .remove([safePath]);

    if (deleteError) {
      console.error("Error deleting from storage:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete image" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in image deletion:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
