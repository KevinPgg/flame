import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../../lib/auth";
import { buildPromoterBatch, parsePromoterNames, PROMOTER_BATCH_MAX } from "@project-flame/lib";
import { requireEventAccess } from "@/app/lib/utils/event-access";

/**
 * POST - "Paste a list" of promoters (2026-11-02, prototype "Paste a list").
 * Body: { event_id, names: string[] | string }. Codes are generated here (first name + initial of
 * the surname, numbered on clash) against the event's existing codes, so two organizers pasting
 * at once can't hand out the same code. Same access rules as POST /api/organizer/promoter-links.
 * All-or-nothing insert; one retry if a code was taken in between (unique per event → 23505).
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!supabaseAdmin) return NextResponse.json({ error: "Database connection error" }, { status: 500 });
    const db = supabaseAdmin;

    let body: { event_id?: string; names?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { event_id } = body;
    const rawNames = Array.isArray(body.names)
      ? body.names.filter((n): n is string => typeof n === "string").join("\n")
      : typeof body.names === "string"
        ? body.names
        : "";
    const names = parsePromoterNames(rawNames);
    if (!event_id) return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    if (names.length === 0) return NextResponse.json({ error: "Add at least one promoter name" }, { status: 400 });
    if (names.length > PROMOTER_BATCH_MAX) {
      return NextResponse.json({ error: `Up to ${PROMOTER_BATCH_MAX} promoters at a time` }, { status: 400 });
    }

    const currentUser = await resolveDbUserFromClerkId(userId);

    const { data: event } = await db.from("events").select("organization_id").eq("id", event_id).single();
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const { data: membership } = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", event.organization_id)
      .eq("user_id", currentUser.id)
      .single();
    if (!membership) return NextResponse.json({ error: "You don't have access to this event" }, { status: 403 });

    const denied = await requireEventAccess(db, currentUser.id, event_id, event.organization_id);
    if (denied) return denied;

    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: existing, error: readError } = await db
        .from("promoter_links")
        .select("promoter_code")
        .eq("event_id", event_id);
      if (readError) {
        console.error("Error reading promoter codes:", readError);
        return NextResponse.json({ error: "Failed to create promoter links" }, { status: 500 });
      }
      const batch = buildPromoterBatch(
        names,
        (existing ?? []).map((r: { promoter_code: string }) => r.promoter_code)
      );
      const { data: created, error: insertError } = await db
        .from("promoter_links")
        .insert(batch.map((b) => ({ event_id, promoter_code: b.code, promoter_name: b.name, created_by: currentUser.id })))
        .select();
      if (!insertError) {
        return NextResponse.json({
          promoter_links: (created ?? []).map((l: Record<string, unknown>) => ({ ...l, total_tickets_sold: 0, total_revenue_cents: 0 })),
        });
      }
      if (insertError.code !== "23505") {
        console.error("Error creating promoter links:", insertError);
        return NextResponse.json({ error: "Failed to create promoter links" }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "Some codes were taken meanwhile. Try again." }, { status: 409 });
  } catch (error) {
    console.error("Error in POST /api/organizer/promoter-links/bulk:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
