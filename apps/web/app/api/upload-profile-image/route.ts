import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../lib/auth";
import path from "path";

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB (Vercel serverless body limit)

const VALID_IMAGE_TYPES = ["personal", "company"] as const;
type ImageType = (typeof VALID_IMAGE_TYPES)[number];

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const ALLOWED_MIME_TYPES = Object.keys(MIME_TO_EXT);

/** Maps MIME aliases to canonical form for equality checks (e.g. image/jpg → image/jpeg). */
const MIME_ALIAS_TO_CANONICAL: Record<string, string> = {
  "image/jpg": "image/jpeg",
};

function normalizeMimeToCanonical(mime: string): string {
  const lower = mime.toLowerCase();
  return MIME_ALIAS_TO_CANONICAL[lower] ?? lower;
}

/** Magic byte signatures for allowed image types. Detects actual file content to prevent spoofed MIME uploads. */
const IMAGE_SIGNATURES: Array<{ mime: string; check: (buf: Buffer) => boolean }> = [
  // JPEG: FF D8 FF
  { mime: "image/jpeg", check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mime: "image/png",
    check: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  // GIF: 47 49 46 38 37 61 or 47 49 46 38 39 61
  {
    mime: "image/gif",
    check: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61,
  },
  // WebP: RIFF....WEBP (52 49 46 46 ... 57 45 42 50 at offset 8)
  {
    mime: "image/webp",
    check: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

function detectMimeFromBuffer(buffer: Buffer): string | null {
  for (const { mime, check } of IMAGE_SIGNATURES) {
    if (check(buffer)) return mime;
  }
  return null;
}

const VALID_SLUG_PATTERN = /^[a-z0-9-_]+$/;

function getExtensionFromMimeType(mimeType: string): string | null {
  const ext = MIME_TO_EXT[mimeType.toLowerCase()];
  return ext ?? null;
}

function validateAndSanitizeIdentifier(identifier: string): string | null {
  if (!identifier || typeof identifier !== "string") return null;
  const trimmed = identifier.trim();
  if (trimmed.length < 1 || trimmed.length > 200) return null;
  const sanitized = path.basename(trimmed);
  if (sanitized !== trimmed) return null;
  if (sanitized === "." || sanitized === ".." || sanitized.includes(".."))
    return null;
  return sanitized;
}

async function resolveUserFromClerk(
  clerkUserId: string,
): Promise<
  | { ok: true; userId: string; clerkId: string }
  | { ok: false; error: string; status: number }
> {
  if (!supabaseAdmin) {
    return { ok: false, error: "Storage not configured", status: 500 };
  }

  try {
    const dbUser = await resolveDbUserFromClerkId(clerkUserId);
    return { ok: true, userId: dbUser.id, clerkId: clerkUserId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    const status = message === "User not found" ? 404 : 500;
    return { ok: false, error: message, status };
  }
}

async function verifyOrgMembership(
  clerkUserId: string,
  organizationSlug: string,
): Promise<
  { ok: true; orgId: string } | { ok: false; error: string; status: number }
> {
  if (!supabaseAdmin) {
    return { ok: false, error: "Storage not configured", status: 500 };
  }

  const { data: supabaseUser, error: userError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", clerkUserId)
    .maybeSingle();

  if (userError) {
    console.error("[verifyOrgMembership] users query error", {
      clerkUserId,
      organizationSlug,
      action: "verifyOrgMembership",
      error: userError,
    });
    return { ok: false, error: "Database error", status: 500 };
  }
  if (!supabaseUser) {
    return { ok: false, error: "User not found in database", status: 404 };
  }

  const { data: org, error: orgError } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", organizationSlug)
    .maybeSingle();

  if (orgError) {
    console.error("[verifyOrgMembership] organizations query error", {
      clerkUserId,
      organizationSlug,
      action: "verifyOrgMembership",
      error: orgError,
    });
    return { ok: false, error: "Database error", status: 500 };
  }
  if (!org) {
    return { ok: false, error: "Organization not found", status: 404 };
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("id")
    .eq("user_id", supabaseUser.id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (membershipError) {
    console.error("[verifyOrgMembership] organization_members query error", {
      clerkUserId,
      organizationSlug,
      action: "verifyOrgMembership",
      error: membershipError,
    });
    return { ok: false, error: "Database error", status: 500 };
  }
  if (!membership) {
    return {
      ok: false,
      error: "You don't have permission to manage this organization's images",
      status: 403,
    };
  }

  return { ok: true, orgId: org.id };
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
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const rawType = formData.get("type") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!VALID_IMAGE_TYPES.includes(rawType as ImageType)) {
      return NextResponse.json(
        { error: "Invalid image type. Must be 'personal' or 'company'" },
        { status: 400 },
      );
    }
    const imageType = rawType as ImageType;

    const clientMime = file.type;
    const clientMimeLower = clientMime?.toLowerCase();
    if (!clientMime || !ALLOWED_MIME_TYPES.includes(clientMimeLower)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Allowed: image/png, image/jpeg, image/webp, image/gif",
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Image size must be less than 4.5MB" },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const mimeType = detectMimeFromBuffer(buffer);
    if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        {
          error:
            "Invalid file content. File must be a real image (PNG, JPEG, WebP, or GIF).",
        },
        { status: 400 },
      );
    }
    if (normalizeMimeToCanonical(mimeType) !== normalizeMimeToCanonical(clientMime)) {
      return NextResponse.json(
        {
          error:
            "File content does not match declared type. Upload rejected for security.",
        },
        { status: 400 },
      );
    }

    const extension = getExtensionFromMimeType(mimeType);
    if (!extension) {
      return NextResponse.json(
        { error: "Could not determine file extension for MIME type" },
        { status: 400 },
      );
    }
    const timestamp = Date.now();

    if (imageType === "personal") {
      const userResult = await resolveUserFromClerk(userId);
      if (!userResult.ok) {
        return NextResponse.json(
          { error: userResult.error },
          { status: userResult.status },
        );
      }

      const safeClerkId = validateAndSanitizeIdentifier(userResult.clerkId);
      if (!safeClerkId) {
        return NextResponse.json(
          { error: "Invalid user identifier" },
          { status: 400 },
        );
      }

      const filename = `photo-${timestamp}.${extension}`;
      const filePath = `personal/${safeClerkId}/${filename}`;

      const { data, error: uploadError } = await supabaseAdmin.storage
        .from("profile-images")
        .upload(filePath, buffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading personal profile image:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload image" },
          { status: 500 },
        );
      }

      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from("profile-images").getPublicUrl(data.path);

      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({ profile_image_url: publicUrl })
        .eq("id", userResult.userId);

      if (updateError) {
        console.error("Error updating user profile_image_url:", updateError);
        try {
          const { error: removeError } = await supabaseAdmin.storage
            .from("profile-images")
            .remove([data.path]);
          if (removeError) {
            console.error("[upload-profile-image] rollback remove failed", {
              path: data.path,
              action: "rollbackAfterUserUpdateError",
              error: removeError,
            });
          }
        } catch (rollbackErr) {
          console.error("[upload-profile-image] rollback remove threw", {
            path: data.path,
            action: "rollbackAfterUserUpdateError",
            error: rollbackErr,
          });
        }
        return NextResponse.json(
          { error: "Image uploaded but failed to update user record" },
          { status: 500 },
        );
      }

      return NextResponse.json({ url: publicUrl, path: data.path, timestamp });
    }

    // company type
    const rawSlug = formData.get("organizationSlug") as string;
    if (!rawSlug) {
      return NextResponse.json(
        { error: "organizationSlug is required for company images" },
        { status: 400 },
      );
    }

    const orgSlug = rawSlug.trim();
    if (!VALID_SLUG_PATTERN.test(orgSlug) || orgSlug.length > 100) {
      return NextResponse.json(
        { error: "Invalid organization slug" },
        { status: 400 },
      );
    }

    const authResult = await verifyOrgMembership(userId, orgSlug);
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status },
      );
    }

    const filename = `photo-${timestamp}.${extension}`;
    const filePath = `company/${orgSlug}/${filename}`;

    const { data, error: uploadError } = await supabaseAdmin.storage
      .from("profile-images")
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading company profile image:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 },
      );
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("profile-images").getPublicUrl(data.path);

    const { error: updateError } = await supabaseAdmin
      .from("organizations")
      .update({ logo_url: publicUrl })
      .eq("id", authResult.orgId);

    if (updateError) {
      console.error("Error updating organization logo_url:", updateError);
      try {
        const { error: removeError } = await supabaseAdmin.storage
          .from("profile-images")
          .remove([data.path]);
        if (removeError) {
          console.error("[upload-profile-image] rollback remove failed", {
            path: data.path,
            action: "rollbackAfterOrgUpdateError",
            error: removeError,
          });
        }
      } catch (rollbackErr) {
        console.error("[upload-profile-image] rollback remove threw", {
          path: data.path,
          action: "rollbackAfterOrgUpdateError",
          error: rollbackErr,
        });
      }
      return NextResponse.json(
        { error: "Image uploaded but failed to update organization record" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: publicUrl, path: data.path, timestamp });
  } catch (error) {
    console.error("Error in profile image upload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(req.url);
    const rawPath = searchParams.get("path");
    const rawType = searchParams.get("type") as string;

    if (!rawPath) {
      return NextResponse.json({ error: "No path provided" }, { status: 400 });
    }

    if (!VALID_IMAGE_TYPES.includes(rawType as ImageType)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'personal' or 'company'" },
        { status: 400 },
      );
    }
    const imageType = rawType as ImageType;

    if (imageType === "personal") {
      const personalPattern =
        /^personal\/[a-zA-Z0-9_]+\/photo-\d{13}\.(jpg|jpeg|png|webp|gif)$/;
      if (!personalPattern.test(rawPath)) {
        return NextResponse.json(
          { error: "Invalid personal image path format" },
          { status: 400 },
        );
      }

      const pathParts = rawPath.split("/");
      if (pathParts.length !== 3 || pathParts[0] !== "personal") {
        return NextResponse.json(
          { error: "Invalid file path structure" },
          { status: 400 },
        );
      }

      const clerkIdFromPath = pathParts[1];

      const userResult = await resolveUserFromClerk(userId);
      if (!userResult.ok) {
        return NextResponse.json(
          { error: userResult.error },
          { status: userResult.status },
        );
      }

      if (userResult.clerkId !== clerkIdFromPath) {
        return NextResponse.json(
          { error: "You can only delete your own profile image" },
          { status: 403 },
        );
      }

      const safePath = `personal/${clerkIdFromPath}/${path.basename(pathParts[2])}`;

      const { error: deleteError } = await supabaseAdmin.storage
        .from("profile-images")
        .remove([safePath]);

      if (deleteError) {
        console.error("Error deleting personal profile image:", deleteError);
        return NextResponse.json(
          { error: "Failed to delete image" },
          { status: 500 },
        );
      }

      // Only null DB when stored URL matches the deleted path (avoid erasing a newer photo)
      const { data: currentUser, error: currentUserError } = await supabaseAdmin
        .from("users")
        .select("profile_image_url")
        .eq("id", userResult.userId)
        .maybeSingle();

      if (currentUserError) {
        console.error("[upload-profile-image] read-after-delete users query error", {
          userId: userResult.userId,
          action: "deleteProfileImage",
          error: currentUserError,
        });
        return NextResponse.json(
          { error: "Database error" },
          { status: 500 },
        );
      }

      let storedPath: string | null = null;
      if (currentUser?.profile_image_url) {
        try {
          const parts = new URL(currentUser.profile_image_url).pathname.split(
            "/object/public/profile-images/",
          );
          storedPath = parts.length >= 2 ? (parts.pop() ?? null) : null;
        } catch {
          /* malformed URL — skip DB update */
        }
      }

      if (storedPath === safePath) {
        const { error: updateError } = await supabaseAdmin
          .from("users")
          .update({ profile_image_url: null })
          .eq("id", userResult.userId);

        if (updateError) {
          console.error("Error clearing user profile_image_url:", updateError);
          return NextResponse.json(
            { error: "Image deleted but failed to update user record" },
            { status: 500 },
          );
        }
      }

      return NextResponse.json({ success: true });
    }

    // company type
    const companyPattern =
      /^company\/[a-z0-9-_]+\/photo-\d{13}\.(jpg|jpeg|png|webp|gif)$/;
    if (!companyPattern.test(rawPath)) {
      return NextResponse.json(
        { error: "Invalid company image path format" },
        { status: 400 },
      );
    }

    const pathParts = rawPath.split("/");
    if (pathParts.length !== 3 || pathParts[0] !== "company") {
      return NextResponse.json(
        { error: "Invalid file path structure" },
        { status: 400 },
      );
    }

    const slugFromPath = pathParts[1];
    if (!VALID_SLUG_PATTERN.test(slugFromPath)) {
      return NextResponse.json(
        { error: "Invalid organization slug in path" },
        { status: 400 },
      );
    }

    const authResult = await verifyOrgMembership(userId, slugFromPath);
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status },
      );
    }

    const safePath = `company/${slugFromPath}/${path.basename(pathParts[2])}`;

    const { error: deleteError } = await supabaseAdmin.storage
      .from("profile-images")
      .remove([safePath]);

    if (deleteError) {
      console.error("Error deleting company profile image:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete image" },
        { status: 500 },
      );
    }

    // Only null DB when stored URL matches the deleted path (avoid erasing a newer logo)
    const { data: currentOrg, error: currentOrgError } = await supabaseAdmin
      .from("organizations")
      .select("logo_url")
      .eq("id", authResult.orgId)
      .maybeSingle();

    if (currentOrgError) {
      console.error("[upload-profile-image] read-after-delete organizations query error", {
        orgId: authResult.orgId,
        action: "deleteOrganizationLogo",
        error: currentOrgError,
      });
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    let storedPath: string | null = null;
    if (currentOrg?.logo_url) {
      try {
        const parts = new URL(currentOrg.logo_url).pathname.split(
          "/object/public/profile-images/",
        );
        storedPath = parts.length >= 2 ? (parts.pop() ?? null) : null;
      } catch {
        /* malformed URL — skip DB update */
      }
    }

    if (storedPath === safePath) {
      const { error: updateError } = await supabaseAdmin
        .from("organizations")
        .update({ logo_url: null })
        .eq("id", authResult.orgId);

      if (updateError) {
        console.error("Error clearing organization logo_url:", updateError);
        return NextResponse.json(
          { error: "Image deleted but failed to update organization record" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in profile image deletion:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
