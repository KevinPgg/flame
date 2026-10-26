import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { mergeNotificationPreferences, notificationPreferencesUpdate } from "@project-flame/lib";
import { supabaseAdmin } from "@/app/lib/supabase/server";

/**
 * The signed-in person's notification preferences (users.notification_preferences) — Flame 2.0
 * Settings (fase 1b.5b). The app used to read and write this row straight from Supabase; now it
 * goes through the API like the rest of v2. Rules in @project-flame/lib (missing = on,
 * "ticket received" always on).
 *
 * GET → { preferences }   PUT { <type>: boolean, … } → { preferences }
 */
async function currentRow(clerkId: string) {
  return supabaseAdmin!.from("users").select("id, notification_preferences").eq("clerk_id", clerkId).maybeSingle();
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const { data, error } = await currentRow(userId);
  if (error) {
    console.error("[GET /api/me/notification-preferences]", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ preferences: mergeNotificationPreferences(data.notification_preferences) });
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const changes = notificationPreferencesUpdate(body);
  if (!changes) return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });

  const { data: row, error: readError } = await currentRow(userId);
  if (readError) {
    console.error("[PUT /api/me/notification-preferences] read", readError);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const preferences = { ...mergeNotificationPreferences(row.notification_preferences), ...changes };
  const { error } = await supabaseAdmin.from("users").update({ notification_preferences: preferences }).eq("id", row.id);
  if (error) {
    console.error("[PUT /api/me/notification-preferences] update", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json({ preferences: mergeNotificationPreferences(preferences) });
}
