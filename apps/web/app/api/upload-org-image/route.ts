import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabase/server";
import path from "path";

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB (Vercel serverless body limit)

const VALID_SLUG_PATTERN = /^[a-z0-9-_]+$/;

const VALID_IMAGE_TYPES = ["logo", "cover"] as const;
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
  { mime: "image/jpeg", check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
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

function getExtensionFromMimeType(mimeType: string): string | null {
  const ext = MIME_TO_EXT[mimeType.toLowerCase()];
  return ext ?? null;
}

function validateAndSanitizeSlug(slug: string): string | null {
  if (!slug || typeof slug !== "string") return null;
  const trimmed = slug.trim();
  if (trimmed.length < 1 || trimmed.length > 100) return null;
  if (!VALID_SLUG_PATTERN.test(trimmed)) return null;
  const sanitized = path.basename(trimmed);
  if (sanitized !== trimmed) return null;
  if (sanitized === "." || sanitized === ".." || sanitized.includes(".."))
    return null;
  return sanitized;
}

async function verifyOrgMembership(
  clerkUserId: string,
  organizationSlug: string,
): Promise<
  | { ok: true; orgId: string }
  | { ok: false; error: string; status: number }
> {
  if (!supabaseAdmin) {
    return { ok: false, error: "Storage not configured", status: 500 };
  }

  const { data: supabaseUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", clerkUserId)
    .single();

  if (!supabaseUser) {
    return { ok: false, error: "User not found in database", status: 404 };
  }

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", organizationSlug)
    .single();

  if (!org) {
    return { ok: false, error: "Organization not found", status: 404 };
  }

  // Owner/admin only — same rule as PATCH /api/organizations/[id] (logo is part of the org
  // profile). Before 2026-10-16 any member, viewers included, could replace or delete it.
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("id, role")
    .eq("user_id", supabaseUser.id)
    .eq("organization_id", org.id)
    .single();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
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
    const rawSlug = formData.get("organizationSlug") as string;
    const rawType = formData.get("type") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const orgSlug = validateAndSanitizeSlug(rawSlug);
    if (!orgSlug) {
      return NextResponse.json(
        { error: "Invalid organization slug" },
        { status: 400 },
      );
    }

    if (!VALID_IMAGE_TYPES.includes(rawType as ImageType)) {
      return NextResponse.json(
        { error: "Invalid image type. Must be 'logo' or 'cover'" },
        { status: 400 },
      );
    }
    const imageType = rawType as ImageType;

    const authResult = await verifyOrgMembership(userId, orgSlug);
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status },
      );
    }

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
    const filename = `${imageType}-${timestamp}.${extension}`;
    const filePath = `organizations/${orgSlug}/${filename}`;

    const { data, error: uploadError } = await supabaseAdmin.storage
      .from("organization-images")
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading org image:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 },
      );
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage
      .from("organization-images")
      .getPublicUrl(data.path);

    const column =
      imageType === "logo" ? "logo_url" : "cover_image_url";
    const { error: updateError } = await supabaseAdmin
      .from("organizations")
      .update({ [column]: publicUrl })
      .eq("id", authResult.orgId);

    if (updateError) {
      console.error("Error updating organization:", updateError);
      const { error: removeError } = await supabaseAdmin.storage
        .from("organization-images")
        .remove([data.path]);
      if (removeError) {
        console.error("Failed to rollback uploaded file after DB error:", removeError);
      }
      return NextResponse.json(
        { error: "Image uploaded but failed to update organization record" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: publicUrl, path: data.path, timestamp });
  } catch (error) {
    console.error("Error in org image upload:", error);
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

    if (!rawPath) {
      return NextResponse.json({ error: "No path provided" }, { status: 400 });
    }

    if (!rawPath.startsWith("organizations/")) {
      return NextResponse.json(
        { error: "Invalid path - must be within organizations folder" },
        { status: 400 },
      );
    }

    const pathPattern =
      /^organizations\/[a-z0-9-_]+\/(logo|cover)-\d{13}\.(jpg|jpeg|png|webp|gif)$/i;
    const pathMatch = pathPattern.exec(rawPath);
    if (!pathMatch) {
      return NextResponse.json(
        { error: "Invalid file path format" },
        { status: 400 },
      );
    }
    const imageTypeFromPath = (pathMatch[1] as string).toLowerCase() as ImageType;

    const pathParts = rawPath.split("/");
    if (pathParts.length !== 3 || pathParts[0] !== "organizations") {
      return NextResponse.json(
        { error: "Invalid file path structure" },
        { status: 400 },
      );
    }

    const slugFromPath = validateAndSanitizeSlug(pathParts[1]);
    if (!slugFromPath) {
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

    const safePath = `organizations/${slugFromPath}/${path.basename(pathParts[2])}`;

    const { error: deleteError } = await supabaseAdmin.storage
      .from("organization-images")
      .remove([safePath]);

    if (deleteError) {
      console.error("Error deleting org image:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete image" },
        { status: 500 },
      );
    }

    const column =
      imageTypeFromPath === "logo" ? "logo_url" : "cover_image_url";
    const { error: updateError } = await supabaseAdmin
      .from("organizations")
      .update({ [column]: null })
      .eq("id", authResult.orgId);

    if (updateError) {
      console.error("Error clearing org image column:", updateError);
      return NextResponse.json(
        { error: "Image deleted from storage but failed to update organization record" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in org image deletion:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
