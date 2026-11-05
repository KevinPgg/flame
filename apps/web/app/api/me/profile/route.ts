import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { profilePhoto, validateProfile } from "@project-flame/lib";
import { supabaseAdmin } from "@/app/lib/supabase/server";

/**
 * Edit profile (Flame 2.0, 2026-11-02) — our own screen instead of Clerk's:
 *   GET   → { email, first_name, last_name, instagram, avatar_color, photo_url }
 *   PATCH { first_name, last_name, instagram, avatar_color } → same shape
 * The NAME lives in Clerk (it's what sign-in, e-mails from Clerk and the webhook use): it is
 * changed with the Clerk Backend API first, then copied to users at once (the user.updated
 * webhook writes the same value again later). Instagram and avatar colour only exist in users.
 * The photo keeps its own endpoint (POST/DELETE /api/upload-profile-image).
 * If Clerk refuses the name, nothing is saved.
 */
const COLUMNS = "email, first_name, last_name, profile_image_url, instagram, avatar_color";
const BASE_COLUMNS = "email, first_name, last_name, profile_image_url";

type Row = { email: string | null; first_name: string | null; last_name: string | null; profile_image_url: string | null; instagram?: string | null; avatar_color?: string | null };

const shape = (r: Row) => ({
  email: r.email,
  first_name: r.first_name,
  last_name: r.last_name,
  instagram: r.instagram ?? null,
  avatar_color: r.avatar_color ?? null,
  photo_url: profilePhoto(r.profile_image_url),
});

/** Reads the row; before the migration (no instagram/avatar_color yet) falls back to the old columns. */
async function readRow(clerkId: string): Promise<{ row: Row | null; migrated: boolean; error?: unknown }> {
  const db = supabaseAdmin!;
  const full = await db.from("users").select(COLUMNS).eq("clerk_id", clerkId).maybeSingle();
  if (!full.error) return { row: (full.data as Row | null) ?? null, migrated: true };
  if ((full.error as { code?: string }).code !== "42703") return { row: null, migrated: true, error: full.error };
  const base = await db.from("users").select(BASE_COLUMNS).eq("clerk_id", clerkId).maybeSingle();
  if (base.error) return { row: null, migrated: false, error: base.error };
  return { row: (base.data as Row | null) ?? null, migrated: false };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const { row, error } = await readRow(userId);
  if (error) {
    console.error("[GET /api/me/profile]", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(shape(row));
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const v = validateProfile(body);
  if (!v.ok) return NextResponse.json({ error: "Invalid profile", code: "PROFILE_INVALID", fields: v.errors }, { status: 400 });

  const { row, migrated, error } = await readRow(userId);
  if (error) {
    console.error("[PATCH /api/me/profile] read", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const value = v.value;
  const nameChanged = (row.first_name ?? "") !== value.first_name || (row.last_name ?? "") !== (value.last_name ?? "");
  if (nameChanged) {
    try {
      const client = await clerkClient();
      await client.users.updateUser(userId, { firstName: value.first_name, lastName: value.last_name ?? "" });
    } catch (e) {
      console.error("[PATCH /api/me/profile] Clerk updateUser failed", e);
      return NextResponse.json({ error: "We couldn't change your name. Try again.", code: "NAME_NOT_SAVED" }, { status: 502 });
    }
  }

  const update: Record<string, string | null> = { first_name: value.first_name, last_name: value.last_name };
  if (migrated) {
    update.instagram = value.instagram;
    update.avatar_color = value.avatar_color;
  }
  const { data, error: upd } = await supabaseAdmin
    .from("users")
    .update(update)
    .eq("clerk_id", userId)
    .select(migrated ? COLUMNS : BASE_COLUMNS)
    .maybeSingle();
  if (upd || !data) {
    console.error("[PATCH /api/me/profile] update", upd);
    // The name may already be in Clerk; the webhook will copy it. Instagram/colour were not saved.
    return NextResponse.json({ error: "Failed to save", code: "PROFILE_NOT_SAVED" }, { status: 500 });
  }
  return NextResponse.json({ ...shape(data as unknown as Row), ...(migrated ? {} : { pendingMigration: true }) });
}
