import { randomUUID } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { resolveDbUserFromClerkId } from "@/app/lib/auth";
import { ARTIST_PHOTO_MAX_BYTES, ARTIST_PHOTO_TYPES, downloadImage, sourcePhotoUrl, type PhotoSource } from "@/app/lib/artist-photo";

/**
 * Artist photo for the line-up (fase 4.3, 2026-11-02). Works before the event exists (create
 * form), so it hangs from the organization, not the event:
 *   storage event-images/artists/<organizationId>/<uuid>.<ext>
 *
 * - multipart: organizationId + file (jpeg/png/webp ≤ 5 MB; the clients send a square ~600 px)
 * - JSON: { organizationId, source: "spotify" | "soundcloud", url } → the picture of that
 *   profile, copied into our storage (no hot-linking: the event page doesn't break if the
 *   source changes it)
 * → { photo_url }. Members of the organization except viewers.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const db = supabaseAdmin;

  const isForm = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  let organizationId = "";
  let file: File | null = null;
  let source: PhotoSource | null = null;
  let link = "";
  try {
    if (isForm) {
      const form = await req.formData();
      organizationId = String(form.get("organizationId") ?? "");
      const f = form.get("file");
      // A form field is either a string or a file. `instanceof File` breaks when the File class of
      // the runtime differs from the one that parsed the form (jsdom tests), so check the shape.
      file = f && typeof f !== "string" ? (f as File) : null;
    } else {
      const body = (await req.json()) as { organizationId?: unknown; source?: unknown; url?: unknown };
      organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
      source = body.source === "spotify" || body.source === "soundcloud" ? body.source : null;
      link = typeof body.url === "string" ? body.url : "";
    }
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  if (!UUID.test(organizationId)) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  if (isForm ? !file : !source || !link) return NextResponse.json({ error: "Send a file, or a source and its link" }, { status: 400 });

  try {
    const me = await resolveDbUserFromClerkId(userId);
    const { data: member } = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", me.id)
      .maybeSingle();
    if (!member || member.role === "viewer") return NextResponse.json({ error: "You don't have access to this organization" }, { status: 403 });

    let bytes: Buffer;
    let type: string;
    let ext: string;
    if (file) {
      type = file.type;
      ext = ARTIST_PHOTO_TYPES[type] ?? "";
      if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP image" }, { status: 400 });
      if (file.size > ARTIST_PHOTO_MAX_BYTES) return NextResponse.json({ error: "Image too large (max 5 MB)" }, { status: 400 });
      bytes = Buffer.from(await file.arrayBuffer());
    } else {
      let remote: string | null;
      try {
        remote = await sourcePhotoUrl(source!, link);
      } catch {
        return NextResponse.json({ error: "Couldn't read that profile. Check the link.", code: "SOURCE_UNREACHABLE" }, { status: 422 });
      }
      if (!remote) return NextResponse.json({ error: "That profile has no photo we can use.", code: "NO_PHOTO" }, { status: 422 });
      try {
        ({ bytes, type, ext } = await downloadImage(remote));
      } catch {
        return NextResponse.json({ error: "Couldn't download the photo.", code: "DOWNLOAD_FAILED" }, { status: 422 });
      }
    }

    const path = `artists/${organizationId}/${randomUUID()}.${ext}`;
    const { data, error } = await db.storage.from("event-images").upload(path, bytes, { contentType: type, upsert: false });
    if (error || !data) throw error ?? new Error("upload failed");
    const { data: pub } = db.storage.from("event-images").getPublicUrl(data.path);
    return NextResponse.json({ photo_url: pub.publicUrl });
  } catch (error) {
    console.error("[POST /api/organizer/lineup-photo]", error);
    return NextResponse.json({ error: "Failed to save the photo" }, { status: 500 });
  }
}
